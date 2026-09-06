import { Context } from 'grammy';
import { GitHubService } from '../../github/index.js';
import { PublishingAgentEngine } from '../../agent/index.js';
import { formatHelpMenu, formatRepoCountCard, formatPublishSuccessCard } from '../formatter.js';
import { createRepoCountKeyboard, createMainMenuKeyboard } from '../keyboards.js';
import { parseNaturalLanguageIntent, handleProjectAnalysisFlow, getUserDraft, clearUserDraft } from './workflow.js';
import { logger } from '../../logger/index.js';
import { idempotencyStore } from '../../webhook/idempotency.js';

/**
 * Helper to check if a text string contains a GitHub repository URL
 */
export function isGitHubUrl(text: string): boolean {
  return /https?:\/\/(www\.)?github\.com\/[^\s]+/i.test(text);
}

/**
 * Sets up Telegram bot commands menu autocomplete
 */
export async function setupBotCommands(bot: any) {
  try {
    if (bot.api?.setMyCommands) {
      await bot.api.setMyCommands([
        { command: 'start', description: 'Start bot & show main menu' },
        { command: 'repos', description: 'View GitHub repository count' },
        { command: 'add', description: 'Add a GitHub project to portfolio' },
        { command: 'projects', description: 'List cataloged portfolio projects' },
        { command: 'drafts', description: 'View active project drafts' },
        { command: 'status', description: 'Check system status' },
        { command: 'help', description: 'Show help menu & commands' },
      ]);
    }
  } catch (err: any) {
    logger.warn('[TelegramBot] Could not register bot commands with Telegram API', err);
  }
}

/**
 * Executes the repository count workflow and replies to user
 */
