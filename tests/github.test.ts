import { describe, it, expect, vi } from 'vitest';
import { GitHubService } from '../src/github/index.js';
import { GitHubApiError } from '../src/errors/index.js';

describe('GitHubService & PR Body Formatter (Phase 5)', () => {
  const gh = new GitHubService();

  it('formats Pull Request body with project details and validation checklist', () => {
    const pr = gh.formatPullRequestBody({
      projectName: 'Hunter Agent',
      description: 'Autonomous browser agent',
      techStack: ['TypeScript', 'Chrome Extension'],
      githubUrl: 'https://github.com/pandeYtushal/Hunter',
      liveDemoUrl: 'https://huntterr.vercel.app',
      imagePath: 'public/hunter.png',
      filesChanged: ['src/data/projects.ts', 'public/hunter.png'],
      validationResults: {
        typecheck: true,
        lint: true,
        build: true,
      },
    });

    expect(pr.title).toBe('Add Hunter Agent to portfolio');
    expect(pr.body).toContain('Hunter Agent');
    expect(pr.body).toContain('✓ Typecheck');
    expect(pr.body).toContain('✓ Lint');
    expect(pr.body).toContain('✓ Production build');
    expect(pr.body).toContain('`src/data/projects.ts`');
  });

  it('throws GitHubApiError when GITHUB_TOKEN is unauthenticated', () => {
    const unauthGh = new GitHubService('');
    expect(() => unauthGh.ensureAuthenticated()).toThrow(GitHubApiError);
    expect(() => unauthGh.ensureAuthenticated()).toThrow('GITHUB_TOKEN is missing or invalid');
  });

  it('fetches user repository count successfully using mock API', async () => {
    const mockGh = new GitHubService('valid_mock_token');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: 'octocat',
        public_repos: 12,
        total_private_repos: 5,
      }),
    } as any);

    try {
      const countInfo = await mockGh.getUserRepositoriesCount();
      expect(countInfo.username).toBe('octocat');
      expect(countInfo.totalCount).toBe(17);
      expect(countInfo.publicRepos).toBe(12);
      expect(countInfo.privateRepos).toBe(5);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fetches specific user repository count when username is provided', async () => {
    const mockGh = new GitHubService('');

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        login: 'torvalds',
        public_repos: 15,
      }),
    } as any);

    try {
      const countInfo = await mockGh.getUserRepositoriesCount('torvalds');
      expect(countInfo.username).toBe('torvalds');
      expect(countInfo.totalCount).toBe(15);
      expect(countInfo.publicRepos).toBe(15);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
