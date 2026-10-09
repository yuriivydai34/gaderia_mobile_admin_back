import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { SystemService } from './system.service';

// What the Settings page shows about the system itself. Unlike /health, this
// names people (the admins), so it is behind the admin guard.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('status')
  status() {
    return this.system.status();
  }
}
