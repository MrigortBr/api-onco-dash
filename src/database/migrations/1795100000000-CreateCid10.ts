import type { MigrationInterface, QueryRunner } from 'typeorm';
import dados from '../referencia/cid10-subcategorias.json' with { type: 'json' };

/**
 * Tabela de CID-10 de referência (schema `referencia`).
 *
 * A dbapaconco.tb_cid está VAZIA no banco de origem, mas a
 * tb_solicitacao_apac.co_cid_principal vem preenchida (sem chave estrangeira).
 * Conferido em 18/11/2026: o código é a posição do CID na tabela de
 * subcategorias do DATASUS em ordem de código — 1004 = C50.0, 1012 = C50.9,
 * 1198 = C92.1 (leucemia mieloide crônica), 848 = C15.5... Esta tabela traz
 * essa lista (a mesma CID-10-SUBCATEGORIAS.CSV do SIMDASH), e o painel usa a
 * tb_cid quando ela tiver o código e esta tabela quando não tiver.
 */
export class CreateCid101795100000000 implements MigrationInterface {
  name = 'CreateCid101795100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS referencia`);
    await q.query(`
      CREATE TABLE referencia.cid10 (
        co_seq_cid int8 PRIMARY KEY,
        sg_codigo varchar(20) NOT NULL,
        ds_cid text NOT NULL
      )`);
    const linhas = dados.cid;
    for (let i = 0; i < linhas.length; i += 5000) {
      const lote = linhas.slice(i, i + 5000);
      await q.query(
        `INSERT INTO referencia.cid10 (co_seq_cid, sg_codigo, ds_cid) SELECT * FROM unnest($1::int8[], $2::text[], $3::text[])`,
        [lote.map((_, j) => i + j + 1), lote.map((l) => l[0]), lote.map((l) => l[1])],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS referencia CASCADE`);
  }
}
