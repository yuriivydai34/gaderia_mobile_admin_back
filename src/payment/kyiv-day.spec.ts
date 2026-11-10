import { kyivMonthRange, kyivThisMonth } from './kyiv-day';

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe('kyivMonthRange', () => {
  it('spans the whole calendar month in Kyiv, winter (UTC+2)', () => {
    const { start, end } = kyivMonthRange(2026, 11);
    expect(iso(start)).toBe('2026-10-31T22:00:00.000Z'); // 2026-11-01 00:00 Kyiv
    expect(iso(end)).toBe('2026-11-30T21:59:59.000Z'); // 2026-11-30 23:59:59 Kyiv
    expect(end - start).toBe(30 * 86400 - 1);
  });

  it('rolls December into the next year', () => {
    const { start, end } = kyivMonthRange(2026, 12);
    expect(iso(start)).toBe('2026-11-30T22:00:00.000Z');
    expect(iso(end)).toBe('2026-12-31T21:59:59.000Z');
    expect(end - start).toBe(31 * 86400 - 1);
  });

  it('gets February right in a non-leap year', () => {
    const { start, end } = kyivMonthRange(2025, 2);
    expect(end - start).toBe(28 * 86400 - 1);
  });

  it('crosses the summer/winter boundary within one month (October)', () => {
    // Clocks go back the last Sunday of October: the month is 31 days of
    // wall-clock time but 1 hour longer than 31*86400 seconds.
    const { start, end } = kyivMonthRange(2026, 10);
    expect(end - start).toBe(31 * 86400 - 1 + 3600);
  });
});

describe('kyivThisMonth', () => {
  it("reads the month from Kyiv wall-clock time, not the server's", () => {
    expect(kyivThisMonth(new Date('2026-11-10T12:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
    });
  });

  it('is still the old month just after Kyiv midnight, even if UTC has rolled over', () => {
    // 2026-11-01T21:30:00Z is 2026-10-31 23:30 in Kyiv (UTC+2 in Oct).
    expect(kyivThisMonth(new Date('2026-10-31T21:30:00Z'))).toEqual({
      year: 2026,
      month: 10,
    });
  });
});
