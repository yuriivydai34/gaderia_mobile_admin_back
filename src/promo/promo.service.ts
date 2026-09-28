import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromoCode, PromoRedemption } from './promo-code.entity';
import { normalizePromoInput } from './promo-input';
import { isDuplicateEmail as isUniqueViolation } from '../account/account.service';

export type PromoStats = {
  // Uses that count towards the limit: the order is not cancelled.
  used: number;
  // Uses whose order was cancelled; shown, but they freed their place.
  cancelled: number;
  // Hryvnias taken off, and the goods total those orders had before it.
  discount_total: number;
  order_total: number;
  last_used_at: Date | null;
};

export type PromoWithStats = PromoCode & PromoStats;

export type RedemptionRow = {
  id: number;
  source: string;
  payment_id: number | null;
  external_order_id: string | null;
  order_amount: number;
  discount_amount: number;
  createdAt: Date;
  account_id: number | null;
  email: string | null;
  full_name: string | null;
  order_id: string | null;
  status: string | null;
  // What the client was charged, delivery included.
  payment_amount: number | null;
};

// A use holds its place in the limit unless its order was cancelled. Site
// orders (no payment_id) always count. app-server counts the same way.
const COUNTS = `(r.payment_id IS NULL OR p.status IS DISTINCT FROM 'CANCELED')`;

const STATS_SQL = `
  SELECT r.promo_code_id,
         COUNT(*) FILTER (WHERE ${COUNTS})                           AS used,
         COUNT(*) FILTER (WHERE NOT ${COUNTS})                       AS cancelled,
         COALESCE(SUM(r.discount_amount) FILTER (WHERE ${COUNTS}), 0) AS discount_total,
         COALESCE(SUM(r.order_amount) FILTER (WHERE ${COUNTS}), 0)    AS order_total,
         MAX(r."createdAt")                                          AS last_used_at
  FROM promo_redemption r
  LEFT JOIN payment p ON p.id = r.payment_id`;

type StatsRow = {
  promo_code_id: number;
  used: string;
  cancelled: string;
  discount_total: string;
  order_total: string;
  last_used_at: Date | null;
};

function toStats(row?: StatsRow): PromoStats {
  return {
    used: Number(row?.used ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    discount_total: Number(row?.discount_total ?? 0),
    order_total: Number(row?.order_total ?? 0),
    last_used_at: row?.last_used_at ?? null,
  };
}

@Injectable()
export class PromoService {
  constructor(
    @InjectRepository(PromoCode)
    private readonly promoRepository: Repository<PromoCode>,
    @InjectRepository(PromoRedemption)
    private readonly redemptionRepository: Repository<PromoRedemption>,
  ) {}

  /** Newest first. There are tens of codes, not thousands: no paging. */
  async findAll(): Promise<PromoWithStats[]> {
    const codes = await this.promoRepository.find({ order: { id: 'DESC' } });
    const rows: StatsRow[] = await this.promoRepository.query(
      `${STATS_SQL} GROUP BY r.promo_code_id`,
    );
    const byCode = new Map(rows.map((row) => [Number(row.promo_code_id), row]));
    return codes.map((code) => ({ ...code, ...toStats(byCode.get(code.id)) }));
  }

  async findOne(id: number): Promise<PromoWithStats & { redemptions: RedemptionRow[] }> {
    const code = await this.promoRepository.findOne({ where: { id } });
    if (!code) throw new NotFoundException(`Promo code ${id} not found`);

    const [stats]: StatsRow[] = await this.promoRepository.query(
      `${STATS_SQL} WHERE r.promo_code_id = $1 GROUP BY r.promo_code_id`,
      [id],
    );
    const rows: RedemptionRow[] = await this.redemptionRepository.query(
      `SELECT r.id, r.source, r.payment_id, r.external_order_id,
              r.order_amount, r.discount_amount, r."createdAt",
              r.account_id, a.email, a.full_name,
              p.order_id, p.status, p.amount AS payment_amount
       FROM promo_redemption r
       LEFT JOIN account a ON a.id = r.account_id
       LEFT JOIN payment p ON p.id = r.payment_id
       WHERE r.promo_code_id = $1
       ORDER BY r."createdAt" DESC, r.id DESC`,
      [id],
    );
    const redemptions = rows.map((row) => ({
      ...row,
      order_amount: Number(row.order_amount),
      discount_amount: Number(row.discount_amount),
      payment_amount: row.payment_amount === null ? null : Number(row.payment_amount),
    }));

    return { ...code, ...toStats(stats), redemptions };
  }

  async create(body: Record<string, unknown>): Promise<PromoCode> {
    const input = normalizePromoInput(body);
    return this.save(() => this.promoRepository.save(this.promoRepository.create(input)));
  }

  async update(id: number, body: Record<string, unknown>): Promise<PromoCode> {
    const current = await this.promoRepository.findOne({ where: { id } });
    if (!current) throw new NotFoundException(`Promo code ${id} not found`);

    // Editing a used code is fine: each use keeps the amounts it had.
    const input = normalizePromoInput(body, true, current);
    return this.save(() => this.promoRepository.save({ ...current, ...input }));
  }

  /** Only a code nobody has used. A used one is switched off instead. */
  async remove(id: number): Promise<void> {
    const used = await this.redemptionRepository.count({ where: { promo_code_id: id } });
    if (used > 0) {
      throw new ConflictException(
        'Промокодом уже користувались — вимкніть його замість видалення, щоб лишилась історія',
      );
    }
    const result = await this.promoRepository.delete(id);
    if (!result.affected) throw new NotFoundException(`Promo code ${id} not found`);
  }

  private async save(write: () => Promise<PromoCode>): Promise<PromoCode> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Такий код уже існує');
      throw error;
    }
  }
}
