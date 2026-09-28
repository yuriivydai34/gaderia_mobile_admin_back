import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { PromoService } from './promo.service';

// Managing codes. Checking and applying them at checkout is app-server's job.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('promo-codes')
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @Get()
  findAll() {
    return this.promoService.findAll();
  }

  // The code, its statistics and every use of it.
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.promoService.findOne(id);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.promoService.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.promoService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.promoService.remove(id);
  }
}
