import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../customer/customer.entity';
import { IntegrationState } from './integration-state.entity';
import { WooClient } from './woo.client';
import { WooSyncService } from './woo-sync.service';
import { WooController } from './woo.controller';
import { WooScheduler } from './woo.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, IntegrationState])],
  controllers: [WooController],
  providers: [WooClient, WooSyncService, WooScheduler],
  exports: [WooSyncService],
})
export class WooModule {}
