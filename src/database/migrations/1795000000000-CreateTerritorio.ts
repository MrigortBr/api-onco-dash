import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabelas de território (schema `territorio`), carregadas pelo
 * `npm run territorio:carregar` a partir das planilhas do CNES — ver
 * database/territorio/territorio-carga.ts. O banco do APAC Onco não tem
 * município do serviço, macrorregião, região de saúde nem tipo de
 * habilitação; o painel liga estas tabelas pelo CNES e pelo IBGE.
 *
 *  - territorio.municipio: todos os municípios (IBGE), com coordenadas da
 *    sede e a macro/região de saúde a que pertencem;
 *  - territorio.estabelecimento: CNES → município, macro, região, tipo
 *    (CACON/UNACON...) e coordenadas;
 *  - territorio.carga: quando e de quais arquivos foi feita cada carga.
 */
export class CreateTerritorio1795000000000 implements MigrationInterface {
  name = 'CreateTerritorio1795000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS territorio`);
    await q.query(`
      CREATE TABLE territorio.municipio (
        co_ibge varchar(7) PRIMARY KEY,
        co_ibge6 varchar(6) NOT NULL UNIQUE,
        no_municipio varchar(120) NOT NULL,
        sg_uf varchar(2) NOT NULL,
        co_macro varchar(20),
        no_macro varchar(200),
        co_regiao_saude varchar(20),
        no_regiao_saude varchar(200),
        latitude numeric(10,7),
        longitude numeric(10,7)
      )`);
    await q.query(`
      CREATE TABLE territorio.estabelecimento (
        co_cnes varchar(7) PRIMARY KEY,
        no_estabelecimento varchar(300),
        sg_uf varchar(2) NOT NULL,
        co_ibge varchar(7),
        no_municipio varchar(120) NOT NULL,
        co_macro varchar(20),
        no_macro varchar(200),
        co_regiao_saude varchar(20),
        no_regiao_saude varchar(200),
        tipo_servico varchar(60),
        habilitacao varchar(300),
        latitude numeric(10,7),
        longitude numeric(10,7)
      )`);
    await q.query(`CREATE INDEX idx_territorio_estab_macro ON territorio.estabelecimento (co_macro)`);
    await q.query(`CREATE INDEX idx_territorio_estab_regiao ON territorio.estabelecimento (co_regiao_saude)`);
    await q.query(`CREATE INDEX idx_territorio_estab_ibge ON territorio.estabelecimento (co_ibge)`);
    await q.query(`
      CREATE TABLE territorio.carga (
        id serial PRIMARY KEY,
        carregado_em timestamptz NOT NULL DEFAULT now(),
        arquivos text NOT NULL,
        municipios int NOT NULL,
        estabelecimentos int NOT NULL,
        habilitados int NOT NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS territorio CASCADE`);
  }
}
