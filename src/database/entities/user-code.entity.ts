import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

export enum UserCodePurpose {
  CONVITE = 'convite',
  RESET_SENHA = 'reset_senha',
}

/**
 * Tokens de uso único (convite e recuperação de senha). Só o hash SHA-256
 * do token fica no banco; o token em si só existe no link enviado.
 */
@Entity({ name: 'users_code' })
@Index('IDX_users_code_id_users', ['idUsers'])
@Index('UQ_users_code_code', ['code'], { unique: true })
export class UserCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_users', type: 'int', update: false })
  idUsers: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'id_users', foreignKeyConstraintName: 'FK_users_code_id_users' })
  user?: User;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 20, default: UserCodePurpose.CONVITE })
  purpose: UserCodePurpose;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}
