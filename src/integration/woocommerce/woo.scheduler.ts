import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WooSyncService } from './woo-sync.service';
import { WooClient } from './woo.client';

@Injectable()
export class WooScheduler {
  private readonly logger = new Logger(WooScheduler.name);

  constructor(
    private readonly sync: WooSyncService,
    private readonly client: WooClient,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    if (!this.client.isConfigured) return;
    if (process.env.WOO_SYNC_CRON === 'off') return;
    if (this.sync.isRunning) return;

    try {
      await this.sync.sync();
    } catch (error) {
      // A failed run must not take the process down: the cursor is untouched,
      // so the next tick simply retries the same window.
      this.logger.error(`scheduled sync failed: ${String(error)}`);
    }
  }
}
