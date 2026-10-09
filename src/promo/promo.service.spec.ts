import { COUNTS } from './promo.service';

// app-server enforces the limit with USED_SQL (components/promo/promo.js);
// the panel's statistics must count the same uses, or "Лишилось" would say
// there is room while the app and the site refuse the code.
describe('which promo uses count', () => {
  it('a released site use does not count, nor a cancelled app order', () => {
    expect(COUNTS).toContain('r.released_at IS NULL');
    expect(COUNTS).toContain("p.status IS DISTINCT FROM 'CANCELED'");
    // Both conditions must hold: released AND-ed with the order status.
    expect(COUNTS).toMatch(/released_at IS NULL AND \(/);
  });
});
