import { describe, it, expect, vi } from 'vitest';
import { isUserAuthorized } from '../src/telegram/auth.js';
import { isGitHubUrl, registerBotHandlers } from '../src/telegram/handlers/commands.js';
import { formatProgressMessage, formatHelpMenu } from '../src/telegram/formatter.js';
import { createProjectActionKeyboard } from '../src/telegram/keyboards.js';
import { createTelegramBot } from '../src/telegram/bot.js';

describe('Telegram Interface Layer', () => {
  it('enforces Telegram User ID authorization', () => {
    const allowed = '123456789';
    expect(isUserAuthorized(123456789, allowed)).toBe(true);
    expect(isUserAuthorized('123456789', allowed)).toBe(true);
    expect(isUserAuthorized(999999999, allowed)).toBe(false);
    expect(isUserAuthorized(undefined, allowed)).toBe(false);
    expect(isUserAuthorized(123456789, '')).toBe(false);
  });

  it('correctly identifies GitHub URLs', () => {
    expect(isGitHubUrl('https://github.com/octocat/Hello-World')).toBe(true);
    expect(isGitHubUrl('http://github.com/user/repo')).toBe(true);
    expect(isGitHubUrl('hello world')).toBe(false);
    expect(isGitHubUrl('https://other-site.com')).toBe(false);
  });

  it('fails to initialize bot if TELEGRAM_BOT_TOKEN is missing or dummy', async () => {
    await expect(createTelegramBot('', '12345')).rejects.toThrow('TELEGRAM_BOT_TOKEN is missing or invalid');
    await expect(createTelegramBot('123456789:ABCdefGHIjklMNOpqrSTUvwxYZ', '12345')).rejects.toThrow('TELEGRAM_BOT_TOKEN is missing or invalid');
  });

  it('registers handlers and responds correctly to test inputs', () => {
    const commands: Record<string, (ctx: any) => Promise<void>> = {};
    let textHandler: ((ctx: any) => Promise<void>) | undefined;

    const mockBot = {
      command: (name: string, fn: (ctx: any) => Promise<void>) => {
        commands[name] = fn;
      },
      on: (event: string, fn: (ctx: any) => Promise<void>) => {
        if (event === 'message:text') textHandler = fn;
      },
    };

    registerBotHandlers(mockBot);

    expect(commands['start']).toBeDefined();
    expect(commands['help']).toBeDefined();
    expect(commands['add']).toBeDefined();
    expect(commands['status']).toBeDefined();
    expect(textHandler).toBeDefined();
  });

  it('handles mock responses for hello, /add, and repo URL', async () => {
    const commands: Record<string, (ctx: any) => Promise<void>> = {};
    let textHandler: (ctx: any) => Promise<void> = async () => {};

    const mockBot = {
      command: (name: string, fn: (ctx: any) => Promise<void>) => {
        commands[name] = fn;
      },
      on: (event: string, fn: (ctx: any) => Promise<void>) => {
        if (event === 'message:text') textHandler = fn;
      },
    };

    registerBotHandlers(mockBot);

    // Test hello -> "Portfolio Agent is online."
    const replyHello = vi.fn();
    await textHandler({ message: { text: 'hello' }, reply: replyHello });
    expect(replyHello).toHaveBeenCalledWith('Portfolio Agent is online.', expect.anything());

    // Test /add without args -> "Send me the GitHub repository URL..."
    const replyAdd = vi.fn();
    await commands['add']({ message: { text: '/add' }, reply: replyAdd });
    expect(replyAdd).toHaveBeenCalledWith(expect.stringContaining('Send me the GitHub repository URL'), expect.anything());

    // Test /start -> "Portfolio Agent is online."
    const replyStart = vi.fn();
    await commands['start']({ reply: replyStart });
    expect(replyStart).toHaveBeenCalledWith('Portfolio Agent is online.', expect.anything());

    // Test /status -> "Portfolio Agent is online and operational."
    const replyStatus = vi.fn();
    await commands['status']({ reply: replyStatus });
    expect(replyStatus).toHaveBeenCalledWith('Portfolio Agent is online and operational.');
  });

  it('formats progress messages cleanly', () => {
    const msg = formatProgressMessage(4);
    expect(msg).toContain('Analyzing Repository');
    expect(msg).toContain('✓ Repository found');
    expect(msg).toContain('✓ Live demo detected');
  });

  it('builds inline action keyboard with Publish, Edit, and Cancel buttons', () => {
    const keyboard = createProjectActionKeyboard('https://github.com/octocat/Hello-World');
    const json = JSON.stringify(keyboard.inline_keyboard);
    expect(json).toContain('Publish');
    expect(json).toContain('Edit');
    expect(json).toContain('Cancel');
  });

  it('generates help menu text', () => {
    const help = formatHelpMenu();
    expect(help).toContain('/add');
    expect(help).toContain('/repos');
  });

  it('handles /repos command and formats repository count message', async () => {
    const mockGh = {
      getUserRepositoriesCount: vi.fn().mockResolvedValue({
        username: 'testuser',
        totalCount: 42,
        publicRepos: 30,
        privateRepos: 12,
      }),
    };

    const commands: Record<string, (ctx: any) => Promise<void>> = {};
    let textHandler: (ctx: any) => Promise<void> = async () => {};

    const mockBot = {
      command: (name: string, fn: (ctx: any) => Promise<void>) => {
        commands[name] = fn;
      },
      on: (event: string, fn: (ctx: any) => Promise<void>) => {
        if (event === 'message:text') textHandler = fn;
      },
    };

    registerBotHandlers(mockBot, mockGh as any);

    expect(commands['repos']).toBeDefined();

    const replyRepos = vi.fn();
    await commands['repos']({ message: { text: '/repos' }, reply: replyRepos });

    expect(replyRepos).toHaveBeenCalled();
    const [cardText] = replyRepos.mock.calls[0];
    expect(cardText).toContain('testuser');
    expect(cardText).toContain('42');
    expect(cardText).toContain('30');
    expect(cardText).toContain('12');

    // Test natural language query "how many repos do I have?"
    const replyNL = vi.fn();
    await textHandler({ message: { text: 'how many repos do I have?' }, reply: replyNL });
    expect(replyNL).toHaveBeenCalled();
    const [nlCardText] = replyNL.mock.calls[0];
    expect(nlCardText).toContain('testuser');
  });
});
