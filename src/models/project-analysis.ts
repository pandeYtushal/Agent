import { z } from 'zod';

export const ProjectAssetSchema = z.object({
  type: z.enum(['image', 'video', 'document', 'other']),
  path: z.string(),
  description: z.string().optional(),
});

export const ProjectAnalysisSchema = z.object({
  repoUrl: z.string().url(),
  name: z.string(),
  description: z.string(),
  techStack: z.array(z.string()),
  keyFeatures: z.array(z.string()),
  assets: z.array(ProjectAssetSchema),
  readmeContent: z.string().optional(),
  suggestedCategory: z.string().optional(),
  analyzedAt: z.string().datetime(),
});

export type ProjectAsset = z.infer<typeof ProjectAssetSchema>;
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
