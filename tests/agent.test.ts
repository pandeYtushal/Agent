import { describe, it, expect } from 'vitest';
import { PublishingAgentEngine } from '../src/agent/index.js';

describe('PublishingAgentEngine Workflow', () => {
  const engine = new PublishingAgentEngine();
  const repoUrl = 'https://github.com/octocat/Hello-World';

  it('runs analyze step and returns ProjectAnalysis', async () => {
    const analysis = await engine.analyze(repoUrl);
    expect(analysis.repoUrl).toBe(repoUrl);
    expect(analysis.name).toBe('Hello-World');
    expect(analysis.techStack).toContain('TypeScript');
  });

  it('runs preview step and returns analysis, change, and validation', async () => {
    const preview = await engine.preview(repoUrl);
    expect(preview.projectAnalysis.repoUrl).toBe(repoUrl);
    expect(preview.portfolioChange.action).toBe('add');
    expect(preview.validationResult.isValid).toBe(true);
  });

  it('runs add step and returns completed AgentRun', async () => {
    const result = await engine.add(repoUrl, { dryRun: true });
    expect(result.run.status).toBe('completed');
    expect(result.run.targetRepoUrl).toBe(repoUrl);
    expect(result.run.steps.length).toBeGreaterThan(0);
    expect(result.dryRun).toBe(true);
  });
});
