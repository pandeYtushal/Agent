import { describe, it, expect } from 'vitest';
import { GitManager } from '../src/git/index.js';
import { GitOperationError } from '../src/errors/index.js';

describe('GitManager & Branch Protection (Phase 5)', () => {
  const git = new GitManager();

  it('formats branch names correctly with agent/add-project-<slug>', () => {
    const branch = git.formatBranchName('Hunter Agent');
    expect(branch).toBe('agent/add-project-hunter-agent');
  });

  it('formats commit messages with feat: add <name> to portfolio', () => {
    const commit = git.formatCommitMessage('Hunter Agent');
    expect(commit).toBe('feat: add Hunter Agent to portfolio');
  });

  it('prohibits direct branch creation targeting main or master', async () => {
    await expect(git.createBranch({ repoPath: '.', branchName: 'main' })).rejects.toThrow(GitOperationError);
    await expect(git.createBranch({ repoPath: '.', branchName: 'master' })).rejects.toThrow(GitOperationError);
  });
});
