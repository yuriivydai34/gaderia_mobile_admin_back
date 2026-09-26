import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderReview } from './order-review.entity';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrderReview])],
  providers: [ReviewService],
  controllers: [ReviewController],
})
export class ReviewModule {}
