import { z } from 'zod';
import { ProjectAnalysisSchema } from './project-analysis.js';
import { PortfolioChangeSchema } from './portfolio-change.js';
import { ValidationResultSchema } from './validation-result.js';

export const AgentRunStatusSchema = z.enum([
  'pending',
  'analyzing_project',
  'analyzing_portfolio',
  'generating_entry',
  'validating',
  'git_branching',
  'completed',
  'failed',
]);

export const AgentRunStepSchema = z.object({
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  timestamp: z.string().datetime(),
  message: z.string().optional(),
});

export const AgentRunSchema = z.object({
  runId: z.string(),
  targetRepoUrl: z.string().url(),
  status: AgentRunStatusSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  steps: z.array(AgentRunStepSchema),
  projectAnalysis: ProjectAnalysisSchema.optional(),
  portfolioChange: PortfolioChangeSchema.optional(),
  validationResult: ValidationResultSchema.optional(),
  error: z.string().optional(),
});

export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
