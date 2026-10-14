import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { BonusService } from './bonus.service';

// Read-only: app-server accrues bonuses when an order is paid online; spending
// and manual corrections are not decided yet.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('bonuses')
export class BonusController {
  constructor(private readonly bonus: BonusService) {}

  @Get('summary')
  summary() {
    return this.bonus.summary();
  }

  @Get()
  accounts(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.bonus.accounts(Number(page), Number(limit), search, sortBy, sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC');
  }

  @Get('account/:id')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.bonus.history(id);
  }
}
