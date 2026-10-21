import { Repository } from 'typeorm';
import { OverviewService } from './overview.service';
import { Payment } from '../payment/payment.entity';
import { Account } from '../account/account.entity';

// A query builder stub for the revenue sum (the only call left on it).
function revenueQueryBuilderStub(sum: unknown) {
  const calls: Record<string, unknown[]> = {};
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) =>
    (qb[name] = jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return qb;
    }));
  ['select', 'where'].forEach(chain);
  qb.getRawOne = jest.fn().mockResolvedValue(sum === undefined ? undefined : { sum });
  return { qb, calls };
}

describe('OverviewService.get', () => {
  it('reports real counts, revenue only from paid statuses, and the newest orders', async () => {
    const revenue = revenueQueryBuilderStub('1234.5');
    const paymentRepository = {
      count: jest.fn((opts?: unknown) => Promise.resolve(opts ? 2 : 10)),
      find: jest.fn().mockResolvedValue([
        { id: 5, order_id: 'A5', full_name: 'Іван', amount: 500, status: 'WORK', updatedAt: new Date('2026-10-20') },
      ]),
      createQueryBuilder: jest.fn(() => revenue.qb),
      query: jest.fn().mockResolvedValue([{ name: 'Сік яблучний 1л', orders: '3', revenue: '450' }]),
    } as unknown as Repository<Payment>;
    const accountRepository = { count: jest.fn().mockResolvedValue(42) } as unknown as Repository<Account>;

    const result = await new OverviewService(paymentRepository, accountRepository).get();

    expect(result.totalOrders).toBe(10);
    expect(result.cancelledOrders).toBe(2);
    expect(result.customers).toBe(42);
    expect(result.revenue).toBe(1234.5);
    expect(result.recentOrders).toEqual([
      { id: 5, order_id: 'A5', full_name: 'Іван', amount: 500, status: 'WORK', updatedAt: new Date('2026-10-20') },
    ]);
    expect(result.topProducts).toEqual([{ name: 'Сік яблучний 1л', orders: 3, revenue: 450 }]);
    // Revenue and the top-products query read the status column, not the
    // amount of every row: a WAITING or CANCELED order never moved money.
    expect(revenue.calls.where[1]).toEqual({ statuses: ['WORK', 'COMPLETED'] });
    expect((paymentRepository.query as jest.Mock).mock.calls[0][1]).toEqual([['WORK', 'COMPLETED']]);
  });

  it('turns a missing revenue sum into 0, not NaN', async () => {
    const revenue = revenueQueryBuilderStub(undefined);
    const paymentRepository = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => revenue.qb),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Payment>;
    const accountRepository = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<Account>;

    const result = await new OverviewService(paymentRepository, accountRepository).get();

    expect(result.revenue).toBe(0);
    expect(result.topProducts).toEqual([]);
  });
});
