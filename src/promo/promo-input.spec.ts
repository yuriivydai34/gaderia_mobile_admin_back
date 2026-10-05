import { BadRequestException } from '@nestjs/common';
import { normalizePromoInput } from './promo-input';
import { PromoCode } from './promo-code.entity';

const valid = { code: ' autumn-10 ', discount_type: 'PERCENT', discount_value: '10' };

describe('normalizePromoInput', () => {
  it('upper-cases and trims the code, turns numbers and blanks into what the table holds', () => {
    expect(
      normalizePromoInput({
        ...valid,
        title: '  ',
        usage_limit: '100',
        max_account_age_days: '',
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: null,
        first_order_only: true,
      }),
    ).toEqual({
      code: 'AUTUMN-10',
      title: null,
      discount_type: 'PERCENT',
      discount_value: 10,
      usage_limit: 100,
      max_account_age_days: null,
      starts_at: new Date('2026-10-01T00:00:00Z'),
      ends_at: null,
      first_order_only: true,
    });
  });

  it('auto_apply is read as a flag and left out when not sent', () => {
    expect(normalizePromoInput({ ...valid, auto_apply: true }).auto_apply).toBe(true);
    expect(normalizePromoInput({ ...valid, auto_apply: 0 }).auto_apply).toBe(false);
    expect('auto_apply' in normalizePromoInput({ ...valid })).toBe(false);
  });

  it('no body at all -> 400, not a 500', () => {
    expect(() => normalizePromoInput(undefined as unknown as Record<string, unknown>)).toThrow(BadRequestException);
  });

  it('accepts Cyrillic codes', () => {
    expect(normalizePromoInput({ ...valid, code: 'осінь' }).code).toBe('ОСІНЬ');
  });

  it.each([
    [{ code: 'a b c' }],
    [{ code: 'ab' }],
    [{ discount_type: 'GIFT' }],
    [{ discount_value: 0 }],
    [{ discount_value: 101 }],
    [{ usage_limit: 2.5 }],
    [{ usage_limit: -1 }],
    [{ starts_at: 'not a date' }],
    [{ starts_at: '2026-10-02', ends_at: '2026-10-01' }],
  ])('rejects %p', (patch) => {
    expect(() => normalizePromoInput({ ...valid, ...patch })).toThrow(BadRequestException);
  });

  it('a fixed discount may be above 100 hryvnias', () => {
    expect(normalizePromoInput({ ...valid, discount_type: 'FIXED', discount_value: 250 }).discount_value).toBe(250);
  });

  describe('PATCH', () => {
    const current = {
      discount_type: 'PERCENT',
      discount_value: 10,
      starts_at: new Date('2026-10-01'),
      ends_at: new Date('2026-10-31'),
    } as PromoCode;

    it('checks only the fields sent', () => {
      expect(normalizePromoInput({ is_active: false }, true, current)).toEqual({ is_active: false });
    });

    it('checks a new value against the stored ones', () => {
      expect(() => normalizePromoInput({ discount_value: 150 }, true, current)).toThrow(BadRequestException);
      expect(() => normalizePromoInput({ ends_at: '2026-09-01' }, true, current)).toThrow(BadRequestException);
    });
  });
});
