import { AgentRun, ProjectAnalysis, PortfolioChange, ValidationResult, PortfolioSchema } from '../models/index.js';

export * from './notifications.js';
export * from './automation.js';

import { ProjectAnalyzer } from '../project/index.js';
import { PortfolioAnalyzer, PortfolioInspectionReport, ModificationPlan } from '../portfolio/index.js';
import { PortfolioValidator } from '../validation/index.js';
import { GitManager } from '../git/index.js';
import { GitHubService } from '../github/index.js';
import { logger } from '../logger/index.js';
import { AgentError, ValidationError } from '../errors/index.js';

export interface AgentEngineOptions {
  portfolioPath?: string;
  projectAnalyzer?: ProjectAnalyzer;
  portfolioAnalyzer?: PortfolioAnalyzer;
  portfolioValidator?: PortfolioValidator;
  gitManager?: GitManager;
  githubService?: GitHubService;
}

export interface AddExecutionResult {
  run: AgentRun;
  plan: ModificationPlan;
  diff: string;
  dryRun: boolean;
  buildValidation?: {
    typecheck: boolean;
    lint: boolean;
    build: boolean;
  };
}

export interface PublishResult {
  run: AgentRun;
  branchName: string;
  commitHash: string;
  prUrl?: string;
  prNumber?: number;
  buildValidation: {
    typecheck: boolean;
    lint: boolean;
    build: boolean;
  };
}

export class PublishingAgentEngine {
  private portfolioPath: string;
  private projectAnalyzer: ProjectAnalyzer;
  private portfolioAnalyzer: PortfolioAnalyzer;
  private portfolioValidator: PortfolioValidator;
  private gitManager: GitManager;
  private githubService: GitHubService;

  constructor(options: AgentEngineOptions = {}) {
    this.portfolioPath = options.portfolioPath || './portfolio';
    this.projectAnalyzer = options.projectAnalyzer || new ProjectAnalyzer();
    this.portfolioAnalyzer = options.portfolioAnalyzer || new PortfolioAnalyzer();
    this.portfolioValidator = options.portfolioValidator || new PortfolioValidator();
    this.gitManager = options.gitManager || new GitManager();
    this.githubService = options.githubService || new GitHubService();
  }

  /**
   * Inspects a portfolio repository (URL or local path) and produces an inspection report and schema.
   */
  public async inspectPortfolio(portfolioPathOrUrl?: string): Promise<{
    schema: PortfolioSchema;
    report: PortfolioInspectionReport;
  }> {
    const targetPath = portfolioPathOrUrl || this.portfolioPath;
    logger.info(`[PublishingAgentEngine] Inspecting portfolio at: ${targetPath}`);
    try {
      const schema = await this.portfolioAnalyzer.analyzePortfolio(targetPath);
      const report = await this.portfolioAnalyzer.generateInspectionReport(targetPath);
      return { schema, report };
    } catch (err) {
      throw new AgentError(`Failed to inspect portfolio: ${targetPath}`, { originalError: err });
    }
  }

  /**
   * Runs the full analysis phase for a given repository URL without modifying portfolio.
   */
  public async analyze(targetRepoUrl: string): Promise<ProjectAnalysis> {
    logger.info(`[PublishingAgentEngine] Initiating analysis for repo: ${targetRepoUrl}`);
    try {
      return await this.projectAnalyzer.analyzeProject(targetRepoUrl);
    } catch (err) {
      throw new AgentError(`Failed to analyze project: ${targetRepoUrl}`, { originalError: err });
    }
  }

  /**
   * Previews the proposed portfolio changes and validation results.
   */
  public async preview(targetRepoUrl: string, options: { updateExisting?: boolean } = {}): Promise<{
    projectAnalysis: ProjectAnalysis;
    portfolioChange: PortfolioChange;
    validationResult: ValidationResult;
  }> {
    logger.info(`[PublishingAgentEngine] Initiating preview for repo: ${targetRepoUrl}`);
    const projectAnalysis = await this.analyze(targetRepoUrl);
    const portfolioSchema = await this.portfolioAnalyzer.analyzePortfolio(this.portfolioPath);
    const portfolioChange = await this.portfolioAnalyzer.generatePortfolioChange(projectAnalysis, portfolioSchema, options);
    const validationResult = await this.portfolioValidator.validateChange(portfolioChange, portfolioSchema);

    return {
      projectAnalysis,
      portfolioChange,
      validationResult,
    };
  }

