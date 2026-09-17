import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { WooSyncService } from './woo-sync.service';
import { WooClient } from './woo.client';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('integrations/woocommerce')
export class WooController {
  constructor(
    private readonly sync: WooSyncService,
    private readonly client: WooClient,
  ) {}

  @Get('status')
  async status() {
    return {
      configured: this.client.isConfigured,
      running: this.sync.isRunning,
      lastCursor: await this.sync.getCursor(),
      imported: await this.sync.importedCount(),
    };
  }

  @Post('sync')
  @HttpCode(200)
  run(@Query('full') full?: string) {
    return this.sync.sync({ full: full === 'true' });
  }
}
