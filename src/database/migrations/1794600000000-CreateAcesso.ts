import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de acesso do OncoDash: usuários, perfis, sessões, tokens de uso
 * único (convite / recuperação de senha), log de exportação e auditoria de
 * alterações de usuário. Mesmo desenho do SIMDASH, com o escopo territorial
 * gravado no próprio usuário (sem tabelas de território).
 */
export class CreateAcesso1794600000000 implements MigrationInterface {
  name = 'CreateAcesso1794600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(254) NOT NULL,
        "nome" varchar(200),
        "cargo" varchar(200),
        "telefone" varchar(30),
        "cpf" varchar(200),
        "password" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "activated_at" timestamptz,
        "password_changed_at" timestamptz,
        "invited_by_id_users" integer,
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
        CONSTRAINT "FK_users_invited_by" FOREIGN KEY ("invited_by_id_users")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    // E-mail único sem diferenciar maiúsculas (o serviço também normaliza para minúsculas).
    await q.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);

    await q.query(`
      CREATE TYPE "user_profile_enum" AS ENUM (
        'Desenvolvedor', 'Gestor federal', 'Gestor estadual', 'Gestor de macrorregião',
        'Gestor de região de saúde', 'Gestor municipal', 'Unidade'
      )
    `);
    await q.query(`
      CREATE TABLE "user_permission" (
        "id" SERIAL PRIMARY KEY,
        "id_users" integer NOT NULL,
        "profile" "user_profile_enum" NOT NULL,
        "can_edit" boolean NOT NULL DEFAULT false,
        "can_add" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_permission_id_users" FOREIGN KEY ("id_users")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_user_permission_id_users" ON "user_permission" ("id_users")`);

    await q.query(`
      CREATE TABLE "users_login" (
        "id" SERIAL PRIMARY KEY,
        "id_users" integer NOT NULL,
        "fingerprint" varchar(128) NOT NULL,
        "ip" varchar(64),
        "user_agent" varchar(400),
        "latitude" double precision,
        "longitude" double precision,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "suspeito" boolean NOT NULL DEFAULT false,
        "motivos_suspeita" varchar(500),
        "distancia_km" double precision,
        CONSTRAINT "FK_users_login_id_users" FOREIGN KEY ("id_users")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_users_login_id_users" ON "users_login" ("id_users")`);
    await q.query(`CREATE INDEX "IDX_users_login_created_at" ON "users_login" ("created_at")`);

    await q.query(`
      CREATE TABLE "users_code" (
        "id" SERIAL PRIMARY KEY,
        "id_users" integer NOT NULL,
        "code" varchar(64) NOT NULL,
        "purpose" varchar(20) NOT NULL DEFAULT 'convite',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        CONSTRAINT "FK_users_code_id_users" FOREIGN KEY ("id_users")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_users_code_id_users" ON "users_code" ("id_users")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_users_code_code" ON "users_code" ("code")`);

    await q.query(`
      CREATE TABLE "export_log" (
        "id" SERIAL PRIMARY KEY,
        "export_id" uuid NOT NULL,
        "id_users" integer,
        "id_users_login" integer,
        "fingerprint" varchar(128),
        "ip" varchar(64),
        "latitude" double precision,
        "longitude" double precision,
        "pagina" varchar(300) NOT NULL,
        "arquivo" varchar(200) NOT NULL,
        "formato" varchar(10) NOT NULL DEFAULT 'csv',
        "abas" jsonb NOT NULL DEFAULT '[]',
        "total_linhas" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_export_log_export_id" UNIQUE ("export_id"),
        CONSTRAINT "FK_export_log_id_users" FOREIGN KEY ("id_users")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_export_log_id_users_login" FOREIGN KEY ("id_users_login")
          REFERENCES "users_login"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_export_log_created_at" ON "export_log" ("created_at")`);
    await q.query(`CREATE INDEX "IDX_export_log_id_users" ON "export_log" ("id_users")`);

    await q.query(`
      CREATE TABLE "user_audit" (
        "id" SERIAL PRIMARY KEY,
        "id_users_actor" integer,
        "id_users_target" integer,
        "acao" varchar(40) NOT NULL,
        "antes" jsonb,
        "depois" jsonb,
        "ip" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_audit_actor" FOREIGN KEY ("id_users_actor")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_user_audit_target" FOREIGN KEY ("id_users_target")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_user_audit_created_at" ON "user_audit" ("created_at")`);
    await q.query(`CREATE INDEX "IDX_user_audit_target" ON "user_audit" ("id_users_target")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "user_audit"`);
    await q.query(`DROP TABLE "export_log"`);
    await q.query(`DROP TABLE "users_code"`);
    await q.query(`DROP TABLE "users_login"`);
    await q.query(`DROP TABLE "user_permission"`);
    await q.query(`DROP TYPE "user_profile_enum"`);
    await q.query(`DROP TABLE "users"`);
  }
}
