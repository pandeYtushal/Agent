import { z } from 'zod';

export const PortfolioEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  category: z.string().optional(),
  link: z.string().url().optional(),
  repoLink: z.string().url().optional(),
  image: z.string().optional(),
  featured: z.boolean().optional(),
});

export const PortfolioSchemaSchema = z.object({
  schemaVersion: z.string(),
  portfolioName: z.string(),
  framework: z.string(),
  buildSystem: z.string(),
  projectDataFile: z.string(),
  assetDirectory: z.string(),
  requiredFields: z.array(z.string()),
  optionalFields: z.array(z.string()),
  imageFormat: z.string(),
  imageReferenceStyle: z.string(),
  buildCommand: z.string(),
  lintCommand: z.string().nullable(),
  testCommand: z.string().nullable(),
  deploymentConfig: z.string(),
  typeDefinition: z.string(),
  renderingComponent: z.string(),
  orderingRule: z.string(),
  featuredRule: z.string(),
  projects: z.array(PortfolioEntrySchema),
  categories: z.array(z.string()),
  supportedAssetTypes: z.array(z.string()),
});

export type PortfolioEntry = z.infer<typeof PortfolioEntrySchema>;
export type PortfolioSchema = z.infer<typeof PortfolioSchemaSchema>;
