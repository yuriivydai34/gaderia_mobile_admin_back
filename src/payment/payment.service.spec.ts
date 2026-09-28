import { BadRequestException } from '@nestjs/common';
import { Between, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { PaymentService, normalizeOrderUpdate } from './payment.service';
import { Payment } from './payment.entity';
import { kyivDayRange, kyivToday } from './kyiv-day';

const secs = (iso: string) => Date.parse(iso) / 1000;

describe('kyivDayRange', () => {
  // The server's own zone must not matter; npm test runs it as is, and
  // test:tz below repeats the file under UTC.
  it('summer day: 00:00-23:59:59 Kyiv is 21:00 UTC the day before to 20:59:59', () => {
    expect(kyivDayRange('2026-09-28')).toEqual({
      start: secs('2026-09-27T21:00:00Z'),
      end: secs('2026-09-28T20:59:59Z'),
    });
  });

  it('winter day is an hour later in UTC', () => {
    expect(kyivDayRange('2026-12-01')).toEqual({
      start: secs('2026-11-30T22:00:00Z'),
      end: secs('2026-12-01T21:59:59Z'),
    });
  });

  it('the day clocks go back is 25 hours long', () => {
    const { start, end } = kyivDayRange('2026-10-25');
    expect(end - start + 1).toBe(25 * 3600);
  });

  it('an order at 00:30 Kyiv belongs to that day, not the one before', () => {
    const at = secs('2026-09-27T21:30:00Z'); // 28.09 00:30 Kyiv
    const { start, end } = kyivDayRange('2026-09-28');
    expect(at >= start && at <= end).toBe(true);
  });

  it.each(['', '28.09.2026', '2026-02-30', '2026-13-01', 'abc'])('rejects %p', (date) => {
    expect(() => kyivDayRange(date)).toThrow(BadRequestException);
  });

  it('today is taken in Kyiv: 23:30 UTC is already the next day there', () => {
    expect(kyivToday(new Date('2026-09-27T23:30:00Z'))).toBe('2026-09-28');
  });
});

describe('normalizeOrderUpdate', () => {
  it('keeps only the tracking number and the status', () => {
    expect(
      normalizeOrderUpdate({ ttn: ' 2045 ', status: 'WORK', amount: 1, catalog_list_id: [], account_id: 9, id: 3 }),
    ).toEqual({ ttn: '2045', status: 'WORK' });
  });

  it('a cleared tracking number is null', () => {
    expect(normalizeOrderUpdate({ ttn: '' })).toEqual({ ttn: null });
  });

  it('an unknown status -> 400', () => {
    expect(() => normalizeOrderUpdate({ status: 'PAID' })).toThrow(BadRequestException);
  });
});

describe('PaymentService', () => {
  let repo: { find: jest.Mock; findAndCount: jest.Mock; update: jest.Mock; findOne: jest.Mock; metadata: object };
  let service: PaymentService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      update: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
      metadata: { columns: [{ propertyName: 'updatedAt' }, { propertyName: 'amount' }] },
    };
    service = new PaymentService(repo as unknown as Repository<Payment>);
  });

  it('update writes only the allowed fields', async () => {
    await service.update(3, { status: 'CANCELED', amount: 1 });
    expect(repo.update).toHaveBeenCalledWith(3, { status: 'CANCELED' });
  });

  it('update with nothing allowed writes nothing', async () => {
    await service.update(3, { amount: 1 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each([
    ['garbage direction', 'amount', 'abc', 1, 10, { amount: 'DESC' }, 0, 10],
    ['unknown column', 'password', 'asc', 1, 10, { updatedAt: 'ASC' }, 0, 10],
    ['huge limit', 'amount', 'ASC', 2, 100000, { amount: 'ASC' }, 100, 100],
    ['broken page and limit', 'amount', 'ASC', NaN, -5, { amount: 'ASC' }, 0, 10],
  ])('list: %s is clamped, not a 500 or a dump', async (_, sortBy, sortOrder, page, limit, order, skip, take) => {
    await service.findAll(page, limit, sortBy, sortOrder as 'ASC', undefined);
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ order, skip, take }));
  });

  it('report: the Kyiv day, as a readable xlsx with one row per item', async () => {
    repo.find.mockResolvedValue([
      {
        id: 7, order_id: 'o7', amount: 593, status: 'WORK', createdAt: secs('2026-09-27T21:30:00Z'),
        catalog_list_id: [
          { id: 1, count: 2, model_catalog: { header: 'Сік', price: 250 } },
          { id: 2, count: 1, model_catalog: { header: 'Оцет', price: 100 } },
        ],
      },
      { id: 8, order_id: 'o8', amount: 100, status: 'WAITING', catalog_list_id: null },
    ]);

    const file = await service.generateReport('2026-09-28');

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: Between(secs('2026-09-27T21:00:00Z'), secs('2026-09-28T20:59:59Z')) } }),
    );
    const sheet = XLSX.read(file).Sheets.Payments;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(rows.map((r) => [r.ID, r['Product Header'] ?? null, r['Item Count'] ?? null])).toEqual([
      [7, 'Сік', 2],
      [7, 'Оцет', 1],
      [8, null, null],
    ]);
  });
});
