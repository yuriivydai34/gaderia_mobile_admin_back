import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from './app-setting.entity';
import { AppSettingService } from './app-setting.service';
import { AppSettingController } from './app-setting.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [AppSettingService],
  controllers: [AppSettingController],
})
export class AppSettingModule {}
