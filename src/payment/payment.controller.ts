import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { Payment } from './payment.entity';
import { kyivToday } from './kyiv-day';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('sortBy') sortBy = 'updatedAt',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    @Query('status') status?: string,
  ) {
    return this.paymentService.findAll(Number(page), Number(limit), sortBy, sortOrder, status);
  }

  // The file itself, behind the same admin guard as everything here.
  @Get('report')
  async generateReport(@Query('date') date?: string): Promise<StreamableFile> {
    const day = date || kyivToday();
    const file = await this.paymentService.generateReport(day);
    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="payments_${day}.xlsx"`,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Payment> {
    return this.paymentService.findOne(id);
  }

  @Post()
  create(@Body() body: Partial<Payment>): Promise<Payment> {
    return this.paymentService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ): Promise<Payment> {
    return this.paymentService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.paymentService.remove(id);
  }
}
