import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserProfile } from '../../auth/profiles.js';
import { User } from './user.entity.js';

/**
 * Histórico de perfis: cada mudança grava uma linha nova e vale a mais
 * recente (maior id), igual ao SIMDASH.
 */
@Entity({ name: 'user_permission' })
@Index('IDX_user_permission_id_users', ['idUsers'])
export class UserPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_users', type: 'int', update: false })
  idUsers: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'id_users', foreignKeyConstraintName: 'FK_user_permission_id_users' })
  user?: User;

  @Column({ type: 'enum', enum: UserProfile, enumName: 'user_profile_enum' })
  profile: UserProfile;

  @Column({ name: 'can_edit', type: 'boolean', default: false })
  canEdit: boolean;

  @Column({ name: 'can_add', type: 'boolean', default: false })
  canAdd: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
