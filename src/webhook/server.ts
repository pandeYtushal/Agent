import http from 'http';
import crypto from 'crypto';
import { loadConfig } from '../config/index.js';
import { logger } from '../logger/index.js';
import { idempotencyStore } from './idempotency.js';
import { repositoryEvaluator, RepositoryWebhookPayload } from './evaluator.js';

export interface WebhookServerOptions {
  port?: number;
  secret?: string;
  onViableProject?: (payload: { projectName: string; repoUrl: string; description: string }) => Promise<void>;
}

/**
 * Validates GitHub HMAC X-Hub-Signature-256 header.
 */
export function verifyGitHubSignature(secret: string, payloadBuffer: Buffer, signatureHeader?: string): boolean {
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(payloadBuffer).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export function createWebhookServer(options: WebhookServerOptions = {}): http.Server {
  const config = loadConfig();
  const secret = options.secret || config.GITHUB_WEBHOOK_SECRET;

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    const deliveryId = (req.headers['x-github-delivery'] as string) || `event-${Date.now()}`;
    const eventType = (req.headers['x-github-event'] as string) || 'unknown';
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    logger.info(`[WebhookServer] Received webhook event "${eventType}" (Delivery ID: ${deliveryId})`);

    if (eventType === 'ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'pong' }));
      return;
    }

    // 1. Idempotency Check
    if (idempotencyStore.isProcessed(deliveryId)) {
      logger.info(`[WebhookServer] Event delivery ID "${deliveryId}" already processed. Skipping (Idempotent 200 OK).`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'already_processed', deliveryId }));
      return;
    }

    // Collect request body buffer
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const rawBuffer = Buffer.concat(chunks);

      // 2. Security Signature Verification
      if (secret && secret.trim() !== '') {
        if (!verifyGitHubSignature(secret, rawBuffer, signature)) {
          logger.warn(`[WebhookServer] Invalid signature for event deliveryId: "${deliveryId}"`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid HMAC signature' }));
          return;
        }
      }

      let payload: RepositoryWebhookPayload;
      try {
        payload = JSON.parse(rawBuffer.toString('utf-8'));
      } catch (err: any) {
        logger.error('[WebhookServer] Malformed JSON payload', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        return;
      }

      try {
        const repoUrl = payload.repository?.html_url || '';
        const repoName = payload.repository?.name || '';
        const eligible =
          eventType === 'repository' &&
          (payload.action === 'created' || payload.action === 'publicized' || payload.action === 'unarchived');

        // Check if user previously marked this repo as ignored
        if (idempotencyStore.isRepoIgnored(repoUrl) || idempotencyStore.isRepoIgnored(repoName)) {
          logger.info(`[WebhookServer] Skipping ignored repository: "${repoName}"`);
          idempotencyStore.recordEvent({
            deliveryId,
            eventType,
            repoUrl,
            processedAt: new Date().toISOString(),
            status: 'ignored',
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ignored', repoName }));
          return;
        }

        if (!eligible) {
          logger.info(`[WebhookServer] Skipping ineligible event "${eventType}" action "${payload.action || ''}"`);
          idempotencyStore.recordEvent({
            deliveryId,
            eventType,
            repoUrl,
            processedAt: new Date().toISOString(),
            status: 'ignored',
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ignored', reason: 'ineligible_event' }));
          return;
        }

        // 3. Evaluate Project Viability
        const evaluation = repositoryEvaluator.evaluateRepository(payload);

        if (evaluation.isViable) {
          if (options.onViableProject) {
            await options.onViableProject({
              projectName: evaluation.projectName,
              repoUrl: evaluation.repoUrl,
              description: evaluation.description,
            });
          }

          idempotencyStore.recordEvent({
            deliveryId,
            eventType,
            repoUrl: evaluation.repoUrl,
            processedAt: new Date().toISOString(),
            status: 'notified',
          });
        } else {
          idempotencyStore.recordEvent({
            deliveryId,
            eventType,
            repoUrl: evaluation.repoUrl,
            processedAt: new Date().toISOString(),
            status: 'ignored',
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', evaluation }));
      } catch (err: any) {
        logger.error('[WebhookServer] Error handling webhook event', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook handler failed' }));
      }
    });
  });

  return server;
}

export async function startWebhookServer(options: WebhookServerOptions = {}): Promise<http.Server> {
  const config = loadConfig();
  const port = options.port || config.WEBHOOK_PORT;
  const server = createWebhookServer(options);

  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info(`[WebhookServer] GitHub Webhook listener running on port ${port} ✅`);
      resolve(server);
    });
  });
}
