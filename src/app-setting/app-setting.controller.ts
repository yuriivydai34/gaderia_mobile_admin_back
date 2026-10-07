import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AppSettingService } from './app-setting.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('app-settings')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Get()
  findAll() {
    return this.appSettingService.findAll();
  }

  @Patch()
  update(@Body() body: Record<string, unknown>) {
    return this.appSettingService.update(body);
  }
}
