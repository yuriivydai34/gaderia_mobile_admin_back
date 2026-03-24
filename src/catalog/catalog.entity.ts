import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('catalog')
export class Catalog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  header: string | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  price: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  description: string | null;

  @Column({ name: 'is_discount', type: 'boolean', nullable: true, default: false })
  is_discount: boolean;

  @Column({ name: 'price_discount', type: 'double precision', nullable: true, default: null })
  price_discount: number | null;

  @Column({ name: 'type_packaging', type: 'varchar', nullable: true, default: null })
  type_packaging: string | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  measurement: number | null;

  @Column({ name: 'type_apple', type: 'varchar', nullable: true, default: null })
  type_apple: string | null;

  @Column({ name: 'type_vinegar', type: 'varchar', nullable: true, default: null })
  type_vinegar: string | null;

  @Column({ name: 'type_juice', type: 'varchar', nullable: true, default: null })
  type_juice: string | null;

  @Column({ name: 'type_product', type: 'varchar', nullable: true, default: null })
  type_product: string | null;

  @Column({ name: 'type_measurement', type: 'varchar', nullable: true, default: null })
  type_measurement: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  picture: string | null;

  @Column({ name: 'id_sort', type: 'integer' })
  id_sort: number;

  @Column({ name: 'shipment_weight', type: 'double precision', nullable: true, default: null })
  shipment_weight: number | null;

  @Column({ name: 'shipment_length', type: 'double precision', nullable: true, default: null })
  shipment_length: number | null;

  @Column({ name: 'shipment_width', type: 'double precision', nullable: true, default: null })
  shipment_width: number | null;

  @Column({ name: 'shipment_height', type: 'double precision', nullable: true, default: null })
  shipment_height: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  article: string | null;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}
