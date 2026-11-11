import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One push notification sent from the panel - see migrations/025_push_log.sql
 * for why this lives only here, not in app-server.
 */
@Entity('push_log')
export class PushLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar' })
  body: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  image: string | null;

  /** null: sent to everyone (the "all" topic), not one person. */
  @Column({
    name: 'account_id',
    type: 'integer',
    nullable: true,
    default: null,
  })
  account_id: number | null;

  /** What Firebase returned: it accepted the message, not that it arrived. */
  @Column({
    name: 'message_id',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  message_id: string | null;

  @Column({ name: 'sent_by', type: 'varchar', nullable: true, default: null })
  sent_by: string | null;

  @Index()
  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;
}
