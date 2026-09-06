import { describe, it, expect } from 'vitest';
import { loadConfig, sanitizeForLogging } from '../src/config/index.js';

describe('Config Module', () => {
  it('should load default configuration when no env vars provided', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.PORTFOLIO_PATH).toBe('./portfolio');
  });

  it('should parse custom env overrides correctly', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
      PORTFOLIO_PATH: '/path/to/portfolio',
      GITHUB_TOKEN: 'ghp_secret_token123',
    });

    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('debug');
    expect(config.PORTFOLIO_PATH).toBe('/path/to/portfolio');
    expect(config.GITHUB_TOKEN).toBe('ghp_secret_token123');
  });

  it('should redact secrets when sanitizing objects for logging', () => {
    const sensitiveObj = {
      user: 'alice',
      GITHUB_TOKEN: 'ghp_1234567890secretkey',
      apiSecret: 'my_super_secret_key',
      password: 'password123',
      nested: {
        authToken: 'sk-abcdef123456',
      },
    };

    const sanitized = sanitizeForLogging(sensitiveObj);
    expect(sanitized.user).toBe('alice');
    expect(sanitized.GITHUB_TOKEN).toBe('[REDACTED]');
    expect(sanitized.apiSecret).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.nested.authToken).toBe('[REDACTED]');
  });
});
