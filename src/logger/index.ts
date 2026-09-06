import { sanitizeForLogging } from '../config/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PRIORITIES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(targetLevel: LogLevel): boolean {
    return LOG_PRIORITIES[targetLevel] >= LOG_PRIORITIES[this.level];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta ? sanitizeForLogging(meta) : undefined;
    const metaString = sanitizedMeta && Object.keys(sanitizedMeta).length > 0 ? ` | Meta: ${JSON.stringify(sanitizedMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  public error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorMeta = error instanceof Error
        ? { errorName: error.name, errorMessage: error.message, stack: error.stack, ...meta }
        : { error, ...meta };
      console.error(this.formatMessage('error', message, errorMeta));
    }
  }
}

export const logger = new Logger();
