import { logger } from '../logger/index.js';

export interface WebhookEventRecord {
  deliveryId: string;
  eventType: string;
  repoUrl: string;
  processedAt: string;
  status: 'ignored' | 'notified' | 'already_processed';
}

export class IdempotencyStore {
  private processedEvents: Map<string, WebhookEventRecord> = new Map();
  private ignoredRepos: Set<string> = new Set();

  /**
   * Checks whether a webhook delivery event has already been processed.
   */
  public isProcessed(deliveryId: string): boolean {
    return this.processedEvents.has(deliveryId);
  }

  /**
   * Records a webhook delivery event in the idempotency log.
   */
  public recordEvent(record: WebhookEventRecord): void {
    this.processedEvents.set(record.deliveryId, record);
    logger.info(`[IdempotencyStore] Recorded event deliveryId: "${record.deliveryId}" (status: ${record.status})`);
  }

  /**
   * Marks a repository URL or name as user-ignored so future events for it are skipped.
   */
  public markRepoIgnored(repoIdentifier: string): void {
    const clean = repoIdentifier.toLowerCase().trim();
    this.ignoredRepos.add(clean);
    logger.info(`[IdempotencyStore] Repository "${clean}" added to ignored repos list.`);
  }

  /**
   * Checks if a repository URL or name has been marked as user-ignored.
   */
  public isRepoIgnored(repoIdentifier: string): boolean {
    const clean = repoIdentifier.toLowerCase().trim();
    return this.ignoredRepos.has(clean);
  }

  /**
   * Alias for markRepoIgnored.
   */
  public ignoreRepo(repoIdentifier: string): void {
    this.markRepoIgnored(repoIdentifier);
  }

  /**
   * Resets all tracked events and ignored repositories.
   */
  public clear(): void {
    this.processedEvents.clear();
    this.ignoredRepos.clear();
  }

  /**
   * Returns all recorded event logs.
   */
  public getEventLogs(): WebhookEventRecord[] {
    return Array.from(this.processedEvents.values());
  }
}




export const idempotencyStore = new IdempotencyStore();
