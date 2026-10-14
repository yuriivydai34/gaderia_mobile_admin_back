import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Bonuses, a journal (migrations/015): app-server writes an ACCRUE row per
// order paid online, 1 UAH = 1 bonus; the balance is SUM(amount) per account.
// No updatedAt: rows are never changed, only added.
@Entity('bonus_ledger')
export class BonusLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'account_id', type: 'int' })
  account_id: number;

  // Positive for an accrual; spending (REDEEM, not built yet) negative.
  @Column({ type: 'int' })
  amount: number;

  // ACCRUE, REDEEM, or REVERSE (an accrual taken back after a refund).
  @Column({ type: 'varchar' })
  type: string;

  @Column({ name: 'payment_id', type: 'int', nullable: true, default: null })
  payment_id: number | null;

  // APP or WOO (migrations/017). A site order has no payment row and is known
  // by its WooCommerce number instead.
  @Column({ type: 'varchar', default: 'APP' })
  source: string;

  @Column({ name: 'external_order_id', type: 'varchar', nullable: true, default: null })
  external_order_id: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
