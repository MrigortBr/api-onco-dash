import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UserLogin } from './user-login.entity.js';
import { User } from './user.entity.js';

export interface ExportLogAba {
  nome: string;
  linhas: number;
}

/** Cada exportação (CSV/PNG/XLSX/PDF) feita no painel — igual ao SIMDASH. */
@Entity({ name: 'export_log' })
@Index('IDX_export_log_created_at', ['createdAt'])
@Index('IDX_export_log_id_users', ['idUsers'])
@Unique('UQ_export_log_export_id', ['exportId'])
export class ExportLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'export_id', type: 'uuid' })
  exportId: string;

  @Column({ name: 'id_users', type: 'int', nullable: true })
  idUsers: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'id_users', foreignKeyConstraintName: 'FK_export_log_id_users' })
  user?: User | null;

  @Column({ name: 'id_users_login', type: 'int', nullable: true })
  idUsersLogin: number | null;

  @ManyToOne(() => UserLogin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'id_users_login', foreignKeyConstraintName: 'FK_export_log_id_users_login' })
  session?: UserLogin | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  fingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 300 })
  pagina: string;

  @Column({ type: 'varchar', length: 200 })
  arquivo: string;

  @Column({ type: 'varchar', length: 10, default: 'csv' })
  formato: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  abas: ExportLogAba[];

  @Column({ name: 'total_linhas', type: 'int', default: 0 })
  totalLinhas: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
