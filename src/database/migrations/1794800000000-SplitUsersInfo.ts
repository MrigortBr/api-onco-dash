import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Chaves estrangeiras que apontam para users(id): nome, tabela, coluna, ON DELETE. */
const FKS_PARA_USERS: Array<[string, string, string, 'CASCADE' | 'SET NULL']> = [
  ['FK_user_permission_id_users', 'user_permission', 'id_users', 'CASCADE'],
  ['FK_users_login_id_users', 'users_login', 'id_users', 'CASCADE'],
  ['FK_users_code_id_users', 'users_code', 'id_users', 'CASCADE'],
  ['FK_export_log_id_users', 'export_log', 'id_users', 'SET NULL'],
  ['FK_user_audit_actor', 'user_audit', 'id_users_actor', 'SET NULL'],
  ['FK_user_audit_target', 'user_audit', 'id_users_target', 'SET NULL'],
];

/**
 * Separa o usuário em duas tabelas, para receber a tb_usuario do APAC Onco
 * sem alterar nenhum valor:
 *   users       → id, nome, email, senha (dados de acesso)
 *   users_info  → colunas da tb_usuario + dados do OncoDash (cargo, CPF
 *                 criptografado, escopo...)
 *
 * O e-mail deixa de ser único e obrigatório (a origem tem e-mails repetidos
 * e contas sem e-mail). As FKs para users(id) passam a ter ON UPDATE CASCADE,
 * para o seed poder mudar o id de um usuário criado no OncoDash que esteja
 * ocupando um id da tb_usuario.
 *
 * Os usuários que já existirem são migrados (created_at → dt_criacao,
 * invited_by → co_usuario_criacao, password → senha).
 */
