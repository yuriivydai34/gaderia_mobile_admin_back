import { Repository } from 'typeorm';
import { BonusService } from './bonus.service';
import { BonusLedger } from './bonus-ledger.entity';

describe('BonusService.accounts', () => {
  const query = jest.fn();
  const service = new BonusService({ query } as unknown as Repository<BonusLedger>);
  beforeEach(() => query.mockReset().mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]));

  const lastSql = () => String(query.mock.calls[1][0]);

  it('sorts only by known columns; anything else falls back to balance', async () => {
    await service.accounts(1, 20, undefined, 'x; DROP TABLE account', 'DESC');
    expect(lastSql()).toContain('ORDER BY balance DESC NULLS LAST, account_id ASC');
    expect(lastSql()).not.toContain('DROP');
  });

  it('search is a parameter, not part of the SQL text', async () => {
    await service.accounts(1, 20, "o'brien", 'last', 'ASC');
    expect(lastSql()).toContain('ORDER BY last_at ASC');
    expect(lastSql()).not.toContain("o'brien");
    expect(query.mock.calls[1][1]).toEqual(["%o'brien%"]);
  });

  it('clamps paging', async () => {
    await service.accounts(-1, 100000);
    expect(lastSql()).toContain('LIMIT 100 OFFSET 0');
  });
});
