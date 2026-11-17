import { Check, Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn, type Relation } from 'typeorm';
import { User } from './user.entity.js';

export const SIM = 'S';
export const NAO = 'N';
export type SimNao = typeof SIM | typeof NAO;

/**
 * Informações do usuário (1 para 1 com `users`, mesmo id).
 *
 * A primeira parte repete a tb_usuario do APAC Onco com os mesmos nomes,
 * tipos e valores (nada é normalizado na importação: CPF com ou sem máscara,
 * 'S'/'N', datas com fuso). A segunda parte é do OncoDash.
 *
 * Os campos int8 (co_usuario_*) voltam como string do driver do Postgres.
 */
@Entity({ name: 'users_info' })
@Check('CK_users_info_st_registro_ativo', `"st_registro_ativo" IN ('S', 'N')`)
@Check('CK_users_info_st_alterar_senha', `"st_alterar_senha_prox_acesso" IN ('S', 'N')`)
@Index('UQ_users_info_no_login', ['noLogin'], { unique: true, where: '"no_login" IS NOT NULL AND "dt_exclusao" IS NULL' })
@Index('UQ_users_info_nu_usuario_keycloak', ['nuUsuarioKeycloak'], {
  unique: true,
  where: '"nu_usuario_keycloak" IS NOT NULL AND "dt_exclusao" IS NULL',
})
export class UserInfo {
  @PrimaryColumn({ name: 'id_users', type: 'int' })
  idUsers: number;

  @OneToOne(() => User, (user) => user.info, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'id_users', foreignKeyConstraintName: 'FK_users_info_id_users' })
  // Relation<> evita a referência circular User ↔ UserInfo no metadata do decorator (ESM).
  user?: Relation<User>;

  // ── Campos da tb_usuario (APAC Onco) ─────────────────────────────────────

  /** CPF (com ou sem máscara) ou apelido. Nulo só em convite do OncoDash ainda não aceito. */
  @Column({ name: 'no_login', type: 'varchar', length: 100, nullable: true })
  noLogin: string | null;

  @Column({ name: 'nu_usuario_keycloak', type: 'varchar', length: 36, nullable: true })
  nuUsuarioKeycloak: string | null;

  @Column({ name: 'st_registro_ativo', type: 'varchar', length: 1, default: SIM })
  stRegistroAtivo: SimNao;

  @Column({ name: 'st_alterar_senha_prox_acesso', type: 'varchar', length: 1, default: NAO })
  stAlterarSenhaProxAcesso: SimNao;

  @Column({ name: 'co_cnes', type: 'varchar', length: 7, nullable: true })
  coCnes: string | null;

  @Column({ name: 'co_usuario_criacao', type: 'bigint', nullable: true })
  coUsuarioCriacao: string | null;

  @Column({ name: 'dt_criacao', type: 'timestamptz', default: () => 'now()' })
  dtCriacao: Date;

  @Column({ name: 'co_usuario_atualizacao', type: 'bigint', nullable: true })
  coUsuarioAtualizacao: string | null;

  @Column({ name: 'dt_atualizacao', type: 'timestamptz', nullable: true })
  dtAtualizacao: Date | null;

  @Column({ name: 'co_usuario_exclusao', type: 'bigint', nullable: true })
  coUsuarioExclusao: string | null;

  @Column({ name: 'dt_exclusao', type: 'timestamptz', nullable: true })
  dtExclusao: Date | null;

  // ── Campos do OncoDash ───────────────────────────────────────────────────

  /** Quando a linha veio do seed da tb_usuario (nulo = criado no OncoDash). */
  @Column({ name: 'importado_em', type: 'timestamptz', nullable: true })
  importadoEm: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cargo: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefone: string | null;

  /** AES-256-GCM (common/crypto/cpf-cipher.ts), gravado ao aceitar o convite. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  cpf: string | null;

  /** Última troca de senha feita no OncoDash. */
  @Column({ name: 'senha_alterada_em', type: 'timestamptz', nullable: true })
  senhaAlteradaEm: Date | null;

  // Escopo territorial (código + nome de cada nível); só vale nas abas restritas.
  @Column({ name: 'scope_uf', type: 'varchar', length: 2, nullable: true })
  scopeUf: string | null;

  @Column({ name: 'scope_uf_nome', type: 'varchar', length: 100, nullable: true })
  scopeUfNome: string | null;

  @Column({ name: 'scope_macrorregiao_cod', type: 'varchar', length: 20, nullable: true })
  scopeMacrorregiaoCod: string | null;

  @Column({ name: 'scope_macrorregiao_nome', type: 'varchar', length: 200, nullable: true })
  scopeMacrorregiaoNome: string | null;

  @Column({ name: 'scope_regiao_saude_cod', type: 'varchar', length: 20, nullable: true })
  scopeRegiaoSaudeCod: string | null;

  @Column({ name: 'scope_regiao_saude_nome', type: 'varchar', length: 200, nullable: true })
  scopeRegiaoSaudeNome: string | null;

  @Column({ name: 'scope_municipio_cod', type: 'varchar', length: 7, nullable: true })
  scopeMunicipioCod: string | null;

  @Column({ name: 'scope_municipio_nome', type: 'varchar', length: 200, nullable: true })
  scopeMunicipioNome: string | null;

  @Column({ name: 'scope_cnes', type: 'varchar', length: 7, nullable: true })
  scopeCnes: string | null;

  @Column({ name: 'scope_cnes_nome', type: 'varchar', length: 300, nullable: true })
  scopeCnesNome: string | null;
}
