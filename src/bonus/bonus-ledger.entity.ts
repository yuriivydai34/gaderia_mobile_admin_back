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

  // ACCRUE or REDEEM.
  @Column({ type: 'varchar' })
  type: string;

  @Column({ name: 'payment_id', type: 'int', nullable: true, default: null })
  payment_id: number | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
