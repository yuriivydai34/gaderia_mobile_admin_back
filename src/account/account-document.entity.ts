import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Written by app-server (upload from the mobile app), only read here. The
// Sequelize model on that side is struct_account_document/account_document_db.js.
@Entity('account_document')
export class AccountDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'account_id', type: 'int' })
  account_id: number;

  // The name the client gave the file.
  @Column({ name: 'file_name', type: 'varchar' })
  file_name: string;

  // The name on app-server's disk (uuid + extension). Never sent to the panel.
  @Column({ name: 'stored_name', type: 'varchar' })
  stored_name: string;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true, default: null })
  mime_type: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  size: number | null;

  @CreateDateColumn({ name: 'createdAt', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', nullable: true })
  updatedAt: Date;
}
