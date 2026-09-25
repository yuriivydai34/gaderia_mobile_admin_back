import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Customer } from './customer.entity';

/** Order statuses as WooCommerce reports them, grouped the way the list shows them. */
const COMPLETED_STATUSES = ['completed'];
const CANCELLED_STATUSES = ['cancelled', 'refunded', 'failed'];

const ORDERS =
  "jsonb_array_elements(COALESCE(customer.source_data->'orders', '[]'::jsonb)) o";

function countOrders(statuses: string[]): string {
  const list = statuses.map((s) => `'${s}'`).join(', ');
  return `(SELECT count(*) FROM ${ORDERS} WHERE o->>'status' IN (${list}))`;
}

function sumOrders(statuses: string[]): string {
  const list = statuses.map((s) => `'${s}'`).join(', ');
  // Guard the cast: one malformed total must not fail the whole list.
  return `(SELECT COALESCE(sum(CASE WHEN o->>'total' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (o->>'total')::numeric END), 0) FROM ${ORDERS} WHERE o->>'status' IN (${list}))`;
}

/**
 * What the list can be sorted by. A whitelist, because the value ends up in SQL.
 * Order counts and totals live only in source_data; reading them from jsonb on
 * each request is fine at the size of this table (thousands of rows).
 */
const SORT_COLUMNS: Record<string, string> = {
  id: 'customer.id',
  orders: "(customer.source_data->>'ordersCount')::int",
  completed: countOrders(COMPLETED_STATUSES),
  cancelled: countOrders(CANCELLED_STATUSES),
  // Money actually received, so cancelled and refunded orders do not count.
  spent: sumOrders(COMPLETED_STATUSES),
  first_order: 'customer.first_order_at',
  last_order: 'customer.last_order_at',
};

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async findAll(
    page: number,
    limit: number,
    search?: string,
    source?: string,
    sortBy = 'id',
    sortOrder: 'ASC' | 'DESC' = 'ASC',
  ): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    const sortColumn = Object.hasOwn(SORT_COLUMNS, sortBy)
      ? SORT_COLUMNS[sortBy]
      : SORT_COLUMNS.id;
    const qb = this.customers
      .createQueryBuilder('customer')
      .orderBy(sortColumn, sortOrder, 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);

    // Ties are common (most people ordered once), so pin them down or rows
    // would shift between pages.
    if (sortColumn !== SORT_COLUMNS.id) qb.addOrderBy('customer.id', 'ASC');

    if (source) {
      qb.andWhere('customer.source = :source', { source });
    }

    const term = search?.trim();
    if (term) {
      const pattern = `%${term}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('customer.full_name ILIKE :pattern', { pattern })
            .orWhere('customer.email ILIKE :pattern', { pattern })
            .orWhere('customer.number ILIKE :pattern', { pattern })
            .orWhere('customer.name_company ILIKE :pattern', { pattern })
            .orWhere('customer.region ILIKE :pattern', { pattern })
            .orWhere('customer.settlement ILIKE :pattern', { pattern })
            .orWhere('customer.address ILIKE :pattern', { pattern })
            // Every email, phone spelling and address the person ever used is
            // kept in source_data, so one they used once still finds them.
            .orWhere('customer.source_data::text ILIKE :pattern', { pattern });
        }),
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  count(source?: string): Promise<number> {
    return source ? this.customers.count({ where: { source } }) : this.customers.count();
  }
}