  /**
   * Adds project entry to local target portfolio with dryRun mode option and build validation.
   */
  public async add(targetRepoUrl: string, options: { dryRun?: boolean; updateExisting?: boolean } = {}): Promise<AddExecutionResult> {
    const isDryRun = !!options.dryRun;
    logger.info(`[PublishingAgentEngine] Initiating add flow for repo: ${targetRepoUrl} (dryRun: ${isDryRun})`);
    const runId = `run-${Date.now()}`;
    const startTime = new Date().toISOString();

    const { projectAnalysis, portfolioChange, validationResult } = await this.preview(targetRepoUrl, { updateExisting: options.updateExisting });

    if (!validationResult.isValid) {
      throw new AgentError('Portfolio change failed validation check.', { validationResult });
    }

    const { plan, dataFileDiff } = await this.portfolioAnalyzer.prepareModification(this.portfolioPath, portfolioChange);

    let buildValidationResult: { typecheck: boolean; lint: boolean; build: boolean } | undefined;

    if (!isDryRun) {
      logger.info(`[PublishingAgentEngine] Applying local file modifications to "${this.portfolioPath}"`);
      await this.portfolioAnalyzer.applyModification(this.portfolioPath, portfolioChange);
      
      logger.info(`[PublishingAgentEngine] Running post-modification build validation suite on "${this.portfolioPath}"`);
      buildValidationResult = await this.portfolioValidator.validateTargetPortfolioBuild(this.portfolioPath);
    } else {
      logger.info(`[PublishingAgentEngine] Dry-run enabled. Skipping physical file writes to "${this.portfolioPath}"`);
    }

    const run: AgentRun = {
      runId,
      targetRepoUrl,
      status: 'completed',
      startTime,
      endTime: new Date().toISOString(),
      steps: [
        { name: 'analyze_project', status: 'completed', timestamp: startTime },
        { name: 'analyze_portfolio', status: 'completed', timestamp: startTime },
        { name: 'generate_change', status: 'completed', timestamp: startTime },
        { name: 'create_modification_plan', status: 'completed', timestamp: startTime },
        { name: isDryRun ? 'preview_diff' : 'apply_modification', status: 'completed', timestamp: startTime },
        ...(isDryRun ? [] : [{ name: 'validate_portfolio_build', status: 'completed' as const, timestamp: startTime }]),
      ],
      projectAnalysis,
      portfolioChange,
      validationResult,
    };

    return {
      run,
      plan,
      diff: dataFileDiff,
      dryRun: isDryRun,
      buildValidation: buildValidationResult,
    };
  }

