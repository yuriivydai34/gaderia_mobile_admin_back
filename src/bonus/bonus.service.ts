import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BonusLedger } from './bonus-ledger.entity';

export type BonusSummary = {
  // People with at least one row.
  accounts: number;
  // Everything accrued, and what is left after spending (the same until
  // REDEEM exists).
  accrued: number;
  balance: number;
  lastAt: string | null;
};

export type BonusAccountRow = {
  account_id: number;
  full_name: string | null;
  email: string | null;
  number: string | null;
  balance: number;
  accrued: number;
  orders: number;
  last_at: string | null;
};

export type BonusEntry = {
  id: number;
  amount: number;
  type: string;
  createdAt: string;
  payment_id: number | null;
  order_amount: number | null;
  order_status: string | null;
};

// What the list may be sorted by: a whitelist, because it ends up in SQL.
const SORTS: Record<string, string> = {
  balance: 'balance',
  last: 'last_at',
  accrued: 'accrued',
};

const PER_ACCOUNT = `
  SELECT b.account_id,
         a.full_name, a.email, a.number,
         SUM(b.amount)::int AS balance,
         COALESCE(SUM(b.amount) FILTER (WHERE b.type = 'ACCRUE'), 0)::int AS accrued,
         COUNT(*) FILTER (WHERE b.type = 'ACCRUE')::int AS orders,
         MAX(b."createdAt") AS last_at
  FROM bonus_ledger b
  JOIN account a ON a.id = b.account_id`;

@Injectable()
export class BonusService {
  constructor(@InjectRepository(BonusLedger) private readonly ledger: Repository<BonusLedger>) {}

  async summary(): Promise<BonusSummary> {
    const [row] = await this.ledger.query(
      `SELECT COUNT(DISTINCT account_id)::int AS accounts,
              COALESCE(SUM(amount) FILTER (WHERE type = 'ACCRUE'), 0)::int AS accrued,
              COALESCE(SUM(amount), 0)::int AS balance,
              MAX("createdAt") AS "lastAt"
       FROM bonus_ledger`,
    );
    return row;
  }

  async accounts(page: number, limit: number, search?: string, sortBy = 'balance', sortOrder: 'ASC' | 'DESC' = 'DESC') {
    page = Number.isInteger(page) && page > 0 ? page : 1;
    limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    // Ties broken by account, so rows do not shift between pages.
    const order = `${SORTS[sortBy] ?? SORTS.balance} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'} NULLS LAST, account_id ASC`;

    const params: unknown[] = [];
    let where = '';
    const term = search?.trim();
    if (term) {
      params.push(`%${term}%`);
      where = `WHERE a.full_name ILIKE $1 OR a.email ILIKE $1 OR a.number ILIKE $1`;
    }
    const grouped = `${PER_ACCOUNT} ${where} GROUP BY b.account_id, a.full_name, a.email, a.number`;

    const [{ total }] = await this.ledger.query(`SELECT COUNT(*)::int AS total FROM (${grouped}) t`, params);
    const data: BonusAccountRow[] = await this.ledger.query(
      `${grouped} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );
    return { data, total, page, limit };
  }

  async history(accountId: number): Promise<{ account: BonusAccountRow; entries: BonusEntry[] }> {
    const [account]: BonusAccountRow[] = await this.ledger.query(
      `${PER_ACCOUNT} WHERE b.account_id = $1 GROUP BY b.account_id, a.full_name, a.email, a.number`,
      [accountId],
    );
    if (!account) throw new NotFoundException(`No bonuses for account ${accountId}`);
    const entries: BonusEntry[] = await this.ledger.query(
      `SELECT b.id, b.amount, b.type, b."createdAt", b.payment_id,
              p.amount AS order_amount, p.status AS order_status
       FROM bonus_ledger b LEFT JOIN payment p ON p.id = b.payment_id
       WHERE b.account_id = $1
       ORDER BY b."createdAt" DESC, b.id DESC`,
      [accountId],
    );
    return { account, entries };
  }
}
