import { Bot } from 'grammy';
import { logger } from '../logger/index.js';
import { formatNewProjectDetectedCard } from '../telegram/formatter.js';
import { createNewProjectDetectedKeyboard } from '../telegram/keyboards.js';

export interface SuccessNotificationDetails {
  projectName: string;
  githubUrl: string;
  prUrl?: string;
  prNumber?: number;
  deploymentUrl?: string;
  filesChanged?: string[];
}

export interface FailureNotificationDetails {
  projectName?: string;
  repoUrl: string;
  errorMessage: string;
  error?: unknown;
}

export interface ApprovalNotificationDetails {
  projectName: string;
  repoUrl: string;
  description: string;
}

export interface INotificationService {
  notifySuccess(details: SuccessNotificationDetails): Promise<void>;
  notifyFailure(details: FailureNotificationDetails): Promise<void>;
  notifyApprovalRequired(details: ApprovalNotificationDetails): Promise<void>;
}

/**
 * Console/Logger fallback implementation of INotificationService
 */
export class LoggerNotificationAdapter implements INotificationService {
  public async notifySuccess(details: SuccessNotificationDetails): Promise<void> {
    logger.info(`[NotificationService] SUCCESS: ${details.projectName} published! PR: ${details.prUrl || 'N/A'}`);
  }

  public async notifyFailure(details: FailureNotificationDetails): Promise<void> {
    logger.error(`[NotificationService] FAILURE: Could not publish ${details.repoUrl}: ${details.errorMessage}`);
  }

  public async notifyApprovalRequired(details: ApprovalNotificationDetails): Promise<void> {
    logger.info(`[NotificationService] APPROVAL REQUIRED: ${details.projectName} (${details.repoUrl})`);
  }
}

/**
 * Telegram Bot implementation of INotificationService
 */
export class TelegramNotificationAdapter implements INotificationService {
  private bot: Bot;
  private chatId: string;

  constructor(bot: Bot, chatId: string) {
    this.bot = bot;
    this.chatId = chatId;
  }

  public async notifySuccess(details: SuccessNotificationDetails): Promise<void> {
    const prInfo = details.prUrl ? `\n\n🔗 *Pull Request*: [View PR](${details.prUrl})` : '';
    const deployInfo = details.deploymentUrl ? `\n🌐 *Deployment*: ${details.deploymentUrl}` : '\n✓ *Deployment*: Active / Ready';

    const card =
      `🚀 *Portfolio updated*\n\n` +
      `*${details.projectName}* has been added to your portfolio.\n\n` +
      `✓ Project data\n` +
      `✓ Image\n` +
      `✓ Build\n` +
      `✓ GitHub\n` +
      `✓ Deployment` +
      `${prInfo}${deployInfo}`;

    try {
      await this.bot.api.sendMessage(this.chatId, card, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('[TelegramNotificationAdapter] Failed to send success notification', err);
    }
  }

  public async notifyFailure(details: FailureNotificationDetails): Promise<void> {
    const name = details.projectName ? `*${details.projectName}*` : `\`${details.repoUrl}\``;
    const card =
      `*Portfolio Update Failed*\n\n` +
      `Could not publish project ${name}:\n` +
      `_${details.errorMessage}_\n\n` +
      `*Workflow safely stopped.* No partial changes published. Logs preserved for debugging.`;

    try {
      await this.bot.api.sendMessage(this.chatId, card, { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('[TelegramNotificationAdapter] Failed to send failure notification', err);
    }
  }

  public async notifyApprovalRequired(details: ApprovalNotificationDetails): Promise<void> {
    const card = formatNewProjectDetectedCard(details.projectName, details.description);
    const keyboard = createNewProjectDetectedKeyboard(details.repoUrl, details.projectName);
    try {
      await this.bot.api.sendMessage(this.chatId, card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      logger.error('[TelegramNotificationAdapter] Failed to send approval request notification', err);
    }
  }
}