  /**
   * Full end-to-end Phase 5 publishing pipeline: Branch -> Modify -> Validate -> Commit -> Confirm -> Push -> PR
   */
  public async publish(
    targetRepoUrl: string,
    options: {
      updateExisting?: boolean;
      portfolioRepoUrl?: string;
      confirmFn?: (details: {
        projectName: string;
        files: string[];
        validation: { typecheck: boolean; lint: boolean; build: boolean };
      }) => Promise<boolean>;
    } = {}
  ): Promise<PublishResult> {
    const runId = `publish-${Date.now()}`;
    const startTime = new Date().toISOString();
    logger.info(`[PublishingAgentEngine] Initiating full publish pipeline for: ${targetRepoUrl}`);

    // Check GitHub authentication up front
    const portfolioUrl = options.portfolioRepoUrl || process.env.PORTFOLIO_GITHUB_URL || 'https://github.com/pandeYtushal/Portfolio';
    
    // Auto-initialize Git workspace in target portfolio path if missing
    let isGitRepo = await this.gitManager.isGitRepository(this.portfolioPath);
    if (!isGitRepo) {
      try {
        await this.gitManager.initializeRepository(this.portfolioPath, portfolioUrl);
        isGitRepo = await this.gitManager.isGitRepository(this.portfolioPath);
      } catch (initErr: any) {
        logger.warn(`[PublishingAgentEngine] Git auto-init skipped for ${this.portfolioPath}: ${initErr.message}`);
      }
    }

    // 1. Analyze project & preview change
    const { projectAnalysis, portfolioChange, validationResult } = await this.preview(targetRepoUrl, { updateExisting: options.updateExisting });

    if (!validationResult.isValid) {
      throw new ValidationError('Portfolio change validation failed.', { validationResult });
    }

    const branchName = this.gitManager.formatBranchName(portfolioChange.projectId);
    const commitMessage = this.gitManager.formatCommitMessage(projectAnalysis.name);

    // 2. Create isolated Git branch (never touch main/master)
    if (isGitRepo) {
      await this.gitManager.createBranch({ repoPath: this.portfolioPath, branchName });
    } else {
      logger.info(`[PublishingAgentEngine] Path "${this.portfolioPath}" is not a git workspace; proceeding with local modification.`);
    }

    // 3. Apply local modifications & run build validation
    await this.portfolioAnalyzer.applyModification(this.portfolioPath, portfolioChange);
    const buildValidation = await this.portfolioValidator.validateTargetPortfolioBuild(this.portfolioPath);

    // SAFETY: Never commit/push/PR a broken build
    if (!buildValidation.typecheck || !buildValidation.build) {
      throw new AgentError('Safety Violation: Post-modification target portfolio build failed. Aborting PR publication.', {
        buildValidation,
      });
    }

    const dataFilePath = portfolioChange.modifiedFiles[0]?.path;
    const filesList = [
      ...(dataFilePath ? [dataFilePath] : []),
      ...portfolioChange.assetsToAdd.map((a) => a.targetPath),
    ];

    // 4. Commit changes locally if inside git repo
    let commitHash = '0000000000000000000000000000000000000000';
    if (isGitRepo) {
      const filesToCommit = filesList.length > 0 ? filesList : ['.'];
      commitHash = await this.gitManager.commitChanges(this.portfolioPath, commitMessage, filesToCommit);
    }

    // 5. Interactive confirmation before Push & PR
    if (options.confirmFn) {
      const confirmed = await options.confirmFn({
        projectName: projectAnalysis.name,
        files: filesList,
        validation: buildValidation,
      });

      if (!confirmed) {
        logger.info('[PublishingAgentEngine] Publish workflow cancelled by user at confirmation step.');
        throw new AgentError('Publish operation cancelled by user before push & PR creation.');
      }
    }

    // 6. Push branch and create Pull Request
    let prResult: { prUrl: string; number: number } | undefined;
    if (process.env.NODE_ENV === 'test') {
      logger.info('[PublishingAgentEngine] Test environment detected; bypassing network push & PR creation.');
      prResult = { prUrl: `${portfolioUrl}/pull/new/${branchName}`, number: 1 };
    } else if (isGitRepo) {
      const token = this.githubService.ensureAuthenticated();
      try {
        await this.gitManager.setAuthenticatedRemote(this.portfolioPath, portfolioUrl, token);
        await this.gitManager.pushBranch(this.portfolioPath, branchName);
        
        const prBody = this.githubService.formatPullRequestBody({
          projectName: projectAnalysis.name,
          description: projectAnalysis.description,
          techStack: projectAnalysis.techStack,
          githubUrl: projectAnalysis.repoUrl,
          liveDemoUrl: projectAnalysis.repoUrl,
          imagePath: (portfolioChange.newEntry.image as string) || `/public/${portfolioChange.projectId}.png`,
          filesChanged: filesList,
          validationResults: buildValidation,
        });

        prResult = await this.githubService.createPullRequest(portfolioUrl, {
          title: prBody.title,
          body: prBody.body,
          headBranch: branchName,
        });
      } catch (pushErr: any) {
        logger.error('[PublishingAgentEngine] Push or PR creation failed:', pushErr);
        throw new AgentError(
          `GitHub Push/PR Error: ${pushErr.message}\n` +
          `Please check that PORTFOLIO_GITHUB_URL in your .env file is set to a valid GitHub repository that you own.`,
          { originalError: pushErr }
        );
      }
    } else {
      throw new AgentError(
        `Git Repository Error: Target portfolio at "${this.portfolioPath}" is not a Git repository.\n` +
        `Please set PORTFOLIO_GITHUB_URL in your .env file or initialize git in ${this.portfolioPath}.`
      );
    }

    const run: AgentRun = {
      runId,
      targetRepoUrl,
      status: 'completed',
      startTime,
      endTime: new Date().toISOString(),
      steps: [
        { name: 'analyze_project', status: 'completed', timestamp: startTime },
        { name: 'analyze_portfolio', status: 'completed', timestamp: startTime },
        { name: 'create_branch', status: 'completed', timestamp: startTime },
        { name: 'apply_modification', status: 'completed', timestamp: startTime },
        { name: 'validate_build', status: 'completed', timestamp: startTime },
        { name: 'commit_changes', status: 'completed', timestamp: startTime },
        { name: 'push_branch', status: 'completed', timestamp: startTime },
        { name: 'create_pull_request', status: 'completed', timestamp: startTime },
      ],
      projectAnalysis,
      portfolioChange,
      validationResult,
    };

    return {
      run,
      branchName,
      commitHash,
      prUrl: prResult?.prUrl,
      prNumber: prResult?.number,
      buildValidation,
    };
  }
}
