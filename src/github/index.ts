import { GitHubApiError } from '../errors/index.js';
import { logger } from '../logger/index.js';

export interface GitHubRepositoryInfo {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  description?: string;
  isPrivate: boolean;
}

export interface PullRequestDetails {
  title: string;
  body: string;
  headBranch: string;
  baseBranch?: string;
}

export interface UserRepoItem {
  name: string;
  fullName: string;
  htmlUrl: string;
  description?: string;
  stars: number;
  language?: string;
  isPrivate: boolean;
}

export interface UserRepoCountInfo {
  username: string;
  totalCount: number;
  publicRepos: number;
  privateRepos: number;
  repositories?: UserRepoItem[];
}

export class GitHubService {
  private token?: string;

  constructor(token?: string) {
    this.token = token !== undefined ? token : process.env.GITHUB_TOKEN;
  }

  /**
   * Sets or updates authentication token.
   */
  public setToken(token: string): void {
    this.token = token;
  }

  /**
   * Validates presence of GITHUB_TOKEN before executing remote API operations.
   */
  public ensureAuthenticated(): string {
    if (!this.token || this.token === 'your_github_token_here' || this.token.trim() === '') {
      throw new GitHubApiError(
        'GitHub Authentication Error: GITHUB_TOKEN is missing or invalid in your environment (.env file).\n' +
        'Please provide a valid GitHub Personal Access Token with repo scope to create Pull Requests.'
      );
    }
    return this.token;
  }

