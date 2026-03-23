import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Account } from '../account/account.entity';

@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'varchar', nullable: true, default: null })
  order_id: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  currency: string | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  amount: number | null;

  @Column({ name: 'data_key', type: 'varchar', nullable: true, default: null })
  data_key: string | null;

  @Column({ name: 'signature_key', type: 'varchar', nullable: true, default: null })
  signature_key: string | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  data: object | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  status: string | null;

  @Column({ name: 'createdAt', type: 'integer', nullable: true, default: null })
  createdAt: number | null;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;

  @Column({ name: 'catalog_list_id', type: 'jsonb', nullable: true, default: null })
  catalog_list_id: object | null;

  @Column({ name: 'url_payment', type: 'varchar', nullable: true, default: null })
  url_payment: string | null;

  @Column({ name: 'full_name', type: 'varchar', nullable: true, default: null })
  full_name: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  number: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  email: string | null;

  @Column({ name: 'payment_method', type: 'varchar', nullable: true, default: null })
  payment_method: string | null;

  @Column({ name: 'type_delivery', type: 'varchar', nullable: true, default: null })
  type_delivery: string | null;

  @Column({ name: 'delivery_description', type: 'jsonb', nullable: true, default: null })
  delivery_description: object | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  comment: string | null;

  @Column({ name: 'account_id', type: 'integer', nullable: true, default: null })
  account_id: number | null;

  @ManyToOne(() => Account, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'varchar', nullable: true, default: null })
  ttn: string | null;

  @Column({ name: 'cashier_check', type: 'jsonb', nullable: true, default: null })
  cashier_check: object | null;

  @Column({ name: 'is_delivery_payment', type: 'boolean', nullable: true, default: null })
  is_delivery_payment: boolean | null;

  @Column({ name: 'delivery_payment', type: 'double precision', nullable: true, default: null })
  delivery_payment: number | null;

  @Column({ name: 'is_delivery_address', type: 'boolean', nullable: true, default: false })
  is_delivery_address: boolean;

  @Column({ name: 'delivery_address', type: 'varchar', nullable: true, default: null })
  delivery_address: string | null;
}
