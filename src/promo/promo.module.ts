import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode, PromoRedemption } from './promo-code.entity';
import { PromoService } from './promo.service';
import { PromoController } from './promo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode, PromoRedemption])],
  providers: [PromoService],
  controllers: [PromoController],
})
export class PromoModule {}
