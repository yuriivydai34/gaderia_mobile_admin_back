import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** What tapping a banner does in the app. */
export const BANNER_TARGETS = ['none', 'product', 'link'] as const;
export type BannerTarget = (typeof BANNER_TARGETS)[number];

/**
 * A banner in the promotions carousel at the top of the app.
 *
 * The picture is uploaded in the panel and served from this API
 * (banner-image.ts), unlike a product picture, which is a URL into the
 * website's media library.
 */
@Entity('promo_banner')
@Index(['sort', 'id'])
export class PromoBanner {
  @PrimaryGeneratedColumn()
  id: number;

  /** Shown in the panel's list, and used as the picture's alt text. */
  @Column({ type: 'varchar' })
  title: string;

  /** File name under /promo-images, not a URL. */
  @Column({ type: 'varchar' })
  image: string;

  @Column({ name: 'target_type', type: 'varchar', default: 'none' })
  target_type: BannerTarget;

  /** catalog.id, when target_type is 'product'. Deliberately not a foreign
   *  key: a banner outliving a deleted product should go quiet, not block the
   *  deletion - the service drops the target instead. */
  @Column({
    name: 'target_product_id',
    type: 'integer',
    nullable: true,
    default: null,
  })
  target_product_id: number | null;

  @Column({
    name: 'target_url',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  target_url: string | null;

  @Column({ type: 'integer', default: 0 })
  sort: number;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  is_active: boolean;

  /** Both optional: empty means "from now" and "until switched off". */
  @Column({
    name: 'starts_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  starts_at: Date | null;

  @Column({
    name: 'ends_at',
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  ends_at: Date | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
