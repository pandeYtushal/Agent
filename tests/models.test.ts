import { describe, it, expect } from 'vitest';
import {
  ProjectAnalysisSchema,
  PortfolioSchemaSchema,
  PortfolioChangeSchema,
  ValidationResultSchema,
  AgentRunSchema,
} from '../src/models/index.js';

describe('Typed Data Models Zod Validation', () => {
  it('validates ProjectAnalysis model', () => {
    const validProject = {
      repoUrl: 'https://github.com/octocat/Hello-World',
      name: 'Hello-World',
      description: 'Test repository',
      techStack: ['TypeScript', 'Node.js'],
      keyFeatures: ['Feature A', 'Feature B'],
      assets: [{ type: 'image', path: 'assets/demo.png' }],
      analyzedAt: new Date().toISOString(),
    };

    const parsed = ProjectAnalysisSchema.safeParse(validProject);
    expect(parsed.success).toBe(true);
  });

  it('validates PortfolioSchema model', () => {
    const validPortfolio = {
      schemaVersion: '1.1.0',
      portfolioName: 'tushal-pandey-portfolio',
      framework: 'React 18',
      buildSystem: 'Vite 6 + TypeScript 5',
      projectDataFile: 'src/data/projects.ts',
      assetDirectory: 'public/',
      requiredFields: ['id', 'title'],
      optionalFields: ['urlDomain'],
      imageFormat: 'PNG',
      imageReferenceStyle: '/filename.png',
      buildCommand: 'npm run build',
      lintCommand: 'npm run lint',
      testCommand: null,
      deploymentConfig: 'Vercel',
      typeDefinition: 'export interface Project {}',
      renderingComponent: 'src/components/Projects.tsx',
      orderingRule: 'Index order',
      featuredRule: 'Prepend active projects',
      projects: [
        {
          id: 'proj-1',
          title: 'Project One',
          slug: 'project-one',
          description: 'A great project',
          tags: ['React', 'TypeScript'],
        },
      ],
      categories: ['Web', 'Mobile'],
      supportedAssetTypes: ['image/png'],
    };

    const parsed = PortfolioSchemaSchema.safeParse(validPortfolio);
    expect(parsed.success).toBe(true);
  });

  it('validates PortfolioChange model', () => {
    const validChange = {
      id: 'change-1',
      projectId: 'proj-1',
      action: 'add' as const,
      newEntry: { title: 'Project One' },
      modifiedFiles: [{ path: 'projects.json', action: 'modify' as const }],
      assetsToAdd: [{ sourcePath: 'src/demo.png', targetPath: 'public/demo.png' }],
      gitBranchName: 'portfolio/add-proj-1',
      commitMessage: 'feat: add proj 1',
    };

    const parsed = PortfolioChangeSchema.safeParse(validChange);
    expect(parsed.success).toBe(true);
  });

  it('validates ValidationResult model', () => {
    const validResult = {
      isValid: true,
      errors: [],
      warnings: [{ code: 'WARN_1', message: 'Non-critical warning' }],
      validatedAt: new Date().toISOString(),
    };

    const parsed = ValidationResultSchema.safeParse(validResult);
    expect(parsed.success).toBe(true);
  });

  it('validates AgentRun model', () => {
    const validRun = {
      runId: 'run-123',
      targetRepoUrl: 'https://github.com/octocat/Hello-World',
      status: 'completed' as const,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      steps: [
        {
          name: 'analyze',
          status: 'completed' as const,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const parsed = AgentRunSchema.safeParse(validRun);
    expect(parsed.success).toBe(true);
  });
});
