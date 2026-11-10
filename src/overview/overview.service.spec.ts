import { Repository } from 'typeorm';
import { OverviewService } from './overview.service';
import { Payment } from '../payment/payment.entity';
import { Account } from '../account/account.entity';
import { kyivMonthRange, kyivThisMonth } from '../payment/kyiv-day';

// Two query builders now share createQueryBuilder: the all-time revenue sum
// and the this-month sum+count. Each stub answers whichever getRawOne its
// own instance gets, and both record the where/andWhere calls made on them.
function queryBuilderStub(row: unknown) {
  const calls: Record<string, unknown[]> = {};
  const qb: Record<string, jest.Mock> = {};
  const chain = (name: string) =>
    (qb[name] = jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return qb;
    }));
  ['select', 'addSelect', 'where', 'andWhere'].forEach(chain);
  qb.getRawOne = jest.fn().mockResolvedValue(row);
  return { qb, calls };
}

describe('OverviewService.get', () => {
  it('reports real counts, revenue only from paid statuses, this month, and the newest orders', async () => {
    const revenue = queryBuilderStub({ sum: '1234.5' });
    const thisMonth = queryBuilderStub({ sum: '300', count: '2' });
    const builders = [revenue.qb, thisMonth.qb];
    const paymentRepository = {
      count: jest.fn((opts?: unknown) => Promise.resolve(opts ? 2 : 10)),
      find: jest.fn().mockResolvedValue([
        {
          id: 5,
          order_id: 'A5',
          full_name: 'Іван',
          amount: 500,
          status: 'WORK',
          updatedAt: new Date('2026-10-20'),
        },
      ]),
      createQueryBuilder: jest.fn(() => builders.shift()),
      query: jest
        .fn()
        .mockResolvedValue([
          { name: 'Сік яблучний 1л', orders: '3', revenue: '450' },
        ]),
    } as unknown as Repository<Payment>;
    const accountRepository = {
      count: jest.fn().mockResolvedValue(42),
    } as unknown as Repository<Account>;

    const result = await new OverviewService(
      paymentRepository,
      accountRepository,
    ).get();

    expect(result.totalOrders).toBe(10);
    expect(result.cancelledOrders).toBe(2);
    expect(result.customers).toBe(42);
    expect(result.revenue).toBe(1234.5);
    expect(result.ordersThisMonth).toBe(2);
    expect(result.revenueThisMonth).toBe(300);
    expect(result.recentOrders).toEqual([
      {
        id: 5,
        order_id: 'A5',
        full_name: 'Іван',
        amount: 500,
        status: 'WORK',
        updatedAt: new Date('2026-10-20'),
      },
    ]);
    expect(result.topProducts).toEqual([
      { name: 'Сік яблучний 1л', orders: 3, revenue: 450 },
    ]);
    // Revenue and the top-products query read the status column, not the
    // amount of every row: a WAITING or CANCELED order never moved money.
    expect(revenue.calls.where[1]).toEqual({ statuses: ['WORK', 'COMPLETED'] });
    expect(thisMonth.calls.where[1]).toEqual({
      statuses: ['WORK', 'COMPLETED'],
    });
    // This month is a real Kyiv calendar-month boundary, not an open filter.
    const { year, month } = kyivThisMonth();
    expect(thisMonth.calls.andWhere[1]).toEqual(kyivMonthRange(year, month));
    expect((paymentRepository.query as jest.Mock).mock.calls[0][1]).toEqual([
      ['WORK', 'COMPLETED'],
    ]);
  });

  it('turns a missing revenue sum or this-month row into 0, not NaN', async () => {
    const revenue = queryBuilderStub(undefined);
    const thisMonth = queryBuilderStub(undefined);
    const builders = [revenue.qb, thisMonth.qb];
    const paymentRepository = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => builders.shift()),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Payment>;
    const accountRepository = {
      count: jest.fn().mockResolvedValue(0),
    } as unknown as Repository<Account>;

    const result = await new OverviewService(
      paymentRepository,
      accountRepository,
    ).get();

    expect(result.revenue).toBe(0);
    expect(result.ordersThisMonth).toBe(0);
    expect(result.revenueThisMonth).toBe(0);
    expect(result.topProducts).toEqual([]);
  });
});
