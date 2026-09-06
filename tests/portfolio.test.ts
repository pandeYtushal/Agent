import { describe, it, expect } from 'vitest';
import { PortfolioAnalyzer, insertProjectIntoDataFile, generateUnifiedDiff } from '../src/portfolio/index.js';
import { PublishingAgentEngine } from '../src/agent/index.js';

describe('Portfolio Analyzer & Modification Engine (Phase 4)', () => {
  const analyzer = new PortfolioAnalyzer();
  const portfolioUrl = 'https://github.com/pandeYtushal/Portfolio2';

  it('inserts new project object into TypeScript PROJECTS_DATA array cleanly', () => {
    const existingCode = `export interface Project {\n  id: string;\n}\n\nexport const PROJECTS_DATA: Project[] = [\n  {\n    id: "existing-1"\n  }\n];\n`;
    const newEntry = {
      id: 'new-project',
      title: 'New Project',
      tech: ['TypeScript', 'React'],
    };

    const updatedCode = insertProjectIntoDataFile(existingCode, newEntry);
    expect(updatedCode).toContain('export const PROJECTS_DATA: Project[] = [');
    expect(updatedCode).toContain('id: "new-project"');
    expect(updatedCode).toContain('id: "existing-1"');
  });

  it('generates unified diff for code changes', () => {
    const orig = 'line 1\nline 2\n';
    const updated = 'line 1\nline 2\n+ added line 3\n';
    const diff = generateUnifiedDiff('src/data/projects.ts', orig, updated);
    expect(diff).toContain('--- a/src/data/projects.ts');
    expect(diff).toContain('+++ b/src/data/projects.ts');
  });

  it('prepares modification plan and diff in PortfolioAnalyzer', async () => {
    const schema = await analyzer.analyzePortfolio(portfolioUrl);
    const newAnalysis = {
      repoUrl: 'https://github.com/octocat/Unique-Widget',
      name: 'Unique-Widget',
      description: 'A widget tool for developers.',
      techStack: ['TypeScript', 'Node.js'],
      keyFeatures: ['Widget Feature A'],
      assets: [{ type: 'image' as const, path: 'assets/hero.png' }],
      analyzedAt: new Date().toISOString(),
    };

    const change = await analyzer.generatePortfolioChange(newAnalysis, schema);
    const { plan, dataFileDiff } = await analyzer.prepareModification('./portfolio', change);

    expect(plan.filesToModify.length).toBe(1);
    expect(plan.filesToModify[0].path).toBe('src/data/projects.ts');
    expect(dataFileDiff).toContain('Unique-Widget');
  });

  it('executes dry-run via PublishingAgentEngine without failing', async () => {
    const engine = new PublishingAgentEngine();
    const result = await engine.add('https://github.com/octocat/Unique-Widget-2', { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.plan.filesToModify.length).toBe(1);
    expect(result.diff).toContain('Unique-Widget-2');
  });
});
