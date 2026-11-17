import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

export enum UserAuditAction {
  CONVITE_CRIADO = 'convite_criado',
  CONVITE_REENVIADO = 'convite_reenviado',
  CONTA_ATIVADA = 'conta_ativada',
  USUARIO_ALTERADO = 'usuario_alterado',
  PERMISSAO_ALTERADA = 'permissao_alterada',
  SENHA_REDEFINIDA = 'senha_redefinida',
  SENHA_RECUPERACAO_PEDIDA = 'senha_recuperacao_pedida',
  USUARIO_CRIADO = 'usuario_criado',
}

/**
 * Quem mudou o quê em qual usuário (novo em relação ao SIMDASH). `antes` e
 * `depois` guardam só os campos que mudaram — nunca senha nem CPF.
 */
@Entity({ name: 'user_audit' })
@Index('IDX_user_audit_created_at', ['createdAt'])
@Index('IDX_user_audit_target', ['idUsersTarget'])
export class UserAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_users_actor', type: 'int', nullable: true })
  idUsersActor: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'id_users_actor', foreignKeyConstraintName: 'FK_user_audit_actor' })
  actor?: User | null;

  @Column({ name: 'id_users_target', type: 'int', nullable: true })
  idUsersTarget: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'id_users_target', foreignKeyConstraintName: 'FK_user_audit_target' })
  target?: User | null;

  @Column({ type: 'varchar', length: 40 })
  acao: UserAuditAction;

  @Column({ type: 'jsonb', nullable: true })
  antes: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  depois: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
