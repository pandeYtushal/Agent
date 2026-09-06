import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationPipeline } from '../src/agent/automation.js';
import { INotificationService } from '../src/agent/notifications.js';
import { PublishingAgentEngine } from '../src/agent/index.js';
import { loadConfig } from '../src/config/index.js';

describe('Final Automation Mode & Safety Pipeline', () => {
  let mockNotificationService: INotificationService;

  beforeEach(() => {
    mockNotificationService = {
      notifySuccess: vi.fn(),
      notifyFailure: vi.fn(),
      notifyApprovalRequired: vi.fn(),
    };
  });

  it('parses default AUTOMATION_MODE as require_approval', () => {
    const config = loadConfig();
    expect(config.AUTOMATION_MODE).toBe('require_approval');
  });

  it('stops and requests approval when AUTOMATION_MODE is require_approval', async () => {
    const pipeline = new AutomationPipeline({
      automationMode: 'require_approval',
      notificationService: mockNotificationService,
      portfolioPath: './portfolio',
    });

    const result = await pipeline.processRepository('https://github.com/octocat/Hello-World');

    expect(result.success).toBe(true);
    expect(result.mode).toBe('require_approval');
    expect(mockNotificationService.notifyApprovalRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/octocat/Hello-World',
      })
    );
    expect(mockNotificationService.notifySuccess).not.toHaveBeenCalled();
    expect(mockNotificationService.notifyFailure).not.toHaveBeenCalled();
  });

  it('executes full automated pipeline in trusted mode and sends Telegram success notification', async () => {
    const pipeline = new AutomationPipeline({
      automationMode: 'trusted',
      notificationService: mockNotificationService,
      portfolioPath: './portfolio',
    });

    const result = await pipeline.processRepository('https://github.com/octocat/Hello-World');

    expect(result.success).toBe(true);
    expect(result.mode).toBe('trusted');
    expect(result.publishResult).toBeDefined();
    expect(mockNotificationService.notifySuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'Hello-World',
        githubUrl: 'https://github.com/octocat/Hello-World',
        prUrl: expect.stringContaining('http'),
      })
    );
  });

  it('enforces Safety Invariant: stops workflow and sends failure notification if build fails', async () => {
    const mockEngine = new PublishingAgentEngine({ portfolioPath: './portfolio' });
    
    // Mock engine publish method to throw broken build validation error
    vi.spyOn(mockEngine, 'publish').mockRejectedValueOnce(
      new Error('Safety Violation: Post-modification target portfolio build failed. Aborting PR publication.')
    );

    const pipeline = new AutomationPipeline({
      automationMode: 'trusted',
      notificationService: mockNotificationService,
      engine: mockEngine,
      portfolioPath: './portfolio',
    });

    const result = await pipeline.processRepository('https://github.com/octocat/Broken-Project');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Safety Violation');
    expect(mockNotificationService.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/octocat/Broken-Project',
        errorMessage: expect.stringContaining('Safety Violation'),
      })
    );
    expect(mockNotificationService.notifySuccess).not.toHaveBeenCalled();
  });

  it('enforces Safety Invariant: stops workflow if project deletion is attempted', async () => {
    const mockEngine = new PublishingAgentEngine({ portfolioPath: './portfolio' });

    // Mock preview to return empty projects array representing deletion of existing items
    vi.spyOn(mockEngine, 'inspectPortfolio').mockResolvedValueOnce({
      schema: {
        portfolioName: 'Test Portfolio',
        framework: 'Next.js',
        buildSystem: 'npm',
        projectDataFile: 'data/projects.json',
        assetDirectory: 'public',
        projects: [
          { id: 'p1', title: 'Existing Project 1', slug: 'p1', description: 'desc', category: 'Web', tags: [] },
          { id: 'p2', title: 'Existing Project 2', slug: 'p2', description: 'desc', category: 'Web', tags: [] },
        ],
      } as any,
      report: {} as any,
    });

    vi.spyOn(mockEngine, 'preview').mockResolvedValueOnce({
      projectAnalysis: { name: 'New Project', description: 'desc', techStack: [], keyFeatures: [], assets: [], analyzedAt: new Date().toISOString(), repoUrl: 'https://github.com/octocat/Hello-World' },
      portfolioChange: {
        id: 'c1',
        projectId: 'new-project',
        action: 'remove',
        newEntry: { title: 'New Project' },
        modifiedFiles: [{ path: 'data/projects.json', action: 'delete' }],
        assetsToAdd: [],
        gitBranchName: 'portfolio-add-new-project',
        commitMessage: 'Add New Project',
      },
      validationResult: { isValid: true, errors: [], warnings: [], validatedAt: new Date().toISOString() },
    });

    const pipeline = new AutomationPipeline({
      automationMode: 'trusted',
      notificationService: mockNotificationService,
      engine: mockEngine,
      portfolioPath: './portfolio',
    });

    const result = await pipeline.processRepository('https://github.com/octocat/Hello-World');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Safety Violation');
    expect(mockNotificationService.notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: expect.stringContaining('Safety Violation'),
      })
    );
  });
});
