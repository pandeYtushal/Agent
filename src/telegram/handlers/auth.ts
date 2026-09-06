import { Context, NextFunction } from 'grammy';
import { logger } from '../../logger/index.js';

/**
 * Checks whether a given Telegram user ID is authorized.
 */
export function isUserAuthorized(userId: number | string | undefined, allowedUserId?: string): boolean {
  if (!allowedUserId || allowedUserId.trim() === '') {
    // If no restricted user ID is set in config, block by default for security
    return false;
  }
  if (userId === undefined || userId === null) return false;
  return String(userId) === String(allowedUserId).trim();
}

/**
 * Grammy middleware rejecting unauthorized Telegram users.
 */
export function createAuthMiddleware(allowedUserId?: string) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const fromId = ctx.from?.id;
    if (!isUserAuthorized(fromId, allowedUserId)) {
      logger.warn(`Security block: Unauthorized Telegram user ID "${fromId}" attempted to access bot commands.`);
      await ctx.reply('*Unauthorized user.*\nAccess to this Portfolio Publishing Agent is restricted to the authorized owner.', {
        parse_mode: 'Markdown',
      });
      return;
    }
    return next();
  };
}
