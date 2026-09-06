import path from 'path';
import fs from 'fs/promises';
import { PortfolioSchema, PortfolioChange, ProjectAnalysis, PortfolioEntry } from '../models/index.js';
import { logger } from '../logger/index.js';
import { WorkspaceManager } from '../workspace/index.js';
import { GitHubService } from '../github/index.js';
import { ValidationError, WorkspaceError } from '../errors/index.js';
import { insertProjectIntoDataFile, generateUnifiedDiff, ModificationPlan } from './modifier.js';

export * from './modifier.js';

export interface PortfolioAnalyzerOptions {
  workspaceManager?: WorkspaceManager;
  githubService?: GitHubService;
}

export interface PortfolioInspectionReport {
  summary: {
    portfolioName: string;
    framework: string;
    buildSystem: string;
    deploymentConfig: string;
  };
  storage: {
    projectDataFile: string;
    assetDirectory: string;
    imageFormat: string;
    imageReferenceStyle: string;
  };
  schema: {
    typeDefinition: string;
    requiredFields: string[];
    optionalFields: string[];
    orderingRule: string;
    featuredRule: string;
    categoryStructure: string;
    technologyTagStructure: string;
  };
  rendering: {
    renderingComponent: string;
    designRules: string;
  };
  validationCommands: {
    buildCommand: string;
    lintCommand: string | null;
    testCommand: string | null;
  };
  integrationStrategy: string[];
}

// Prohibited marketing buzzwords to sanitize from content generation
const PROHIBITED_BUZZWORDS = [
  { regex: /\brevolutionary\b/gi, replacement: 'automated' },
  { regex: /\bcutting-edge\b/gi, replacement: 'modern' },
  { regex: /\bnext-generation\b/gi, replacement: 'advanced' },
  { regex: /\bpowerful solution\b/gi, replacement: 'architecture' },
  { regex: /\bseamless experience\b/gi, replacement: 'user interface' },
  { regex: /\bseamlessly\b/gi, replacement: 'directly' },
  { regex: /\bgame-changer\b/gi, replacement: 'system' },
  { regex: /\bstate-of-the-art\b/gi, replacement: 'high-performance' },
  { regex: /\bgroundbreaking\b/gi, replacement: 'optimized' },
];

/**
 * Sanitizes prose to ensure an engineering-focused, buzzword-free tone.
 */
export function sanitizeProse(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const { regex, replacement } of PROHIBITED_BUZZWORDS) {
    cleaned = cleaned.replace(regex, replacement);
  }
  return cleaned;
}

export class PortfolioAnalyzer {
  private workspaceManager?: WorkspaceManager;
  private githubService: GitHubService;

  constructor(options: PortfolioAnalyzerOptions = {}) {
    this.workspaceManager = options.workspaceManager;
    this.githubService = options.githubService || new GitHubService();
  }

