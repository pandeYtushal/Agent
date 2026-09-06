import path from 'path';
import fs from 'fs/promises';
import { SecurityError, WorkspaceError } from '../errors/index.js';
import { logger } from '../logger/index.js';

const SENSITIVE_FILENAME_REGEX = /^\.env(\..+)?$/i;

export interface WorkspaceOptions {
  rootPath: string;
}

export class WorkspaceManager {
  private rootPath: string;

  constructor(options: WorkspaceOptions) {
    this.rootPath = path.resolve(options.rootPath);
  }

  public getRootPath(): string {
    return this.rootPath;
  }

  /**
   * Checks whether a relative or absolute file path points to a secret/env file.
   */
  public isSecretFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return SENSITIVE_FILENAME_REGEX.test(basename);
  }

  /**
   * Resolves a path safely within the workspace boundaries.
   */
  public resolvePath(relativePath: string): string {
    const absolutePath = path.resolve(this.rootPath, relativePath);
    const relative = path.relative(this.rootPath, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new WorkspaceError(`Directory traversal outside workspace path is forbidden: ${relativePath}`);
    }
    return absolutePath;
  }

  /**
   * Safely reads a file from the workspace, enforcing secret exclusion filters.
   */
  public async readFile(relativePath: string): Promise<string> {
    if (this.isSecretFile(relativePath)) {
      logger.warn(`Security block: Attempted to read secret file "${relativePath}"`);
      throw new SecurityError(`Reading environment secret file "${relativePath}" is prohibited.`);
    }

    const fullPath = this.resolvePath(relativePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      throw new WorkspaceError(`Failed to read file at "${relativePath}"`, { originalError: err });
    }
  }

  /**
   * Safely lists workspace files excluding secret files.
   */
  public async listFiles(subDir: string = '.'): Promise<string[]> {
    const dirPath = this.resolvePath(subDir);
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true, recursive: true });
      const safeFiles: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const relPath = path.relative(this.rootPath, path.join(entry.parentPath || dirPath, entry.name));
          if (!this.isSecretFile(entry.name)) {
            safeFiles.push(relPath);
          } else {
            logger.debug(`Filter excluded secret file from scan: ${relPath}`);
          }
        }
      }

      return safeFiles;
    } catch (err) {
      throw new WorkspaceError(`Failed to list workspace files in "${subDir}"`, { originalError: err });
    }
  }
}
