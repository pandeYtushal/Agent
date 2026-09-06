import fs from 'fs/promises';
import path from 'path';
import { WorkspaceError } from '../errors/index.js';
import { logger } from '../logger/index.js';

export interface ModificationPlan {
  filesToCreate: Array<{ path: string; source?: string }>;
  filesToModify: Array<{ path: string; description: string }>;
  filesToDelete: string[];
}

/**
 * Formats a JavaScript/TypeScript value into clean, indented code string matching Portfolio2 conventions.
 */
export function formatProjectObjectTS(projectObj: Record<string, unknown>, indent: string = '  '): string {
  const lines: string[] = ['{'];
  const entries = Object.entries(projectObj);

  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    const isLast = i === entries.length - 1;
    const comma = isLast ? '' : ',';

    if (typeof val === 'string') {
      // Escape quotes cleanly
      const escaped = val.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      lines.push(`${indent}  ${key}: "${escaped}"${comma}`);
    } else if (typeof val === 'boolean' || typeof val === 'number') {
      lines.push(`${indent}  ${key}: ${val}${comma}`);
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${indent}  ${key}: []${comma}`);
      } else if (val.every((item) => typeof item === 'string')) {
        const formattedArray = val.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(', ');
        lines.push(`${indent}  ${key}: [${formattedArray}]${comma}`);
      } else {
        // Array of objects (e.g. metrics or features)
        const itemLines = val.map((item) => {
          if (typeof item === 'object' && item !== null) {
            const props = Object.entries(item)
              .map(([k, v]) => `${k}: "${String(v).replace(/"/g, '\\"')}"`)
              .join(', ');
            return `${indent}    { ${props} }`;
          }
          return `${indent}    ${JSON.stringify(item)}`;
        });
        lines.push(`${indent}  ${key}: [\n${itemLines.join(',\n')}\n${indent}  ]${comma}`);
      }
    } else if (typeof val === 'object' && val !== null) {
      lines.push(`${indent}  ${key}: ${JSON.stringify(val, null, 2)}${comma}`);
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

/**
 * Finds the `{ ... }` object span in PROJECTS_DATA whose `id` matches `projectId`.
 */
export function findProjectObjectSpan(content: string, projectId: string): { start: number; end: number } | null {
  const escapedId = projectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idPattern = new RegExp(`\\bid\\s*:\\s*"${escapedId}"`);
  const idMatch = idPattern.exec(content);
  if (!idMatch) return null;

  let start = idMatch.index;
  while (start > 0 && content[start] !== '{') {
    start--;
  }
  if (content[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { start, end: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Replaces an existing project object in PROJECTS_DATA. Returns null if the id is not present.
 */
export function replaceProjectInDataFile(
  existingContent: string,
  projectId: string,
  newEntry: Record<string, unknown>
): string | null {
  const span = findProjectObjectSpan(existingContent, projectId);
  if (!span) return null;
  const formattedObject = formatProjectObjectTS(newEntry, '  ');
  return existingContent.slice(0, span.start) + formattedObject + existingContent.slice(span.end);
}

/**
 * Safely inserts a new project object into the PROJECTS_DATA array in src/data/projects.ts.
 * If an object with the same `id` already exists, it is replaced in-place to prevent duplicates.
 */
export function insertProjectIntoDataFile(existingContent: string, newEntry: Record<string, unknown>): string {
  const id = typeof newEntry.id === 'string' ? newEntry.id : '';
  if (id) {
    const replaced = replaceProjectInDataFile(existingContent, id, newEntry);
    if (replaced !== null) {
      logger.info(`[PortfolioModifier] Replacing existing project entry "${id}" instead of inserting a duplicate.`);
      return replaced;
    }
  }

  const arrayStartRegex = /(export\s+const\s+PROJECTS_DATA\s*:\s*Project\[\]\s*=\s*\[)/;
  const match = arrayStartRegex.exec(existingContent);

  if (!match) {
    throw new WorkspaceError('Failed to locate "export const PROJECTS_DATA: Project[] = [" declaration in target projects file.');
  }

  const formattedObject = formatProjectObjectTS(newEntry, '  ');
  const insertionPoint = match.index + match[0].length;

  const before = existingContent.slice(0, insertionPoint);
  const after = existingContent.slice(insertionPoint);

  return `${before}\n  ${formattedObject},${after}`;
}

/**
 * Generates a standard unified diff string for previewing file modifications.
 */
export function generateUnifiedDiff(filePath: string, originalContent: string, updatedContent: string): string {
  const origLines = originalContent.split('\n');
  const updatedLines = updatedContent.split('\n');
  
  const diffLines: string[] = [];
  diffLines.push(`--- a/${filePath}`);
  diffLines.push(`+++ b/${filePath}`);

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < updatedLines.length) {
    if (origLines[i] === updatedLines[j]) {
      i++;
      j++;
    } else {
      // Collect additions
      diffLines.push(`@@ -${i + 1} +${j + 1} @@`);
      while (j < updatedLines.length && (i >= origLines.length || origLines[i] !== updatedLines[j])) {
        diffLines.push(`+ ${updatedLines[j]}`);
        j++;
      }
      break;
    }
  }

  return diffLines.join('\n');
}
