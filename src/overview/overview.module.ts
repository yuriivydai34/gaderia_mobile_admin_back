import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payment/payment.entity';
import { Account } from '../account/account.entity';
import { OverviewService } from './overview.service';
import { OverviewController } from './overview.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Account])],
  providers: [OverviewService],
  controllers: [OverviewController],
})
export class OverviewModule {}