export class SplitUsersInfo1794800000000 implements MigrationInterface {
  name = 'SplitUsersInfo1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "users_info" (
        "id_users" integer PRIMARY KEY,
        "no_login" varchar(100),
        "nu_usuario_keycloak" varchar(36),
        "st_registro_ativo" varchar(1) NOT NULL DEFAULT 'S',
        "st_alterar_senha_prox_acesso" varchar(1) NOT NULL DEFAULT 'N',
        "co_cnes" varchar(7),
        "co_usuario_criacao" bigint,
        "dt_criacao" timestamptz NOT NULL DEFAULT now(),
        "co_usuario_atualizacao" bigint,
        "dt_atualizacao" timestamptz,
        "co_usuario_exclusao" bigint,
        "dt_exclusao" timestamptz,
        "importado_em" timestamptz,
        "cargo" varchar(200),
        "telefone" varchar(30),
        "cpf" varchar(200),
        "senha_alterada_em" timestamptz,
        "scope_uf" varchar(2),
        "scope_uf_nome" varchar(100),
        "scope_macrorregiao_cod" varchar(20),
        "scope_macrorregiao_nome" varchar(200),
        "scope_regiao_saude_cod" varchar(20),
        "scope_regiao_saude_nome" varchar(200),
        "scope_municipio_cod" varchar(7),
        "scope_municipio_nome" varchar(200),
        "scope_cnes" varchar(7),
        "scope_cnes_nome" varchar(300),
        CONSTRAINT "CK_users_info_st_registro_ativo" CHECK ("st_registro_ativo" IN ('S', 'N')),
        CONSTRAINT "CK_users_info_st_alterar_senha" CHECK ("st_alterar_senha_prox_acesso" IN ('S', 'N')),
        CONSTRAINT "FK_users_info_id_users" FOREIGN KEY ("id_users")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_users_info_no_login" ON "users_info" ("no_login")
      WHERE "no_login" IS NOT NULL AND "dt_exclusao" IS NULL
    `);
    await q.query(`
      CREATE UNIQUE INDEX "UQ_users_info_nu_usuario_keycloak" ON "users_info" ("nu_usuario_keycloak")
      WHERE "nu_usuario_keycloak" IS NOT NULL AND "dt_exclusao" IS NULL
    `);

    // Usuários que já existem no OncoDash.
    await q.query(`
      INSERT INTO "users_info" (
        "id_users", "co_usuario_criacao", "dt_criacao", "cargo", "telefone", "cpf", "senha_alterada_em",
        "scope_uf", "scope_uf_nome", "scope_macrorregiao_cod", "scope_macrorregiao_nome",
        "scope_regiao_saude_cod", "scope_regiao_saude_nome", "scope_municipio_cod", "scope_municipio_nome",
        "scope_cnes", "scope_cnes_nome"
      )
      SELECT
        "id", "invited_by_id_users", "created_at", "cargo", "telefone", "cpf", "password_changed_at",
        "scope_uf", "scope_uf_nome", "scope_macrorregiao_cod", "scope_macrorregiao_nome",
        "scope_regiao_saude_cod", "scope_regiao_saude_nome", "scope_municipio_cod", "scope_municipio_nome",
        "scope_cnes", "scope_cnes_nome"
      FROM "users"
    `);

    await q.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_invited_by"`);
    await q.query(`DROP INDEX "UQ_users_email"`);
    await q.query(`UPDATE "users" SET "nome" = "email" WHERE "nome" IS NULL`);
    await q.query(`
      ALTER TABLE "users"
        DROP COLUMN "cargo",
        DROP COLUMN "telefone",
        DROP COLUMN "cpf",
        DROP COLUMN "created_at",
        DROP COLUMN "activated_at",
        DROP COLUMN "password_changed_at",
        DROP COLUMN "invited_by_id_users",
        DROP COLUMN "scope_uf",
        DROP COLUMN "scope_uf_nome",
        DROP COLUMN "scope_macrorregiao_cod",
        DROP COLUMN "scope_macrorregiao_nome",
        DROP COLUMN "scope_regiao_saude_cod",
        DROP COLUMN "scope_regiao_saude_nome",
        DROP COLUMN "scope_municipio_cod",
        DROP COLUMN "scope_municipio_nome",
        DROP COLUMN "scope_cnes",
        DROP COLUMN "scope_cnes_nome"
    `);
    await q.query(`ALTER TABLE "users" RENAME COLUMN "password" TO "senha"`);
    await q.query(`
      ALTER TABLE "users"
        ALTER COLUMN "nome" TYPE varchar(255),
        ALTER COLUMN "nome" SET NOT NULL,
        ALTER COLUMN "email" TYPE varchar(255),
        ALTER COLUMN "email" DROP NOT NULL,
        ALTER COLUMN "senha" TYPE varchar(500)
    `);
    // Busca de login por e-mail sem diferenciar maiúsculas.
    await q.query(`CREATE INDEX "IDX_users_email_lower" ON "users" (lower("email"))`);

    for (const [nome, tabela, coluna, onDelete] of FKS_PARA_USERS) {
      await q.query(`ALTER TABLE "${tabela}" DROP CONSTRAINT "${nome}"`);
      await q.query(
        `ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" FOREIGN KEY ("${coluna}")
         REFERENCES "users"("id") ON DELETE ${onDelete} ON UPDATE CASCADE`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [nome, tabela, coluna, onDelete] of FKS_PARA_USERS) {
      await q.query(`ALTER TABLE "${tabela}" DROP CONSTRAINT "${nome}"`);
      await q.query(
        `ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" FOREIGN KEY ("${coluna}")
         REFERENCES "users"("id") ON DELETE ${onDelete}`,
      );
    }

    await q.query(`DROP INDEX "IDX_users_email_lower"`);
    await q.query(`ALTER TABLE "users" RENAME COLUMN "senha" TO "password"`);
    await q.query(`
      ALTER TABLE "users"
        ALTER COLUMN "nome" DROP NOT NULL,
        ALTER COLUMN "nome" TYPE varchar(200),
        ADD COLUMN "cargo" varchar(200),
        ADD COLUMN "telefone" varchar(30),
        ADD COLUMN "cpf" varchar(200),
        ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN "activated_at" timestamptz,
        ADD COLUMN "password_changed_at" timestamptz,
        ADD COLUMN "invited_by_id_users" integer,
        ADD COLUMN "scope_uf" varchar(2),
        ADD COLUMN "scope_uf_nome" varchar(100),
        ADD COLUMN "scope_macrorregiao_cod" varchar(20),
        ADD COLUMN "scope_macrorregiao_nome" varchar(200),
        ADD COLUMN "scope_regiao_saude_cod" varchar(20),
        ADD COLUMN "scope_regiao_saude_nome" varchar(200),
        ADD COLUMN "scope_municipio_cod" varchar(7),
        ADD COLUMN "scope_municipio_nome" varchar(200),
        ADD COLUMN "scope_cnes" varchar(7),
        ADD COLUMN "scope_cnes_nome" varchar(300)
    `);
    await q.query(`
      UPDATE "users" u SET
        "cargo" = i."cargo", "telefone" = i."telefone", "cpf" = i."cpf", "created_at" = i."dt_criacao",
        "activated_at" = CASE WHEN u."password" IS NOT NULL THEN i."dt_criacao" END,
        "password_changed_at" = i."senha_alterada_em",
        "invited_by_id_users" = CASE WHEN i."co_usuario_criacao" BETWEEN 1 AND 2147483647
          AND EXISTS (SELECT 1 FROM "users" x WHERE x."id" = i."co_usuario_criacao") THEN i."co_usuario_criacao"::integer END,
        "scope_uf" = i."scope_uf", "scope_uf_nome" = i."scope_uf_nome",
        "scope_macrorregiao_cod" = i."scope_macrorregiao_cod", "scope_macrorregiao_nome" = i."scope_macrorregiao_nome",
        "scope_regiao_saude_cod" = i."scope_regiao_saude_cod", "scope_regiao_saude_nome" = i."scope_regiao_saude_nome",
        "scope_municipio_cod" = i."scope_municipio_cod", "scope_municipio_nome" = i."scope_municipio_nome",
        "scope_cnes" = i."scope_cnes", "scope_cnes_nome" = i."scope_cnes_nome"
      FROM "users_info" i WHERE i."id_users" = u."id"
    `);
    // Volta a exigir e-mail único e obrigatório: contas sem e-mail ou com e-mail repetido
    // (as importadas da tb_usuario) impedem o revert — apague-as antes, se for o caso.
    await q.query(`
      ALTER TABLE "users"
        ALTER COLUMN "email" TYPE varchar(254),
        ALTER COLUMN "email" SET NOT NULL,
        ALTER COLUMN "password" TYPE varchar(100)
    `);
    await q.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);
    await q.query(`
      ALTER TABLE "users" ADD CONSTRAINT "FK_users_invited_by" FOREIGN KEY ("invited_by_id_users")
        REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(`DROP TABLE "users_info"`);
  }
}
