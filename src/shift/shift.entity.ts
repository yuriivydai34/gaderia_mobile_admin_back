import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tokenCheckBox', type: 'text', nullable: true })
  tokenCheckBox: string | null;

  @Column({ name: 'licenseKeyCheckBox', type: 'varchar', nullable: true })
  licenseKeyCheckBox: string | null;

  @Column({ name: 'urlCheckbox', type: 'varchar', nullable: true })
  urlCheckbox: string | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
