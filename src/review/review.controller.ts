import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ReviewService } from './review.service';

// Read-only: reviews are written by clients through app-server, and the panel
// only looks at them.
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('rating') rating?: string,
  ) {
    const stars = Number(rating);
    return this.reviewService.findAll(
      Number(page),
      Number(limit),
      stars >= 1 && stars <= 5 ? stars : undefined,
    );
  }

  @Get('summary')
  summary() {
    return this.reviewService.summary();
  }

  // null when the client has not rated this order.
  @Get('payment/:paymentId')
  findByPayment(@Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.reviewService.findByPayment(paymentId);
  }
}
