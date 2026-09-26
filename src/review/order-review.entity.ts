import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// A client's rating of a completed order, left in the mobile app. Written by
// app-server (struct_order_review/order_review_db.js), only read here.
@Entity('order_review')
export class OrderReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'payment_id', type: 'int', unique: true })
  payment_id: number;

  @Column({ name: 'account_id', type: 'int' })
  account_id: number;

  // 1–5 stars.
  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true, default: null })
  review: string | null;

  // "Suggestions for the product or service" — a separate field on purpose,
  // so ideas are not lost inside complaints and praise.
  @Column({ type: 'text', nullable: true, default: null })
  suggestion: string | null;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}