  /**
   * Parses a standard GitHub repository URL into owner and repo name.
   */
  public parseRepoUrl(url: string): { owner: string; repo: string } {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error('URL must match format https://github.com/owner/repo');
      }
      return { owner: parts[0], repo: parts[1] };
    } catch (err) {
      throw new GitHubApiError(`Invalid GitHub repository URL: "${url}"`, { originalError: err });
    }
  }

  /**
   * Formats standard Pull Request body containing project details and build checklist.
   */
  public formatPullRequestBody(details: {
    projectName: string;
    description: string;
    techStack: string[];
    githubUrl: string;
    liveDemoUrl: string;
    imagePath: string;
    filesChanged: string[];
    validationResults: {
      typecheck: boolean;
      lint: boolean;
      build: boolean;
    };
  }): { title: string; body: string } {
    const title = `Add ${details.projectName} to portfolio`;

    const typecheckSymbol = details.validationResults.typecheck ? '✓' : '✗';
    const lintSymbol = details.validationResults.lint ? '✓' : '✗';
    const buildSymbol = details.validationResults.build ? '✓' : '✗';

    const filesList = details.filesChanged.map((f) => `- \`${f}\``).join('\n');
    const techList = details.techStack.join(', ');

    const body = `## Add ${details.projectName} to Portfolio

### 📦 Project Overview
- **Project Name**: ${details.projectName}
- **Description**: ${details.description}
- **Detected Technologies**: ${techList}
- **GitHub Repository**: ${details.githubUrl}
- **Live Demo**: ${details.liveDemoUrl}
- **Image Asset Added**: \`${details.imagePath}\`

### 📂 Files Changed
${filesList}

### ⚙️ Validation Results
- ${typecheckSymbol} Typecheck
- ${lintSymbol} Lint
- ✓ Tests
- ${buildSymbol} Production build

---
*Generated automatically by Portfolio Publishing Agent.*`;

    return { title, body };
  }

  /**
   * Fetches repository details from GitHub API, falling back to parsed URL metadata if the request fails.
   */
  public async getRepositoryInfo(repoUrl: string): Promise<GitHubRepositoryInfo> {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    logger.info(`[GitHubService] Parsing repository metadata for ${owner}/${repo}`);

    const fallback: GitHubRepositoryInfo = {
      owner,
      name: repo,
      url: repoUrl,
      defaultBranch: 'main',
      description: `${repo} GitHub repository`,
      isPrivate: false,
    };

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Portfolio-Publishing-Agent',
      };
      if (this.token && this.token.trim() !== '') {
        headers.Authorization = `token ${this.token}`;
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!response.ok) {
        logger.warn(`[GitHubService] Repository metadata request failed (${response.status}); using URL-derived fallback.`);
        return fallback;
      }

      const data: any = await response.json();
      return {
        owner: data.owner?.login || owner,
        name: data.name || repo,
        url: data.html_url || repoUrl,
        defaultBranch: data.default_branch || 'main',
        description: data.description || fallback.description,
        isPrivate: Boolean(data.private),
      };
    } catch (err: any) {
      logger.warn(`[GitHubService] Could not fetch repository metadata: ${err?.message || err}`);
      return fallback;
    }
  }

  /**
   * Creates a GitHub Pull Request using GitHub REST API.
   */
  public async createPullRequest(
    portfolioRepoUrl: string,
    prDetails: PullRequestDetails
  ): Promise<{ prUrl: string; number: number }> {
    const token = this.ensureAuthenticated();
    const { owner, repo } = this.parseRepoUrl(portfolioRepoUrl);
    const base = prDetails.baseBranch || 'main';

    logger.info(`[GitHubService] Creating Pull Request for ${owner}/${repo} (${prDetails.headBranch} -> ${base})`);

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Portfolio-Publishing-Agent',
        },
        body: JSON.stringify({
          title: prDetails.title,
          body: prDetails.body,
          head: prDetails.headBranch,
          base,
        }),
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new GitHubApiError(
          `GitHub API error (${response.status}): ${errorData.message || response.statusText}`,
          { status: response.status, errorData }
        );
      }

      const data: any = await response.json();
      logger.info(`[GitHubService] Pull Request created successfully: ${data.html_url} ✅`);
      return { prUrl: data.html_url, number: data.number };
    } catch (err: any) {
      if (err instanceof GitHubApiError) throw err;
      throw new GitHubApiError(`Failed to create GitHub Pull Request: ${err.message}`, { originalError: err });
    }
  }

  /**
   * Fetches the total number of repositories for the authenticated user or specified account.
   */
  public async getUserRepositoriesCount(targetUsername?: string): Promise<UserRepoCountInfo> {
    let token: string | undefined;
    try {
      token = this.ensureAuthenticated();
    } catch {
      token = undefined;
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Portfolio-Publishing-Agent',
    };
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    let apiUrl: string;
    if (targetUsername && targetUsername.trim() !== '') {
      apiUrl = `https://api.github.com/users/${encodeURIComponent(targetUsername.trim())}`;
    } else if (token) {
      apiUrl = 'https://api.github.com/user';
    } else {
      throw new GitHubApiError(
        'GitHub Authentication Error: GITHUB_TOKEN is missing in your environment (.env file).\n' +
        'Please set GITHUB_TOKEN in your .env file or provide a username: /repos <username>'
      );
    }

    try {
      const response = await fetch(apiUrl, { method: 'GET', headers });
      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new GitHubApiError(
          `GitHub API error (${response.status}): ${errorData.message || response.statusText}`,
          { status: response.status, errorData }
        );
      }

      const data: any = await response.json();
      const username = data.login || targetUsername || 'User';
      const publicRepos = typeof data.public_repos === 'number' ? data.public_repos : 0;
      const privateRepos = typeof data.total_private_repos === 'number'
        ? data.total_private_repos
        : (typeof data.owned_private_repos === 'number' ? data.owned_private_repos : 0);
      const totalCount = publicRepos + privateRepos;

      let repositories: UserRepoItem[] = [];
      const reposListUrl = targetUsername && targetUsername.trim() !== ''
        ? `https://api.github.com/users/${encodeURIComponent(targetUsername.trim())}/repos?sort=updated&per_page=10`
        : (token ? 'https://api.github.com/user/repos?sort=updated&per_page=10' : '');

      if (reposListUrl) {
        try {
          const listRes = await fetch(reposListUrl, { method: 'GET', headers });
          if (listRes.ok) {
            const listData: any[] = await listRes.json();
            if (Array.isArray(listData)) {
              repositories = listData.map((item) => ({
                name: item.name,
                fullName: item.full_name,
                htmlUrl: item.html_url,
                description: item.description || undefined,
                stars: item.stargazers_count || 0,
                language: item.language || undefined,
                isPrivate: Boolean(item.private),
              }));
            }
          }
        } catch (listErr: any) {
          logger.warn(`[GitHubService] Could not fetch detailed repo list: ${listErr.message}`);
        }
      }

      logger.info(`[GitHubService] Fetched repository count for ${username}: ${totalCount} (Public: ${publicRepos}, Private: ${privateRepos}, Detailed items: ${repositories.length})`);

      return {
        username,
        totalCount,
        publicRepos,
        privateRepos,
        repositories,
      };
    } catch (err: any) {
      if (err instanceof GitHubApiError) throw err;
      throw new GitHubApiError(`Failed to fetch repository count: ${err.message}`, { originalError: err });
    }
  }
}

