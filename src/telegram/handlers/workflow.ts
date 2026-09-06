import { Context } from 'grammy';
import { PublishingAgentEngine } from '../../agent/index.js';
import { createProjectActionKeyboard } from '../keyboards.js';
import {
  formatProgressMessage,
  formatProjectReadyCard,
} from '../formatter.js';
import { logger } from '../../logger/index.js';

export interface TelegramHandlersOptions {
  engine: PublishingAgentEngine;
  portfolioPath?: string;
}

// In-memory state tracking active drafts per session
const userDrafts: Map<number, { githubUrl: string; timestamp: string }> = new Map();

/**
 * Natural language intent parser
 */
export function parseNaturalLanguageIntent(text: string): {
  intent: 'add' | 'update' | 'drafts' | 'status' | 'help' | 'repos' | 'unknown';
  extractedUrl?: string;
  projectName?: string;
} {
  const clean = text.trim();

  // URL extraction regex
  const urlMatch = clean.match(/https?:\/\/github\.com\/[^\s]+/i);
  if (urlMatch) {
    if (clean.toLowerCase().includes('update')) {
      return { intent: 'update', extractedUrl: urlMatch[0] };
    }
    return { intent: 'add', extractedUrl: urlMatch[0] };
  }

  const lower = clean.toLowerCase();
  if (
    lower.includes('how many repo') ||
    lower.includes('how many repositories') ||
    lower.includes('repo count') ||
    lower.includes('count repo') ||
    lower.includes('my repo') ||
    lower.includes('show repo') ||
    lower === 'repos' ||
    lower === '/repos'
  ) {
    return { intent: 'repos' };
  }
  if (lower.startsWith('add ') || lower.includes('add this project')) {
    return { intent: 'add' };
  }
  if (lower.includes('update ')) {
    const nameMatch = clean.match(/update\s+([a-zA-Z0-9_-]+)/i);
    return { intent: 'update', projectName: nameMatch ? nameMatch[1] : undefined };
  }
  if (lower.includes('draft') || lower.includes('show my drafts')) {
    return { intent: 'drafts' };
  }
  if (lower.includes('status') || lower.includes('health')) {
    return { intent: 'status' };
  }
  if (lower.includes('help') || lower.includes('how to use')) {
    return { intent: 'help' };
  }

  return { intent: 'unknown' };
}

export function getUserDraft(userId: number): { githubUrl: string; timestamp: string } | undefined {
  return userDrafts.get(userId);
}

export function clearUserDraft(userId: number): void {
  userDrafts.delete(userId);
}

/**
 * Handles the step-by-step project analysis flow with progress messages
 */
export async function handleProjectAnalysisFlow(ctx: Context, engine: PublishingAgentEngine, githubUrl: string) {
  const userId = ctx.from?.id;
  if (userId) {
    userDrafts.set(userId, { githubUrl, timestamp: new Date().toISOString() });
  }

  const progressMsg = await ctx.reply(formatProgressMessage(0), { parse_mode: 'Markdown' });

  try {
    // Step 1 - Analyze Project
    await ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, formatProgressMessage(3), { parse_mode: 'Markdown' });

    const preview = await engine.preview(githubUrl, { updateExisting: true });

    // Step 2 - Analyzed Portfolio
    await ctx.api.editMessageText(ctx.chat!.id, progressMsg.message_id, formatProgressMessage(6), { parse_mode: 'Markdown' });

    // Delete progress message and display Project Ready card with inline keyboard
    await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});

    const card = formatProjectReadyCard(preview.projectAnalysis, preview.portfolioChange);
    const keyboard = createProjectActionKeyboard(githubUrl);

    await ctx.reply(card, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (err: any) {
    logger.error('Error during Telegram project analysis flow', err);
    await ctx.api.deleteMessage(ctx.chat!.id, progressMsg.message_id).catch(() => {});
    const cleanMsg = String(err.message || 'Unknown error').replace(/[_*`[\]]/g, ' ');
    await ctx.reply(`Analysis Failed: ${cleanMsg}`);
  }
}
