import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import http from 'http';
import { idempotencyStore } from '../src/webhook/idempotency.js';
import { repositoryEvaluator } from '../src/webhook/evaluator.js';
import { verifyGitHubSignature, createWebhookServer } from '../src/webhook/server.js';

describe('GitHub Webhook & Proactive Detection Layer (Phase 7)', () => {
  beforeEach(() => {
    idempotencyStore.clear();
  });

  describe('IdempotencyStore', () => {
    it('tracks processed delivery IDs', () => {
      const deliveryId = 'del-12345';
      expect(idempotencyStore.isProcessed(deliveryId)).toBe(false);

      idempotencyStore.recordEvent({
        deliveryId,
        eventType: 'repository',
        repoUrl: 'https://github.com/test/repo',
        processedAt: new Date().toISOString(),
        status: 'notified',
      });

      expect(idempotencyStore.isProcessed(deliveryId)).toBe(true);
    });

    it('tracks ignored repositories', () => {
      const repoUrl = 'https://github.com/test/ignored-repo';
      expect(idempotencyStore.isRepoIgnored(repoUrl)).toBe(false);

      idempotencyStore.ignoreRepo(repoUrl);
      expect(idempotencyStore.isRepoIgnored(repoUrl)).toBe(true);
    });
  });

  describe('RepositoryEvaluator', () => {
    it('evaluates repository creation events as viable projects', () => {
      const payload = {
        action: 'created',
        repository: {
          name: 'awesome-agent',
          full_name: 'pandeYtushal/awesome-agent',
          html_url: 'https://github.com/pandeYtushal/awesome-agent',
          description: 'An AI Publishing Agent for portfolios',
          fork: false,
          stargazers_count: 5,
        },
      };

      const result = repositoryEvaluator.evaluateRepository(payload);
      expect(result.isViable).toBe(true);
      expect(result.projectName).toBe('awesome-agent');
      expect(result.repoUrl).toBe('https://github.com/pandeYtushal/awesome-agent');
    });

    it('filters out empty forks or non-project events', () => {
      const payload = {
        action: 'created',
        repository: {
          name: 'forked-repo',
          full_name: 'pandeYtushal/forked-repo',
          html_url: 'https://github.com/pandeYtushal/forked-repo',
          description: '',
          fork: true,
          stargazers_count: 0,
        },
      };


      const result = repositoryEvaluator.evaluateRepository(payload);
      expect(result.isViable).toBe(false);
      expect(result.reason).toContain('fork');
    });
  });

  describe('HMAC Signature Verification', () => {
    it('verifies valid HMAC sha256 signatures', () => {
      const secret = 'super-secret-key';
      const body = Buffer.from(JSON.stringify({ action: 'created' }));
      const hmac = crypto.createHmac('sha256', secret);
      const validSignature = `sha256=${hmac.update(body).digest('hex')}`;

      expect(verifyGitHubSignature(secret, body, validSignature)).toBe(true);
      expect(verifyGitHubSignature(secret, body, 'sha256=invalidhash')).toBe(false);
      expect(verifyGitHubSignature(secret, body, undefined)).toBe(false);
    });
  });

  describe('Webhook Server HTTP Endpoint', () => {
    it('handles incoming webhook requests and verifies signature', async () => {
      const secret = 'test-secret';
      let notifiedProject = '';

      const server = createWebhookServer({
        secret,
        onViableProject: async ({ projectName }) => {
          notifiedProject = projectName;
        },
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address() as { port: number };

      const body = JSON.stringify({
        action: 'created',
        repository: {
          name: 'hunter-bot',
          html_url: 'https://github.com/test/hunter-bot',
          description: 'Automated hunter project',
          fork: false,
        },
      });

      const bodyBuffer = Buffer.from(body);
      const hmac = crypto.createHmac('sha256', secret);
      const signature = `sha256=${hmac.update(bodyBuffer).digest('hex')}`;

      const res = await new Promise<{ statusCode: number; data: string }>((resolve) => {
        const req = http.request(
          `http://localhost:${address.port}/webhook`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-github-delivery': 'delivery-abc-123',
              'x-github-event': 'repository',
              'x-hub-signature-256': signature,
            },
          },
          (response) => {
            let data = '';
            response.on('data', (chunk) => (data += chunk));
            response.on('end', () => resolve({ statusCode: response.statusCode || 500, data }));
          }
        );
        req.write(bodyBuffer);
        req.end();
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.data).status).toBe('success');
      expect(notifiedProject).toBe('hunter-bot');

      server.close();
    });
  });
});