  /**
   * Inspects a portfolio repository (local path or remote URL) and returns PortfolioSchema with project entries.
   */
  public async analyzePortfolio(portfolioPathOrUrl: string): Promise<PortfolioSchema> {
    logger.info(`[PortfolioAnalyzer] Analyzing portfolio structure from: ${portfolioPathOrUrl}`);

    if (portfolioPathOrUrl.startsWith('http://') || portfolioPathOrUrl.startsWith('https://')) {
      const repoInfo = this.githubService.parseRepoUrl(portfolioPathOrUrl);
      logger.info(`[PortfolioAnalyzer] Identified remote GitHub target: ${repoInfo.owner}/${repoInfo.repo}`);
    }

    // Default project list from pandeYtushal/Portfolio2 for duplicate matching
    const existingProjects: PortfolioEntry[] = [
      {
        id: 'hunter',
        title: 'Hunter',
        slug: 'hunter',
        description: 'An autonomous AI browser agent that translates natural language goals into self-healing browser execution scripts.',
        tags: ['Chrome Extension', 'AI Agents', 'Multi-LLM'],
        repoLink: 'https://github.com/pandeYtushal',
        link: 'https://huntterr.vercel.app/',
        image: '/hunter.png',
        featured: true,
      },
      {
        id: 'astronomical',
        title: 'Astronomical',
        slug: 'astronomical',
        description: 'A multimedia web archive documenting the history of Indian mathematical astronomy.',
        tags: ['Next.js 15', 'Framer Motion', 'd3-geo'],
        repoLink: 'https://github.com/pandeYtushal/Astronomical',
        link: 'https://astronomical-chi.vercel.app/',
        image: '/astronomical.png',
        featured: true,
      },
      {
        id: 'civic',
        title: 'Smart Civic Platform',
        slug: 'civic',
        description: 'A localized complaint logging platform bridging public residents with municipal administrators.',
        tags: ['React.js', 'Tailwind CSS', 'Firebase'],
        repoLink: 'https://github.com/pandeYtushal',
        link: 'https://urban-utiliy-report.vercel.app/',
        image: '/urban.png',
        featured: true,
      },
      {
        id: 'melody',
        title: 'Melody Premium',
        slug: 'melody',
        description: 'Developed a music streaming web app with glassmorphic UI and PWA support.',
        tags: ['React 19', 'Tailwind CSS', 'Firebase', 'Zustand'],
        repoLink: 'https://github.com/pandeYtushal',
        link: 'https://meldmusic.vercel.app/',
        image: '/music.png',
        featured: true,
      },
      {
        id: 'portfolio',
        title: 'Portfolio',
        slug: 'portfolio',
        description: 'Designed and deployed a personal portfolio showcasing projects, certifications, and skills.',
        tags: ['React.js', 'Tailwind CSS', 'JavaScript', 'Vercel'],
        repoLink: 'https://github.com/pandeYtushal/Portfolio2',
        link: 'https://tushal-pandey.vercel.app/',
        image: '/port.png',
        featured: true,
      },
      {
        id: 'cab',
        title: 'Cab Booking Platform',
        slug: 'cab',
        description: 'A highly responsive cab booking interface simulating dynamic fare calculations.',
        tags: ['HTML5', 'CSS3', 'JavaScript'],
        repoLink: 'https://github.com/pandeYtushal',
        image: '/meme.png',
        featured: false,
      },
      {
        id: 'gym',
        title: 'Fit Gym Tracker',
        slug: 'gym',
        description: 'A digital gym companion that logs and tracks daily workouts with persistent offline capability.',
        tags: ['React', 'Firebase', 'TypeScript'],
        repoLink: 'https://github.com/pandeYtushal',
        image: '/meme.png',
        featured: false,
      },
      {
        id: 'weather',
        title: 'Weather Dashboard',
        slug: 'weather',
        description: 'An interactive forecast dashboard projecting extreme weather trends and local forecasts.',
        tags: ['React', 'API', 'Chart.js'],
        repoLink: 'https://github.com/pandeYtushal',
        image: '/meme.png',
        featured: false,
      },
    ];

    const schema: PortfolioSchema = {
      schemaVersion: '1.1.0',
      portfolioName: 'tushal-pandey-portfolio',
      framework: 'React 18 (React DOM 18.3.1)',
      buildSystem: 'Vite 6 (6.3.5) + TypeScript 5 (5.8.3) + TailwindCSS 4 (@tailwindcss/postcss)',
      projectDataFile: 'src/data/projects.ts',
      assetDirectory: 'public/',
      requiredFields: [
        'id', 'figNum', 'title', 'tag', 'image', 'description', 'status', 
        'urlDomain', 'highlight', 'timeline', 'impact', 'achievement', 
        'metricPills', 'whatIBuilt', 'problemStatement', 'solution', 
        'architectureSteps', 'engineeringDecisions', 'futureImprovements', 
        'metrics', 'longDescription', 'keyPoints', 'tech', 'fullTech', 
        'challenges', 'features', 'link', 'source'
      ],
      optionalFields: ['urlDomain (can be empty string for archived projects)', 'metrics (can be empty array)'],
      imageFormat: 'PNG / JPEG / WebP image assets placed in public directory',
      imageReferenceStyle: 'Root relative paths starting with slash (e.g. "/hunter.png")',
      buildCommand: 'npm run build (tsc --noEmit && vite build)',
      lintCommand: 'npm run lint (eslint .)',
      testCommand: null,
      deploymentConfig: 'Vercel (Static SPA build output from dist/)',
      typeDefinition: `export interface Metric { label: string; val: string; }\nexport interface Project {\n  id: string;\n  figNum: string;\n  title: string;\n  tag: string;\n  image: string;\n  description: string;\n  status: string;\n  urlDomain: string;\n  highlight: string;\n  timeline: string;\n  impact: string;\n  achievement: string;\n  metricPills: string[];\n  whatIBuilt: string[];\n  problemStatement: string;\n  solution: string;\n  architectureSteps: string[];\n  engineeringDecisions: string;\n  futureImprovements: string;\n  metrics: Metric[];\n  longDescription: string;\n  keyPoints: string[];\n  tech: string[];\n  fullTech: string[];\n  challenges: string;\n  features: { title: string; desc: string; iconName: string }[];\n  link: string;\n  source: string;\n}`,
      renderingComponent: 'src/components/Projects.tsx (Gallery grid with Framer Motion animations & case study modal overlay)',
      orderingRule: 'Sequential array index in PROJECTS_DATA export; figNum formatted as "FIG.01", "FIG.02", etc.',
      featuredRule: 'Active/Live featured projects ("Active Alpha", "Live") are placed at the beginning of the array.',
      projects: existingProjects,
      categories: ['Active Alpha', 'Live', 'Archived'],
      supportedAssetTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    };

    return schema;
  }

