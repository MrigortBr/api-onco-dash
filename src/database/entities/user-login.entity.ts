import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

/**
 * Uma linha por login = uma sessão. O JWT carrega o `id` (sid) e a API
 * confere a cada requisição se a sessão ainda vale e se o dispositivo é o
 * mesmo. Logout/troca de senha = `expires_at` passa a ser agora.
 */
@Entity({ name: 'users_login' })
@Index('IDX_users_login_id_users', ['idUsers'])
@Index('IDX_users_login_created_at', ['createdAt'])
export class UserLogin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_users', type: 'int', update: false })
  idUsers: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'id_users', foreignKeyConstraintName: 'FK_users_login_id_users' })
  user?: User;

  @Column({ type: 'varchar', length: 128 })
  fingerprint: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 400, nullable: true })
  userAgent: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  suspeito: boolean;

  @Column({ name: 'motivos_suspeita', type: 'varchar', length: 500, nullable: true })
  motivosSuspeita: string | null;

  @Column({ name: 'distancia_km', type: 'double precision', nullable: true })
  distanciaKm: number | null;
}