export async function handleReposCommand(ctx: Context, githubService?: GitHubService, targetUsername?: string) {
  const gh = githubService || new GitHubService();
  try {
    const text = ctx.message?.text || '';
    const extractedUsername = targetUsername || text.split(' ').slice(1).join(' ').trim();
    const countInfo = await gh.getUserRepositoriesCount(extractedUsername || undefined);
    const card = formatRepoCountCard(countInfo);
    const keyboard = createRepoCountKeyboard();

    try {
      await ctx.reply(card, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.reply(card.replace(/[*_`]/g, ''), {
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    }
  } catch (err: any) {
    logger.error('[TelegramBot] Error fetching repository count:', err);
    const cleanMsg = (err.message || 'Unknown error').replace(/[_*`[\]()]/g, ' ');
    const errorMsg =
      `⚠️ *Failed to fetch repository count*\n\n` +
      `${cleanMsg}\n\n` +
      `💡 *How to fix*:\n` +
      `1. Make sure \`GITHUB_TOKEN\` in your \`.env\` file is valid and has \`repo\` scope.\n` +
      `2. Or query a public username: \`/repos <username>\` (e.g., \`/repos octocat\`)`;

    try {
      await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(`⚠️ Failed to fetch repository count: ${err.message}\n\nPlease check your GITHUB_TOKEN in .env or try /repos <username>`);
    }
  }
}

/**
 * Registers Telegram bot command and message handlers
 */
export function registerBotHandlers(
  bot: any,
  githubService?: GitHubService,
  publishingEngine?: PublishingAgentEngine
) {
  const gh = githubService || new GitHubService();
  const engine = publishingEngine || new PublishingAgentEngine();

  // Command: /start
  bot.command('start', async (ctx: Context) => {
    await ctx.reply('Portfolio Agent is online.', {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  // Command: /help
  bot.command('help', async (ctx: Context) => {
    await ctx.reply(formatHelpMenu(), { parse_mode: 'Markdown' });
  });

  // Commands: /repos, /countrepos, /myrepos, /projects
  const reposHandler = async (ctx: Context) => {
    await handleReposCommand(ctx, gh);
  };
  bot.command('repos', reposHandler);
  bot.command('countrepos', reposHandler);
  bot.command('myrepos', reposHandler);

  // Helper for /projects command and cmd:projects callback
  const handleProjectsCommand = async (ctx: Context) => {
    try {
      const { schema } = await engine.inspectPortfolio();
      if (!schema.projects.length) {
        await ctx.reply('No projects are cataloged in the portfolio yet.');
        return;
      }
      const lines = schema.projects.map((p, i) => `${i + 1}. *${p.title}*${p.link ? ` — ${p.link}` : ''}`);
      await ctx.reply(`📌 *Portfolio Projects*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
    } catch (err: any) {
      logger.error('[TelegramBot] Failed to list portfolio projects', err);
      await ctx.reply('Failed to list portfolio projects. Check PORTFOLIO_PATH and try again.');
    }
  };

  // Command: /projects — list cataloged portfolio entries
  bot.command('projects', handleProjectsCommand);

  // Command: /drafts
  bot.command('drafts', async (ctx: Context) => {
    const userId = ctx.from?.id;
    const draft = userId ? getUserDraft(userId) : undefined;
    if (!draft) {
      await ctx.reply('No active drafts. Send `/add <github-url>` to start.', { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply(`📝 *Active draft*\n\n\`${draft.githubUrl}\`\n_Saved at ${draft.timestamp}_`, { parse_mode: 'Markdown' });
  });

  // Command: /add
  bot.command('add', async (ctx: Context) => {
    const text = ctx.message?.text || '';
    const args = text.split(' ').slice(1).join(' ').trim();
    if (args && isGitHubUrl(args)) {
      await handleProjectAnalysisFlow(ctx, engine, args);
    } else {
      await ctx.reply('Send me the GitHub repository URL to add (e.g. `/add https://github.com/user/repo`).', {
        parse_mode: 'Markdown',
      });
    }
  });

  // Command: /status
  bot.command('status', async (ctx: Context) => {
    await ctx.reply('Portfolio Agent is online and operational.');
  });

  // Callback query handler for inline button actions
  if (bot.on) {
    bot.on('callback_query:data', async (ctx: Context) => {
      const data = ctx.callbackQuery?.data || '';

      if (data.startsWith('pub:')) {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        const githubUrl = decodeURIComponent(data.replace('pub:', ''));
        const pubMsg = await ctx.reply('🚀 *Publishing project to portfolio repository...*', { parse_mode: 'Markdown' });

        try {
          const result = await engine.publish(githubUrl);
          await ctx.api.deleteMessage(ctx.chat!.id, pubMsg.message_id).catch(() => {});

          const successCard = formatPublishSuccessCard(
            result.run.projectAnalysis?.name || 'Project',
            result.prUrl || githubUrl,
            result.branchName,
            result.commitHash
          );

          await ctx.reply(successCard, { parse_mode: 'Markdown' });
        } catch (err: any) {
          logger.error('[TelegramBot] Failed to publish project:', err);
          await ctx.api.deleteMessage(ctx.chat!.id, pubMsg.message_id).catch(() => {});
          await ctx.reply(`❌ *Publish Failed*: ${err.message}`, { parse_mode: 'Markdown' });
        }
      } else if (data.startsWith('cancel:')) {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        const userId = ctx.from?.id;
        if (userId) clearUserDraft(userId);
        await ctx.reply('❌ Project publication cancelled.');
      } else if (data.startsWith('review:')) {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        const githubUrl = decodeURIComponent(data.replace('review:', ''));
        await handleProjectAnalysisFlow(ctx, engine, githubUrl);
      } else if (data.startsWith('edit:')) {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        const githubUrl = decodeURIComponent(data.replace('edit:', ''));
        await ctx.reply(`✏️ Send an updated GitHub URL to re-analyze this project.\n\nCurrent: \`${githubUrl}\``, {
          parse_mode: 'Markdown',
        });
      } else if (data.startsWith('ignore:')) {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        const repoId = decodeURIComponent(data.replace('ignore:', ''));
        idempotencyStore.ignoreRepo(repoId);
        await ctx.reply('🙈 Project ignored for portfolio publishing.');
      } else if (data === 'cmd:repos') {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        await handleReposCommand(ctx, gh);
      } else if (data === 'cmd:projects') {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        await handleProjectsCommand(ctx);
      } else if (data === 'cmd:help') {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        await ctx.reply(formatHelpMenu(), { parse_mode: 'Markdown' });
      } else if (data === 'cmd:add') {
        if (ctx.answerCallbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        await ctx.reply('Send me the GitHub repository URL to add (e.g. `/add https://github.com/user/repo`).', { parse_mode: 'Markdown' });
      }
    });
  }

  // Incoming text message handler
  bot.on('message:text', async (ctx: Context) => {
    const text = ctx.message?.text?.trim() || '';

    // Skip commands as they are handled by bot.command() above
    if (text.startsWith('/')) return;

    if (text.toLowerCase() === 'hello') {
      await ctx.reply('Portfolio Agent is online.', { reply_markup: createMainMenuKeyboard() });
      return;
    }

    if (isGitHubUrl(text)) {
      const urlMatch = text.match(/https?:\/\/(www\.)?github\.com\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : text;
      await handleProjectAnalysisFlow(ctx, engine, url);
      return;
    }

    const intentResult = parseNaturalLanguageIntent(text);
    if (intentResult.intent === 'repos') {
      await handleReposCommand(ctx, gh);
      return;
    }
    if (intentResult.intent === 'add' && intentResult.extractedUrl) {
      await handleProjectAnalysisFlow(ctx, engine, intentResult.extractedUrl);
      return;
    }
    if (intentResult.intent === 'help') {
      await ctx.reply(formatHelpMenu(), { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply('Send `/repos` to view repository count, or `/add` with a valid GitHub repository URL.', {
      parse_mode: 'Markdown',
    });
  });
}
