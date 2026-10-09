import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService shop sync', () => {
  it('ages the sync by what a successful run writes, never by the recorded error', async () => {
    const query = jest.fn().mockResolvedValue([{ updatedAt: new Date() }]);
    const service = new HealthService({ query } as unknown as DataSource);

    await service.check();

    const sql = query.mock.calls.map(([q]) => String(q)).find((q) => q.includes('integration_state')) ?? '';
    expect(sql).toContain("'woocommerce.last_run_at'");
    expect(sql).not.toContain('last_error');
    expect(sql).not.toMatch(/LIKE 'woocommerce%'/);
  });
});
