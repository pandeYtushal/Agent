import { Bot } from 'grammy';
import { loadConfig } from '../config/index.js';
import { logger } from '../logger/index.js';
import { PublishingAgentEngine } from '../agent/index.js';
import { createAuthMiddleware } from './auth.js';
import { registerBotHandlers } from './handlers/index.js';
import { formatNewProjectDetectedCard } from './formatter.js';
import { createNewProjectDetectedKeyboard } from './keyboards.js';


export * from './auth.js';
export * from './bot.js';
export * from './formatter.js';
export * from './keyboards.js';
export * from './handlers/index.js';


export interface TelegramBotOptions {
  botToken?: string;
  allowedUserId?: string;
  engine?: PublishingAgentEngine;
}

/**
 * Initializes and starts the Telegram Bot polling listener.
 */
export async function startTelegramBot(options: TelegramBotOptions = {}): Promise<Bot> {
  const config = loadConfig();
  const token = options.botToken || config.TELEGRAM_BOT_TOKEN;
  const allowedUserId = options.allowedUserId || config.TELEGRAM_ALLOWED_USER_ID;

  if (!token || token === '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ' || token.trim() === '') {
    throw new Error(
      'Telegram Bot Error: TELEGRAM_BOT_TOKEN is missing or unconfigured in environment (.env file).\n' +
      'Please obtain a bot token from @BotFather on Telegram and configure TELEGRAM_BOT_TOKEN.'
    );
  }

  logger.info('[TelegramBot] Initializing Grammy bot instance...');
  const bot = new Bot(token);
  const engine = options.engine || new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });

  // Register authorization middleware
  bot.use(createAuthMiddleware(allowedUserId));

  // Register bot command & callback handlers
  registerBotHandlers(bot, undefined, engine);

  logger.info(`[TelegramBot] Bot starting polling mode (Restricted User ID: ${allowedUserId || 'None'})`);
  
  // Start bot asynchronously
  bot.start({
    onStart: (botInfo) => {
      logger.info(`[TelegramBot] Bot successfully connected as @${botInfo.username} ✅`);
    },
  });

  return bot;
}

/**
 * Sends a proactive project notification card to an authorized chat ID.
 */
export async function sendProactiveProjectNotification(
  bot: Bot,
  chatId: string,
  projectName: string,
  description: string,
  githubUrl: string,
  repoFullName: string
): Promise<void> {
  const card = formatNewProjectDetectedCard(projectName, description);
  const keyboard = createNewProjectDetectedKeyboard(githubUrl, repoFullName);
  await bot.api.sendMessage(chatId, card, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

