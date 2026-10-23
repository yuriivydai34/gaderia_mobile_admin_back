import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoBanner } from './banner.entity';
import { AppSetting } from '../app-setting/app-setting.entity';
import { BannerService } from './banner.service';
import { BannerController } from './banner.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromoBanner, AppSetting])],
  providers: [BannerService],
  controllers: [BannerController],
  exports: [BannerService],
})
export class BannerModule {}
