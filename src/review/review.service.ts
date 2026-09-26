import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderReview } from './order-review.entity';
import { Payment } from '../payment/payment.entity';

export type ReviewRow = OrderReview & {
  order_id: string | null;
  full_name: string | null;
  number: string | null;
};

export type ReviewSummary = {
  count: number;
  average: number | null;
  // How many reviews gave each number of stars, 1 to 5.
  byRating: Record<1 | 2 | 3 | 4 | 5, number>;
};

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(OrderReview)
    private readonly reviewRepository: Repository<OrderReview>,
  ) {}

  /** Newest first, with the order number and the client's contact for a call back. */
  async findAll(
    page: number,
    limit: number,
    rating?: number,
  ): Promise<{
    data: ReviewRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = this.reviewRepository
      .createQueryBuilder('r')
      .leftJoin(Payment, 'p', 'p.id = r.payment_id')
      .select('r.*')
      .addSelect([
        'p.order_id AS order_id',
        'p.full_name AS full_name',
        'p.number AS number',
      ])
      .orderBy('r."createdAt"', 'DESC')
      .addOrderBy('r.id', 'DESC');
    if (rating) query.where('r.rating = :rating', { rating });

    const total = await query.clone().getCount();
    const data = await query
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<ReviewRow>();
    return { data, total, page, limit };
  }

  findByPayment(paymentId: number): Promise<OrderReview | null> {
    return this.reviewRepository.findOne({ where: { payment_id: paymentId } });
  }

  async summary(): Promise<ReviewSummary> {
    const rows = await this.reviewRepository
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.rating')
      .getRawMany<{ rating: number; count: string }>();

    const byRating: ReviewSummary['byRating'] = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let count = 0;
    let sum = 0;
    for (const row of rows) {
      const stars = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const n = Number(row.count);
      byRating[stars] = n;
      count += n;
      sum += stars * n;
    }
    return {
      count,
      average: count ? Math.round((sum / count) * 10) / 10 : null,
      byRating,
    };
  }
}
