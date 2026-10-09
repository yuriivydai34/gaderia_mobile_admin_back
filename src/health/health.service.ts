import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * A sync that stopped running is a silent failure - nothing errors, the data
 * just quietly goes stale. Two hours is four missed hourly runs.
 */
const SYNC_STALE_AFTER_MINUTES = 120;

const DB_TIMEOUT_MS = 5000;

export type HealthCheck = {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  checks: {
    database: { ok: boolean; latencyMs: number | null; error?: string };
    shopSync: {
      ok: boolean;
      lastRunAt: string | null;
      ageMinutes: number | null;
    };
  };
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async check(): Promise<HealthCheck> {
    const database = await this.checkDatabase();
    // Only asked when the database answered: otherwise the query would just
    // fail again and slow the response down.
    const shopSync = database.ok
      ? await this.checkShopSync()
      : { ok: false, lastRunAt: null, ageMinutes: null };

    return {
      // The database being unreachable makes the API useless, so that is the
      // only thing that reports as down. A stale sync is worth alerting on but
      // the API still works.
      status: !database.ok ? 'down' : shopSync.ok ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, shopSync },
    };
  }

  private async checkDatabase(): Promise<HealthCheck['checks']['database']> {
    const started = Date.now();
    try {
      // A real round trip, not just "is the pool initialised": a pool can hold
      // connections to a database that stopped answering.
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`no answer in ${DB_TIMEOUT_MS}ms`)),
            DB_TIMEOUT_MS,
          ),
        ),
      ]);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`database check failed: ${message}`);
      // Kept short and generic: this endpoint is unauthenticated, so it must
      // not hand out connection strings or host names.
      return { ok: false, latencyMs: null, error: message.slice(0, 120) };
    }
  }

  private async checkShopSync(): Promise<HealthCheck['checks']['shopSync']> {
    try {
      const rows: { updatedAt: Date }[] = await this.dataSource.query(
        // Only rows a successful run writes. woocommerce.last_error is written
        // by a failed one, and counting it would call a failing sync fresh.
        `SELECT "updatedAt" FROM integration_state
         WHERE key IN ('woocommerce.last_run_at', 'woocommerce.orders.modified_after')
         ORDER BY "updatedAt" DESC LIMIT 1`,
      );
      const last = rows[0]?.updatedAt;
      if (!last) {
        // Nothing has ever synced. Not a failure in itself - the import may
        // simply not be set up on this instance.
        return { ok: true, lastRunAt: null, ageMinutes: null };
      }

      const ageMinutes = Math.round(
        (Date.now() - new Date(last).getTime()) / 60000,
      );
      return {
        ok: ageMinutes <= SYNC_STALE_AFTER_MINUTES,
        lastRunAt: new Date(last).toISOString(),
        ageMinutes,
      };
    } catch {
      return { ok: false, lastRunAt: null, ageMinutes: null };
    }
  }
}
