import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BonusLedger } from './bonus-ledger.entity';
import { BonusService } from './bonus.service';
import { BonusController } from './bonus.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BonusLedger])],
  providers: [BonusService],
  controllers: [BonusController],
})
export class BonusModule {}
