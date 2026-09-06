import { logger } from '../logger/index.js';

export interface RepositoryWebhookPayload {
  action?: string;
  repository?: {
    name: string;
    full_name: string;
    html_url: string;
    description?: string;
    fork?: boolean;
    stargazers_count?: number;
    language?: string;
    has_issues?: boolean;
    pushed_at?: string;
    created_at?: string;
  };
  sender?: {
    login: string;
  };
}

export interface ViabilityResult {
  isViable: boolean;
  reason: string;
  projectName: string;
  repoUrl: string;
  description: string;
}

export class RepositoryEvaluator {
  /**
   * Determines whether a GitHub repository payload represents a legitimate project for portfolio publication.
   */
  public evaluateRepository(payload: RepositoryWebhookPayload): ViabilityResult {
    const repo = payload.repository;
    if (!repo) {
      return {
        isViable: false,
        reason: 'Webhook payload contains no repository object.',
        projectName: '',
        repoUrl: '',
        description: '',
      };
    }

    const name = repo.name || 'Unnamed Repo';
    const repoUrl = repo.html_url || '';
    const description = repo.description || `${name} GitHub software project.`;

    // 1. Exclude .github config repositories or dotfiles
    if (name.startsWith('.') || name.toLowerCase() === '.github' || name.toLowerCase() === 'config') {
      logger.info(`[RepositoryEvaluator] Skipped non-project config repo: "${name}"`);
      return { isViable: false, reason: 'Configuration or dotfile repository.', projectName: name, repoUrl, description };
    }

    // 2. Exclude empty forks without descriptive details if applicable
    if (repo.fork && (!repo.description || repo.description.trim() === '')) {
      logger.info(`[RepositoryEvaluator] Skipped bare fork repo: "${name}"`);
      return { isViable: false, reason: 'Unmodified fork without custom description.', projectName: name, repoUrl, description };
    }


    logger.info(`[RepositoryEvaluator] Repository "${name}" evaluated as viable project candidate ✅`);
    return {
      isViable: true,
      reason: 'Repository meets project viability criteria.',
      projectName: name,
      repoUrl,
      description,
    };
  }
}

export const repositoryEvaluator = new RepositoryEvaluator();
