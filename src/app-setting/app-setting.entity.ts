import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Switches the panel changes without a deploy; app-server reads them
// (migrations/013). One row per key, see APP_SETTINGS for the known ones.
@Entity('app_setting')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
