import dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigurationError } from '../errors/index.js';

// Load .env file if present
dotenv.config();

/**
 * Zod schema for environment variables configuration
 */
export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GITHUB_TOKEN: z.string().optional(),
  PORTFOLIO_PATH: z.string().default('./portfolio'),
  AI_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  WEBHOOK_PORT: z.coerce.number().default(3000),
  AUTOMATION_MODE: z.enum(['require_approval', 'trusted']).default('require_approval'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * List of sensitive key patterns that must be redacted from logs/outputs
 */
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /pass/i,
  /credential/i,
  /env/i,
  /telegram/i,
  /webhook/i,
];

/**
 * Loads and validates configuration from environment variables.
 */
export function loadConfig(overrideEnv?: Record<string, string | undefined>): Config {
  const envToParse = overrideEnv ?? process.env;
  const result = ConfigSchema.safeParse(envToParse);

  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new ConfigurationError(`Invalid environment configuration: ${errorDetails}`);
  }

  return result.data;
}

/**
 * Utility to redact sensitive values from any object or record before logging or outputting.
 */
export function sanitizeForLogging<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Mask potential token strings
    if (obj.length > 10 && (obj.startsWith('ghp_') || obj.startsWith('github_pat_') || obj.startsWith('sk-') || obj.includes(':AA'))) {
      return '[REDACTED_SECRET]' as unknown as T;
    }
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey && value && typeof value === 'string') {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
