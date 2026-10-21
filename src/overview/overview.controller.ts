import { Controller, Get, UseGuards } from '@nestjs/common';
import { OverviewService, Overview } from './overview.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  get(): Promise<Overview> {
    return this.overviewService.get();
  }
}