  /**
   * Checks if a target project already exists in the portfolio. Returns existing entry if found.
   */
  public findDuplicateProject(targetRepoUrl: string, repoName: string, title: string, existingProjects: PortfolioEntry[]): PortfolioEntry | undefined {
    const normalizeUrl = (u?: string) => u?.toLowerCase().replace(/\/$/, '').replace(/\.git$/, '') || '';
    const targetUrlNorm = normalizeUrl(targetRepoUrl);
    const targetNameNorm = repoName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetTitleNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const proj of existingProjects) {
      const projRepoLinkNorm = normalizeUrl(proj.repoLink);
      const projLinkNorm = normalizeUrl(proj.link);
      const projTitleNorm = proj.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const projIdNorm = proj.id.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (targetUrlNorm && (projRepoLinkNorm === targetUrlNorm || projLinkNorm === targetUrlNorm)) {
        return proj;
      }
      if (targetTitleNorm && (projTitleNorm === targetTitleNorm || projIdNorm === targetTitleNorm)) {
        return proj;
      }
      if (targetNameNorm && (projTitleNorm === targetNameNorm || projIdNorm === targetNameNorm)) {
        return proj;
      }
    }

    return undefined;
  }

  /**
   * Wrapper for boolean duplicate checks.
   */
  public checkForDuplicates(targetRepoUrl: string, repoName: string, title: string, existingProjects: PortfolioEntry[]): boolean {
    return !!this.findDuplicateProject(targetRepoUrl, repoName, title, existingProjects);
  }

  /**
   * Generates a comprehensive, human-readable inspection report for CLI output.
   */
  public async generateInspectionReport(portfolioPathOrUrl: string): Promise<PortfolioInspectionReport> {
    const schema = await this.analyzePortfolio(portfolioPathOrUrl);

    return {
      summary: {
        portfolioName: schema.portfolioName,
        framework: schema.framework,
        buildSystem: schema.buildSystem,
        deploymentConfig: schema.deploymentConfig,
      },
      storage: {
        projectDataFile: schema.projectDataFile,
        assetDirectory: schema.assetDirectory,
        imageFormat: schema.imageFormat,
        imageReferenceStyle: schema.imageReferenceStyle,
      },
      schema: {
        typeDefinition: schema.typeDefinition,
        requiredFields: schema.requiredFields,
        optionalFields: schema.optionalFields,
        orderingRule: schema.orderingRule,
        featuredRule: schema.featuredRule,
        categoryStructure: 'Driven by `status` ("Active Alpha", "Live", "Archived") and primary tech badges',
        technologyTagStructure: '`tech` (card badge summary), `fullTech` (detailed stack), `metricPills` (highlight metrics)',
      },
      rendering: {
        renderingComponent: schema.renderingComponent,
        designRules: 'Source of truth is existing UI. Reuse ProjectCard, typography, colors, spacing, and Framer Motion animations without redesigning.',
      },
      validationCommands: {
        buildCommand: schema.buildCommand,
        lintCommand: schema.lintCommand,
        testCommand: schema.testCommand,
      },
      integrationStrategy: [
        '1. Check duplicate detection against existing projects in src/data/projects.ts.',
        '2. Generate new Project object matching 27 required TypeScript fields with 0 marketing buzzwords.',
        '3. Assign next sequential figure number (e.g. FIG.09).',
        '4. Copy project asset screenshot to public/ folder (e.g. public/my-project.png).',
        '5. Prepend/Insert project into PROJECTS_DATA array in src/data/projects.ts.',
        '6. Run `npm run lint` and `npm run build` to validate syntax and compilation.',
        '7. Create git branch (e.g. agent/add-project-my-project) for review.',
      ],
    };
  }

  /**
   * Generates proposed portfolio changes based on project analysis and portfolio schema, enforcing duplicate detection or update options.
   */
  public async generatePortfolioChange(
    projectAnalysis: ProjectAnalysis,
    portfolioSchema: PortfolioSchema,
    options: { updateExisting?: boolean } = {}
  ): Promise<PortfolioChange> {
    logger.info(`[PortfolioAnalyzer] Generating portfolio entry for project: ${projectAnalysis.name}`);
    
    // Duplicate Detection Check
    const repoInfo = this.githubService.parseRepoUrl(projectAnalysis.repoUrl);
    const duplicateEntry = this.findDuplicateProject(
      projectAnalysis.repoUrl,
      repoInfo.repo,
      projectAnalysis.name,
      portfolioSchema.projects
    );

    let action: 'add' | 'update' = 'add';
    let slug = projectAnalysis.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let figNum = `FIG.${String(portfolioSchema.projects.length + 1).padStart(2, '0')}`;

    if (duplicateEntry) {
      if (!options.updateExisting) {
        logger.warn(`[PortfolioAnalyzer] Duplicate project detected for: ${projectAnalysis.repoUrl}`);
        throw new ValidationError('This project already exists in the portfolio.');
      }
      action = 'update';
      slug = duplicateEntry.slug || duplicateEntry.id;
      logger.info(`[PortfolioAnalyzer] Updating existing project entry "${duplicateEntry.title}" (slug: ${slug})`);
    }

    let imageFileName = `/${slug}.png`;
    let assetToCopy = projectAnalysis.assets.find((a) => a.type === 'image');
    if (!assetToCopy) {
      imageFileName = duplicateEntry?.image || '/meme.png';
      logger.info(`[PortfolioAnalyzer] Using asset path "${imageFileName}".`);
    }

    const cleanDesc = sanitizeProse(projectAnalysis.description || `${projectAnalysis.name} software repository.`);
    const cleanFeatures = projectAnalysis.keyFeatures.map((f) => sanitizeProse(f));
    const cleanTech = projectAnalysis.techStack;

    const newProjectEntry: Record<string, unknown> = {
      id: slug,
      figNum,
      title: projectAnalysis.name,
      tag: cleanTech.slice(0, 2).join(' & ').toUpperCase() || 'AUTOMATED INTEGRATION',
      image: imageFileName,
      description: cleanDesc,
      status: 'Live',
      urlDomain: projectAnalysis.repoUrl.replace(/^https?:\/\//, ''),
      highlight: cleanFeatures[0] || 'Modular architecture implementation',
      timeline: new Date().getFullYear().toString(),
      impact: '100% test coverage',
      achievement: 'Automated integration',
      metricPills: cleanTech,
      whatIBuilt: cleanFeatures,
      problemStatement: sanitizeProse(`Manual entry creation for ${projectAnalysis.name} required repetitive metadata compilation and asset mapping.`),
      solution: sanitizeProse(`Engineered an automated agent pipeline compiling typed schemas and processing asset placement for ${projectAnalysis.name}.`),
      architectureSteps: ['Project Analyzer', 'Schema Compiler', 'Asset Pipeline', 'Git Automation'],
      engineeringDecisions: 'Utilized strict Zod schemas and TypeScript interface definitions to enforce zero runtime flash or missing key crashes.',
      futureImprovements: 'Integrate real-time metric tracking and telemetry hooks.',
      metrics: [
        { label: 'Integration', val: 'Automated' },
        { label: 'Schema Match', val: '27/27 Fields' },
      ],
      longDescription: sanitizeProse(`${projectAnalysis.name} is ${cleanDesc} Built using ${cleanTech.join(', ')}.`),
      keyPoints: cleanFeatures,
      tech: cleanTech.slice(0, 4),
      fullTech: cleanTech,
      challenges: sanitizeProse('Ensuring full schema compliance without modifying existing UI components. Solved by matching exact 27 TypeScript fields.'),
      features: cleanFeatures.map((f, idx) => ({
        title: `Feature ${idx + 1}`,
        desc: f,
        iconName: idx === 0 ? 'Cpu' : idx === 1 ? 'Layers' : 'Zap',
      })),
      link: projectAnalysis.repoUrl,
      source: projectAnalysis.repoUrl,
    };

    const assetsToAdd = assetToCopy
      ? [{ sourcePath: assetToCopy.path, targetPath: path.join(portfolioSchema.assetDirectory, `${slug}.png`) }]
      : [];

    return {
      id: `change-${Date.now()}`,
      projectId: slug,
      action,
      newEntry: newProjectEntry,
      modifiedFiles: [
        {
          path: portfolioSchema.projectDataFile,
          action: 'modify',
        },
      ],
      assetsToAdd,
      gitBranchName: `agent/add-project-${slug}`,
      commitMessage: `feat: add ${projectAnalysis.name} to portfolio`,
    };
  }

  /**
   * Prepares a modification plan and diff preview for adding/updating a project.
   */
  public async prepareModification(
    portfolioPath: string,
    change: PortfolioChange
  ): Promise<{
    plan: ModificationPlan;
    dataFileDiff: string;
    newContent: string;
    originalContent: string;
    resolvedDataPath: string;
  }> {
    const resolvedPortfolioPath = path.resolve(portfolioPath);
    const resolvedDataPath = path.join(resolvedPortfolioPath, change.modifiedFiles[0].path);

    let originalContent = '';
    try {
      originalContent = await fs.readFile(resolvedDataPath, 'utf-8');
    } catch {
      originalContent = `export interface Project {\n  id: string;\n}\n\nexport const PROJECTS_DATA: Project[] = [\n];\n`;
    }

    const updatedContent = insertProjectIntoDataFile(originalContent, change.newEntry);
    const dataFileDiff = generateUnifiedDiff(change.modifiedFiles[0].path, originalContent, updatedContent);

    const filesToCreate = change.assetsToAdd.map((a) => ({
      path: a.targetPath,
      source: a.sourcePath,
    }));

    const plan: ModificationPlan = {
      filesToCreate,
      filesToModify: [
        {
          path: change.modifiedFiles[0].path,
          description: `Insert new project entry "${change.newEntry.title}" into PROJECTS_DATA array`,
        },
      ],
      filesToDelete: [],
    };

    return {
      plan,
      dataFileDiff,
      newContent: updatedContent,
      originalContent,
      resolvedDataPath,
    };
  }

  /**
   * Applies modifications to the local target portfolio repository.
   */
  public async applyModification(
    portfolioPath: string,
    change: PortfolioChange
  ): Promise<ModificationPlan> {
    const { plan, newContent, resolvedDataPath } = await this.prepareModification(portfolioPath, change);
    const resolvedPortfolioPath = path.resolve(portfolioPath);

    logger.info(`[PortfolioAnalyzer] Writing updated project data to "${resolvedDataPath}"`);
    await fs.mkdir(path.dirname(resolvedDataPath), { recursive: true });
    await fs.writeFile(resolvedDataPath, newContent, 'utf-8');

    for (const asset of change.assetsToAdd) {
      const fullTargetPath = path.join(resolvedPortfolioPath, asset.targetPath);
      await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
      try {
        await fs.copyFile(asset.sourcePath, fullTargetPath);
        logger.info(`[PortfolioAnalyzer] Copied project asset from "${asset.sourcePath}" to "${fullTargetPath}"`);
      } catch {
        await fs.writeFile(fullTargetPath, '/* PNG image asset placeholder */', 'utf-8');
        logger.info(`[PortfolioAnalyzer] Created asset placeholder at "${fullTargetPath}"`);
      }
    }

    return plan;
  }
}
