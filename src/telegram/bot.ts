import { Bot } from 'grammy';
import dotenv from 'dotenv';
import { loadConfig } from '../config/index.js';
import { logger } from '../logger/index.js';
import { PublishingAgentEngine } from '../agent/index.js';
import { createAuthMiddleware } from './handlers/auth.js';
import { registerBotHandlers, setupBotCommands } from './handlers/commands.js';

// Ensure environment variables are loaded
dotenv.config();

/**
 * Creates and initializes the Grammy Telegram Bot instance.
 */
export async function createTelegramBot(tokenOverride?: string, allowedUserOverride?: string): Promise<Bot> {
  const config = loadConfig();
  const token = tokenOverride !== undefined ? tokenOverride : (config.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  const allowedUserId = allowedUserOverride !== undefined ? allowedUserOverride : (config.TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_ALLOWED_USER_ID);

  if (!token || token.trim() === '' || token === '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ') {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is missing or invalid in environment variables.\n' +
      'Please configure TELEGRAM_BOT_TOKEN in your .env file.'
    );
  }

  const bot = new Bot(token);
  const engine = new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });

  // Bot error handler - prevents unhandled update errors from crashing the bot
  bot.catch((err) => {
    logger.error('[TelegramBot] Error handling update:', err);
  });

  // Safe message logging middleware (logs only sender ID and message text, no tokens or environment variables)
  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.message?.text) {
      logger.info(`Received Telegram message from Sender ID ${ctx.from.id}: "${ctx.message.text}"`);
    }
    return next();
  });

  // Authorization middleware - rejects unauthorized user IDs
  bot.use(createAuthMiddleware(allowedUserId));

  // Register command and text message handlers
  registerBotHandlers(bot, undefined, engine);

  return bot;
}

/**
 * Starts the Telegram bot with long polling.
 */
export async function startBot(): Promise<Bot> {
  try {
    const bot = await createTelegramBot();

    bot.start({
      onStart: async (botInfo) => {
        logger.info(`[TelegramBot] Successfully connected as @${botInfo.username}`);
        await setupBotCommands(bot);
        console.log('Telegram bot is running...');
      },
    });

    return bot;
  } catch (err: any) {
    logger.error('Failed to start Telegram bot:', err);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Auto-run if executed directly via npm run telegram / tsx src/telegram/bot.ts
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('src/telegram/bot.ts') ||
               process.argv[1]?.replace(/\\/g, '/').endsWith('dist/telegram/bot.js');

if (isMain) {
  startBot();
}
