import { z } from 'zod';

export const ValidationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(ValidationIssueSchema),
  warnings: z.array(ValidationIssueSchema),
  validatedAt: z.string().datetime(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
