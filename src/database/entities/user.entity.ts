import { Column, Entity, Index, OneToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { UserInfo } from './user-info.entity.js';

/**
 * Dados de acesso do usuário: só nome, e-mail e senha. Todo o resto (login,
 * situação, CNES, auditoria de criação, escopo do OncoDash...) fica em
 * `users_info` (UserInfo), 1 para 1 pelo mesmo id.
 *
 * Os usuários vindos da tb_usuario do APAC Onco mantêm o mesmo id
 * (co_seq_usuario) e os valores exatamente como estavam:
 *   no_usuario → nome · ds_email → email · ds_senha_hash → senha
 * Por isso o e-mail não é único nem obrigatório (há e-mails repetidos e
 * contas sem e-mail na origem) — quem identifica a conta é o `no_login`.
 */
@Entity({ name: 'users' })
// Índice funcional lower(email), criado na migration (o TypeORM não descreve índice de expressão).
@Index('IDX_users_email_lower', { synchronize: false })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Hash bcrypt ($2a$/$2b$); nulo = conta ainda sem senha (convite pendente ou importada sem senha). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  senha: string | null;

  @OneToOne(() => UserInfo, (info) => info.user)
  info?: Relation<UserInfo>;
}
