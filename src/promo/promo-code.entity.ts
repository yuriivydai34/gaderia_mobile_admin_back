import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// numeric comes back from pg as a string; the panel wants numbers.
const numeric = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// Created and edited here; app-server checks and applies it at checkout
// (struct_promo_code/promo_code_db.js). Table: migrations/007_promo_code.sql.
@Entity('promo_code')
export class PromoCode {
  @PrimaryGeneratedColumn()
  id: number;

  // Upper-case; unique regardless of case.
  @Column({ type: 'varchar' })
  code: string;

  // The campaign, for managers.
  @Column({ type: 'varchar', nullable: true, default: null })
  title: string | null;

  @Column({ name: 'discount_type', type: 'varchar' })
  discount_type: DiscountType;

  // Percent or hryvnias, depending on discount_type.
  @Column({ name: 'discount_value', type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  discount_value: number;

  // null: unlimited.
  @Column({ name: 'usage_limit', type: 'int', nullable: true, default: null })
  usage_limit: number | null;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true, default: null })
  starts_at: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true, default: null })
  ends_at: Date | null;

  @Column({ name: 'first_order_only', type: 'boolean', default: false })
  first_order_only: boolean;

  @Column({ name: 'max_account_age_days', type: 'int', nullable: true, default: null })
  max_account_age_days: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  // Applied by the app at checkout without being typed (welcome discounts).
  @Column({ name: 'auto_apply', type: 'boolean', default: false })
  auto_apply: boolean;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}

// One use of a code. Written by app-server when an order is placed; read here
// for the usage list and the statistics.
@Entity('promo_redemption')
export class PromoRedemption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'promo_code_id', type: 'int' })
  promo_code_id: number;

  @Column({ name: 'account_id', type: 'int', nullable: true, default: null })
  account_id: number | null;

  // APP or WOO.
  @Column({ type: 'varchar', default: 'APP' })
  source: string;

  @Column({ name: 'payment_id', type: 'int', nullable: true, default: null })
  payment_id: number | null;

  @Column({ name: 'external_order_id', type: 'varchar', nullable: true, default: null })
  external_order_id: string | null;

  @Column({ name: 'order_amount', type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  order_amount: number;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  discount_amount: number;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}
