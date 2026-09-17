import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('integration_state')
export class IntegrationState {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamptz' })
  updatedAt: Date;
}
