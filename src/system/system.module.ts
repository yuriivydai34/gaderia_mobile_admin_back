import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { HealthModule } from '../health/health.module';
import { WooModule } from '../integration/woocommerce/woo.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), HealthModule, WooModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
