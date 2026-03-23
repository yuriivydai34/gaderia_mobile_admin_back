import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('account')
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name_company', type: 'varchar', nullable: true, default: null })
  name_company: string | null;

  @Column({ name: 'code_company', type: 'int', nullable: true, default: null })
  code_company: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  full_name: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  email: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  number: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  password: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  avatar: string | null;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  role: string | null;

  @Column({ name: 'email_confirmation_code', type: 'int', nullable: true, default: null })
  email_confirmation_code: number | null;

  @Column({ name: 'is_email_confirmation', type: 'boolean', nullable: true, default: false })
  is_email_confirmation: boolean;

  @Column({ name: 'name_bank', type: 'varchar', nullable: true, default: null })
  name_bank: string | null;

  @Column({ name: 'number_bank', type: 'varchar', nullable: true, default: null })
  number_bank: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  region: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  settlement: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  address: string | null;

  @Column({ name: 'type_account_subject', type: 'varchar', nullable: true, default: null })
  type_account_subject: string | null;
}
