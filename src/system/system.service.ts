import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../account/account.entity';
import { HealthService, HealthCheck } from '../health/health.service';
import { SyncStatus, WooSyncService } from '../integration/woocommerce/woo-sync.service';

export type SystemStatus = {
  health: HealthCheck;
  shopSync: SyncStatus & {
    // The hourly run is switched off in .env (WOO_SYNC_CRON=off).
    cronEnabled: boolean;
  };
  // Who can open this panel. Shown so a stray ADMIN role is noticed.
  admins: Pick<Account, 'id' | 'email' | 'full_name' | 'createdAt'>[];
  // Which app version people opened in the last 30 days, newest first: how
  // many already have, say, the promo code field from 1.3.3.
  appVersions: { version: string; accounts: number }[];
};

export const APP_VERSIONS_SQL = `
  SELECT app_version AS version, COUNT(*)::int AS accounts
  FROM account
  WHERE app_version ~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'
    AND app_version_seen_at > now() - interval '30 days'
  GROUP BY app_version
  ORDER BY string_to_array(app_version, '.')::int[] DESC`;

@Injectable()
export class SystemService {
  constructor(
    private readonly health: HealthService,
    private readonly sync: WooSyncService,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  async status(): Promise<SystemStatus> {
    const [health, sync, admins, appVersions] = await Promise.all([
      this.health.check(),
      this.sync.status(),
      this.accounts.find({
        where: { role: 'ADMIN' },
        select: ['id', 'email', 'full_name', 'createdAt'],
        order: { id: 'ASC' },
      }),
      this.accounts.query(APP_VERSIONS_SQL) as Promise<SystemStatus['appVersions']>,
    ]);
    return {
      health,
      shopSync: { ...sync, cronEnabled: process.env.WOO_SYNC_CRON !== 'off' },
      admins,
      appVersions,
    };
  }
}
