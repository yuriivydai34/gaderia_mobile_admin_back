import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Products an account hearted in the mobile app. Written and read by
// app-server (struct_favorite/favorite_db.js); declared here so the schema has
// one owner of its migrations and dev-db-init creates it.
@Entity('favorite')
export class Favorite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'account_id', type: 'int' })
  account_id: number;

  @Column({ name: 'catalog_id', type: 'int' })
  catalog_id: number;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}
