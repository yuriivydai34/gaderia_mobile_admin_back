import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A buyer imported from an external shop - a contact record, not a login.
 *
 * Deliberately separate from `account`: that table holds application accounts
 * with a password, and an imported row has none. Putting these there would make
 * register() reject the address as "already in use" while login() refuses it for
 * having no password, locking thousands of real customers out of the app.
 */
@Entity('customer')
@Index(['source', 'external_id'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  /** Which system this came from, e.g. 'woocommerce'. */
  @Column({ type: 'varchar' })
  source: string;

  /** Identity within that system. For guest orders, the normalised phone. */
  @Column({ name: 'external_id', type: 'varchar' })
  external_id: string;

  @Column({ name: 'full_name', type: 'varchar', nullable: true, default: null })
  full_name: string | null;

  @Index()
  @Column({ type: 'varchar', nullable: true, default: null })
  email: string | null;

  @Index()
  @Column({ type: 'varchar', nullable: true, default: null })
  number: string | null;

  @Column({ name: 'name_company', type: 'varchar', nullable: true, default: null })
  name_company: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  region: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  settlement: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  address: string | null;

  /**
   * Everything the shop knew that does not fit the columns above: every email,
   * phone spelling, name and address the person ever used, their delivery
   * records and a summary of their orders.
   */
  @Column({ name: 'source_data', type: 'jsonb', nullable: true, default: null })
  source_data: object | null;

  /** When this person first and last ordered, promoted out of source_data so
   *  the list can be sorted and filtered on them. */
  @Column({ name: 'first_order_at', type: 'timestamptz', nullable: true, default: null })
  first_order_at: Date | null;

  @Column({ name: 'last_order_at', type: 'timestamptz', nullable: true, default: null })
  last_order_at: Date | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
