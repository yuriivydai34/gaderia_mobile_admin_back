import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../payment/payment.entity';
import { Account } from '../account/account.entity';

// Paid, whether or not it has since shipped: the two statuses that moved
// money. WAITING never paid, CANCELED paid nothing or gave it back.
const PAID_STATUSES = ['WORK', 'COMPLETED'];

export type RecentOrder = {
  id: number;
  order_id: string | null;
  full_name: string | null;
  amount: number | null;
  status: string | null;
  updatedAt: Date;
};

export type TopProduct = {
  name: string;
  orders: number;
  revenue: number;
};

export type Overview = {
  totalOrders: number;
  cancelledOrders: number;
  revenue: number;
  customers: number;
  recentOrders: RecentOrder[];
  topProducts: TopProduct[];
};

/**
 * What the "Огляд" page used to show as made-up numbers. Everything here
 * reads real rows: orders and revenue from `payment`, customers from
 * `account`, top products from each paid order's own item list
 * (`catalog_list_id`, the same JSON app-server wrote at checkout). There is
 * no month-over-month change here — nothing keeps last month's numbers to
 * compare against, so the page does not claim one.
 */
@Injectable()
export class OverviewService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async get(): Promise<Overview> {
    const [totalOrders, cancelledOrders, customers, revenueRow, recentOrders, topProducts] = await Promise.all([
      this.paymentRepository.count(),
      this.paymentRepository.count({ where: { status: 'CANCELED' } }),
      this.accountRepository.count(),
      this.paymentRepository
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .where('p.status IN (:...statuses)', { statuses: PAID_STATUSES })
        .getRawOne<{ sum: string }>(),
      this.paymentRepository.find({
        order: { updatedAt: 'DESC' },
        take: 5,
      }),
      this.topProducts(),
    ]);

    return {
      totalOrders,
      cancelledOrders,
      revenue: Number(revenueRow?.sum ?? 0),
      customers,
      recentOrders: recentOrders.map((p) => ({
        id: p.id,
        order_id: p.order_id,
        full_name: p.full_name,
        amount: p.amount,
        status: p.status,
        updatedAt: p.updatedAt,
      })),
      topProducts,
    };
  }

  // catalog_list_id is the cart app-server wrote at checkout: an array of
  // { count, model_catalog: { header, price, price_discount, is_discount } }.
  // A product with no own row any more (deleted since) still shows by the
  // name it had then, instead of silently dropping its sales. TypeORM's
  // query builder cannot join a set-returning function (jsonb_array_elements)
  // without quoting it as a table name, so this is a plain parameterised query.
  private async topProducts(): Promise<TopProduct[]> {
    const rows: { name: string; orders: string; revenue: string }[] = await this.paymentRepository.query(
      `SELECT
         item->'model_catalog'->>'header' AS name,
         COUNT(*) AS orders,
         SUM(
           COALESCE((item->>'count')::numeric, 0) *
           CASE
             WHEN (item->'model_catalog'->>'is_discount')::boolean
               AND (item->'model_catalog'->>'price_discount') IS NOT NULL
             THEN (item->'model_catalog'->>'price_discount')::numeric
             ELSE COALESCE((item->'model_catalog'->>'price')::numeric, 0)
           END
         ) AS revenue
       FROM payment p, jsonb_array_elements(COALESCE(p.catalog_list_id, '[]'::jsonb)) AS item
       WHERE p.status = ANY($1) AND item->'model_catalog'->>'header' IS NOT NULL
       GROUP BY name
       ORDER BY revenue DESC
       LIMIT 5`,
      [PAID_STATUSES],
    );

    return rows.map((r) => ({
      name: r.name,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
    }));
  }
}
