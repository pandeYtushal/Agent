import { PublishingAgentEngine, PublishResult } from './index.js';
import { INotificationService, LoggerNotificationAdapter } from './notifications.js';
import { loadConfig } from '../config/index.js';
import { logger } from '../logger/index.js';
import { AgentError, ValidationError } from '../errors/index.js';
import { GitManager } from '../git/index.js';

export interface AutomationPipelineOptions {
  engine?: PublishingAgentEngine;
  notificationService?: INotificationService;
  gitManager?: GitManager;
  automationMode?: 'require_approval' | 'trusted';
  portfolioPath?: string;
  portfolioRepoUrl?: string;
}

export interface AutomationRunResult {
  success: boolean;
  mode: 'require_approval' | 'trusted';
  publishResult?: PublishResult;
  error?: string;
}

export class AutomationPipeline {
  private engine: PublishingAgentEngine;
  private notificationService: INotificationService;
  private gitManager: GitManager;
  private automationMode: 'require_approval' | 'trusted';
  private portfolioPath: string;
  private portfolioRepoUrl: string;

  constructor(options: AutomationPipelineOptions = {}) {
    const config = loadConfig();
    this.portfolioPath = options.portfolioPath || config.PORTFOLIO_PATH;
    this.portfolioRepoUrl = options.portfolioRepoUrl || 'https://github.com/pandeYtushal/Portfolio2';
    this.automationMode = options.automationMode || config.AUTOMATION_MODE || 'require_approval';

    this.engine = options.engine || new PublishingAgentEngine({ portfolioPath: this.portfolioPath });
    this.notificationService = options.notificationService || new LoggerNotificationAdapter();
    this.gitManager = options.gitManager || new GitManager();
  }

  /**
   * Sets or overrides the current notification service (e.g. Telegram adapter).
   */
  public setNotificationService(service: INotificationService): void {
    this.notificationService = service;
  }

  /**
   * Main entry point to process an incoming GitHub repository through the automation mode pipeline.
   */
  public async processRepository(
    targetRepoUrl: string,
    overrideOptions: { forceAutoApprove?: boolean } = {}
  ): Promise<AutomationRunResult> {
    logger.info(`[AutomationPipeline] Processing repository: "${targetRepoUrl}" (Mode: ${this.automationMode})`);

    const isTrustedMode = this.automationMode === 'trusted' || overrideOptions.forceAutoApprove;

    let initialProjectName = 'Project';
    try {
      // 1. Analyze target project & portfolio pre-state
      const projectAnalysis = await this.engine.analyze(targetRepoUrl);
      initialProjectName = projectAnalysis.name;

      const { schema: initialSchema } = await this.engine.inspectPortfolio(this.portfolioPath);

      // 2. Check Automation Mode: If approval is required, send approval request notification
      if (!isTrustedMode) {
        logger.info(`[AutomationPipeline] Mode is "require_approval". Sending notification for user confirmation.`);
        await this.notificationService.notifyApprovalRequired({
          projectName: projectAnalysis.name,
          repoUrl: targetRepoUrl,
          description: projectAnalysis.description,
        });

        return {
          success: true,
          mode: 'require_approval',
        };
      }

      // 3. Execution in "trusted" mode: Run preview & validate changes
      const previewResult = await this.engine.preview(targetRepoUrl, { updateExisting: true });
      const { validationResult, portfolioChange } = previewResult;

      // SAFETY ASSERTION 1: Never allow bypassing validation
      if (!validationResult.isValid) {
        const failureReasons = validationResult.errors.map((e) => e.message).join('; ');
        throw new ValidationError(`Portfolio change failed validation check: ${failureReasons}`, { validationResult });
      }

      // SAFETY ASSERTION 2: Safety invariants against project deletion or global theme edits
      if (portfolioChange.action === 'remove') {
        throw new AgentError(`Safety Violation: Automated removal/deletion of projects is prohibited.`);
      }

      const deletedFileActions = portfolioChange.modifiedFiles.filter((f) => f.action === 'delete');
      if (deletedFileActions.length > 0) {
        throw new AgentError(`Safety Violation: Attempted deletion of existing project/file(s): ${deletedFileActions.map((f) => f.path).join(', ')}`);
      }

      // Verify no global theme or css files are touched
      const illegalFiles = portfolioChange.modifiedFiles.filter(
        (f) => f.path.includes('theme') || f.path.includes('global') || f.path.endsWith('.css')
      );
      if (illegalFiles.length > 0) {
        throw new AgentError(`Safety Violation: Automated modifications to global design/theme files are prohibited (${illegalFiles.map((f) => f.path).join(', ')})`);
      }

      // 4. Run publish pipeline (Branch -> Modify -> Build Validate -> Commit -> Push -> PR)
      const publishResult = await this.engine.publish(targetRepoUrl, {
        updateExisting: true,
        portfolioRepoUrl: this.portfolioRepoUrl,
      });

      // SAFETY ASSERTION 3: Never publish a broken build
      if (!publishResult.buildValidation.build || !publishResult.buildValidation.typecheck) {
        throw new AgentError('Safety Violation: Post-modification target portfolio build failed. Aborting PR publication.', {
          buildValidation: publishResult.buildValidation,
        });
      }

      // 5. Send Telegram Success Notification
      await this.notificationService.notifySuccess({
        projectName: projectAnalysis.name,
        githubUrl: targetRepoUrl,
        prUrl: publishResult.prUrl,
        prNumber: publishResult.prNumber,
        deploymentUrl: projectAnalysis.repoUrl,
        filesChanged: portfolioChange.modifiedFiles.map((f) => f.path),
      });

      logger.info(`[AutomationPipeline] Successfully completed automated publishing for "${projectAnalysis.name}" ✅`);
      return {
        success: true,
        mode: 'trusted',
        publishResult,
      };

    } catch (err: any) {
      logger.error(`[AutomationPipeline] Automation failed for "${targetRepoUrl}". Rolling back...`, err);

      // FAILURE HANDLING: Rollback any uncommitted local git changes
      try {
        const isGit = await this.gitManager.isGitRepository(this.portfolioPath);
        if (isGit) {
          logger.info(`[AutomationPipeline] Executing git rollback on "${this.portfolioPath}"`);
          await this.gitManager.restoreCleanState(this.portfolioPath);
        }
      } catch (rollbackErr) {
        logger.error('[AutomationPipeline] Failed to execute git cleanup after error', rollbackErr);
      }

      // Send concise failure notification
      const errorMessage = err.message || 'Unknown automation execution error';
      await this.notificationService.notifyFailure({
        projectName: initialProjectName,
        repoUrl: targetRepoUrl,
        errorMessage,
        error: err,
      });

      return {
        success: false,
        mode: this.automationMode,
        error: errorMessage,
      };
    }
  }
}
