import { describe, it, expect } from 'vitest';
import { WorkspaceManager } from '../src/workspace/index.js';
import { SecurityError } from '../src/errors/index.js';

describe('WorkspaceManager Security & Exclusion Rules', () => {
  const workspace = new WorkspaceManager({ rootPath: process.cwd() });

  it('identifies .env and secret files correctly', () => {
    expect(workspace.isSecretFile('.env')).toBe(true);
    expect(workspace.isSecretFile('.env.local')).toBe(true);
    expect(workspace.isSecretFile('.env.production')).toBe(true);
    expect(workspace.isSecretFile('.env.development')).toBe(true);
    expect(workspace.isSecretFile('package.json')).toBe(false);
    expect(workspace.isSecretFile('src/index.ts')).toBe(false);
  });

  it('throws SecurityError if attempting to read a secret file', async () => {
    await expect(workspace.readFile('.env')).rejects.toThrow(SecurityError);
    await expect(workspace.readFile('.env.local')).rejects.toThrow(SecurityError);
    await expect(workspace.readFile('.env.production')).rejects.toThrow(SecurityError);
  });

  it('safely reads non-secret files', async () => {
    const content = await workspace.readFile('package.json');
    expect(content).toContain('portfolio-publishing-agent');
  });
});
