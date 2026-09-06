import { z } from 'zod';

export const ModifiedFileSchema = z.object({
  path: z.string(),
  action: z.enum(['create', 'modify', 'delete']),
  content: z.string().optional(),
});

export const AssetTransferSchema = z.object({
  sourcePath: z.string(),
  targetPath: z.string(),
});

export const PortfolioChangeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  action: z.enum(['add', 'update', 'remove']),
  newEntry: z.record(z.unknown()),
  modifiedFiles: z.array(ModifiedFileSchema),
  assetsToAdd: z.array(AssetTransferSchema),
  gitBranchName: z.string(),
  commitMessage: z.string(),
});

export type ModifiedFile = z.infer<typeof ModifiedFileSchema>;
export type AssetTransfer = z.infer<typeof AssetTransferSchema>;
export type PortfolioChange = z.infer<typeof PortfolioChangeSchema>;
