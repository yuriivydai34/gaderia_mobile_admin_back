import { LAST_COMPLETED, inactiveDaysFilter } from './customer.service';

describe('"not bought for N days"', () => {
  it('takes a whole number of days up to ten years, ignores anything else', () => {
    expect(inactiveDaysFilter('90')).toBe(90);
    expect(inactiveDaysFilter(365)).toBe(365);
    for (const bad of ['0', '-5', '1.5', 'abc', '', undefined, '3651']) {
      expect(inactiveDaysFilter(bad)).toBeUndefined();
    }
  });

  // A cancelled order is not buying: the date must come from completed ones.
  it('is measured from the newest completed order, not from any order', () => {
    expect(LAST_COMPLETED).toContain("o->>'status' IN ('completed')");
    expect(LAST_COMPLETED).not.toContain('last_order_at');
  });
});
