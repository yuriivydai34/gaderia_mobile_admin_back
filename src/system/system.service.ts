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
};

@Injectable()
export class SystemService {
  constructor(
    private readonly health: HealthService,
    private readonly sync: WooSyncService,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}

  async status(): Promise<SystemStatus> {
    const [health, sync, admins] = await Promise.all([
      this.health.check(),
      this.sync.status(),
      this.accounts.find({
        where: { role: 'ADMIN' },
        select: ['id', 'email', 'full_name', 'createdAt'],
        order: { id: 'ASC' },
      }),
    ]);
    return {
      health,
      shopSync: { ...sync, cronEnabled: process.env.WOO_SYNC_CRON !== 'off' },
      admins,
    };
  }
}
