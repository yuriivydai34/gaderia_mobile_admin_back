import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('shift')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Get()
  findOne() {
    return this.shiftService.findOne();
  }

  @Post('refresh-token')
  refreshToken(@Body('pin_code') pinCode: string) {
    return this.shiftService.refreshToken(pinCode);
  }
}
