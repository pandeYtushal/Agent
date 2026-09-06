import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { GitOperationError } from '../errors/index.js';
import { logger } from '../logger/index.js';

const execAsync = promisify(exec);

export interface GitBranchOptions {
  branchName: string;
  repoPath: string;
}

export class GitManager {
  /**
   * Helper to format standard agent branch names: agent/add-project-<project-slug>
   */
  public formatBranchName(projectSlug: string): string {
    const cleanSlug = projectSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return `agent/add-project-${cleanSlug}`;
  }

  /**
   * Helper to format standard agent commit messages: feat: add <project-name> to portfolio
   */
  public formatCommitMessage(projectName: string): string {
    return `feat: add ${projectName} to portfolio`;
  }

  /**
   * Checks if target path is inside a git repository.
   */
  public async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: path.resolve(repoPath) });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initializes a new Git repository in target path and sets up origin remote.
   */
  public async initializeRepository(repoPath: string, remoteUrl?: string): Promise<void> {
    const cwd = path.resolve(repoPath);
    logger.info(`[GitManager] Initializing git workspace in "${cwd}"`);
    try {
      await execAsync('git init', { cwd });
      try {
        await execAsync('git commit --allow-empty -m "chore: initial portfolio commit"', { cwd });
      } catch {
        // Commit already exists or working tree clean
      }
      if (remoteUrl && remoteUrl.trim() !== '') {
        try {
          await execAsync(`git remote add origin "${remoteUrl}"`, { cwd });
        } catch {
          await execAsync(`git remote set-url origin "${remoteUrl}"`, { cwd });
        }
      }
    } catch (err: any) {
      throw new GitOperationError(`Failed to initialize git repository in ${cwd}: ${err.message}`);
    }
  }

  /**
   * Gets current active branch name.
   */
  public async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: path.resolve(repoPath) });
      return stdout.trim();
    } catch (err: any) {
      throw new GitOperationError(`Failed to get current git branch: ${err.message}`);
    }
  }

  /**
   * Creates and checks out a new branch for the agent. Never modifies main/master directly.
   */
  public async createBranch(options: GitBranchOptions): Promise<void> {
    const cwd = path.resolve(options.repoPath);
    logger.info(`[GitManager] Creating and checking out branch "${options.branchName}" in "${cwd}"`);

    if (options.branchName === 'main' || options.branchName === 'master') {
      throw new GitOperationError('Direct modifications to main/master branches are strictly prohibited by safety policy.');
    }

    try {
      await execAsync(`git checkout -b "${options.branchName}"`, { cwd });
      logger.info(`[GitManager] Switched to branch "${options.branchName}" ✅`);
    } catch (err: any) {
      // If branch already exists, switch to it
      try {
        await execAsync(`git checkout "${options.branchName}"`, { cwd });
        logger.info(`[GitManager] Switched to existing branch "${options.branchName}" ✅`);
      } catch (innerErr: any) {
        try {
          await execAsync(`git checkout --orphan "${options.branchName}"`, { cwd });
          logger.info(`[GitManager] Created orphan branch "${options.branchName}" ✅`);
        } catch {
          throw new GitOperationError(`Failed to create or switch to branch "${options.branchName}": ${innerErr.message}`);
        }
      }
    }
  }

  /**
   * Stages specified files and commits changes with standard commit format.
   */
  public async commitChanges(repoPath: string, message: string, files: string[] = ['.']): Promise<string> {
    const cwd = path.resolve(repoPath);
    logger.info(`[GitManager] Staging files: ${files.join(', ')}`);

    try {
      const fileList = files.map((f) => `"${f}"`).join(' ');
      await execAsync(`git add ${fileList}`, { cwd });

      logger.info(`[GitManager] Committing changes with message: "${message}"`);
      try {
        await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
      } catch (commitErr: any) {
        const combinedOutput = `${commitErr.stdout || ''} ${commitErr.stderr || ''}`;
        if (combinedOutput.includes('nothing to commit') || combinedOutput.includes('working tree clean')) {
          logger.info('[GitManager] Nothing to commit (working tree clean). Returning HEAD commit hash.');
          try {
            const { stdout } = await execAsync('git rev-parse HEAD', { cwd });
            return stdout.trim();
          } catch {
            return '0000000000000000000000000000000000000000';
          }
        }
        throw new GitOperationError(`Git commit failed: ${commitErr.message}`, { stdout: commitErr.stdout, stderr: commitErr.stderr });
      }

      const { stdout } = await execAsync('git rev-parse HEAD', { cwd });
      const commitHash = stdout.trim();
      logger.info(`[GitManager] Commit created successfully [${commitHash.slice(0, 7)}] ✅`);
      return commitHash;
    } catch (err: any) {
      throw new GitOperationError(`Git commit failed: ${err.message}`, { stdout: err.stdout, stderr: err.stderr });
    }
  }

  /**
   * Discards uncommitted local changes and returns to the default branch (main/master).
   * Used as failure rollback. Never creates a new main/master branch.
   */
  public async restoreCleanState(repoPath: string): Promise<void> {
    const cwd = path.resolve(repoPath);
    logger.info(`[GitManager] Restoring clean git state in "${cwd}"`);

    try {
      await execAsync('git reset --hard HEAD', { cwd });
      await execAsync('git clean -fd', { cwd });
    } catch (err: any) {
      logger.warn(`[GitManager] Git reset notice in "${cwd}": ${err.message}`);
    }

    try {
      await execAsync('git checkout main', { cwd });
    } catch {
      try {
        await execAsync('git checkout master', { cwd });
      } catch {
        logger.warn('[GitManager] Could not switch to main/master after reset; remaining on current branch.');
      }
    }
  }

  /**
   * Configures origin remote URL, optionally embedding GITHUB_TOKEN for authenticated HTTPS pushing.
   */
  public async setAuthenticatedRemote(repoPath: string, remoteUrl: string, token?: string): Promise<void> {
    const cwd = path.resolve(repoPath);
    let targetUrl = remoteUrl.trim();
    if (!targetUrl) return;

    if (token && targetUrl.startsWith('https://')) {
      const cleanUrl = targetUrl.replace(/^https:\/\/[^@]+@/, 'https://');
      targetUrl = cleanUrl.replace('https://', `https://${token}@`);
    }

    logger.info(`[GitManager] Setting remote origin in "${cwd}"`);
    try {
      await execAsync(`git remote set-url origin "${targetUrl}"`, { cwd });
    } catch {
      try {
        await execAsync(`git remote add origin "${targetUrl}"`, { cwd });
      } catch (err: any) {
        logger.warn(`[GitManager] Could not set remote origin: ${err.message}`);
      }
    }
  }

  /**
   * Pushes head branch to remote origin safely (without --force).
   */
  public async pushBranch(repoPath: string, branchName: string): Promise<void> {
    const cwd = path.resolve(repoPath);
    logger.info(`[GitManager] Pushing branch "${branchName}" to origin`);

    if (branchName === 'main' || branchName === 'master') {
      throw new GitOperationError('Pushing directly to main/master is strictly prohibited.');
    }

    try {
      await execAsync(`git push -u origin "${branchName}"`, { cwd });
      logger.info(`[GitManager] Branch "${branchName}" pushed successfully to origin ✅`);
    } catch (err: any) {
      throw new GitOperationError(`Failed to push branch "${branchName}" to origin: ${err.message}`, { stdout: err.stdout, stderr: err.stderr });
    }
  }
}
