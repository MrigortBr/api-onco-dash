import { describe, expect, it } from 'vitest';
import { pacienteHash } from './paciente-hash.js';
import { buildUpsertSkipUnchanged, chunkRows } from './upsert.js';

describe('pacienteHash', () => {
  process.env.PACIENTE_HASH_KEY = 'chave-de-teste';

  it('é o mesmo para o mesmo CPF, com ou sem máscara', () => {
    expect(pacienteHash('123.456.780-62', null)).toBe(pacienteHash('12345678062', '700000000000000'));
  });

  it('usa o CNS quando não há CPF e devolve null sem os dois', () => {
    expect(pacienteHash(null, '700000000000000')).not.toBe(pacienteHash('12345678062', null));
    expect(pacienteHash(null, null)).toBeNull();
  });

  it('não expõe o CPF', () => {
    expect(pacienteHash('12345678062', null)).not.toContain('12345678062');
  });
});

describe('buildUpsertSkipUnchanged', () => {
  it('só atualiza quando algo mudou e devolve o pk', () => {
    const { text, values } = buildUpsertSkipUnchanged('apac', 'tb_cid', 'co_seq_cid', [
      { co_seq_cid: '1', sg_codigo: 'C50', ds_cid: null },
    ]);
    expect(text).toContain('INSERT INTO "apac"."tb_cid"');
    expect(text).toContain('IS DISTINCT FROM');
    expect(text).toContain('RETURNING "co_seq_cid"');
    expect(values).toEqual(['1', 'C50', null]);
  });

  it('divide em lotes abaixo do limite de parâmetros', () => {
    const lotes = chunkRows(Array.from({ length: 100_000 }, (_, i) => i), 2);
    expect(lotes.length).toBe(4);
    expect(lotes.flat().length).toBe(100_000);
  });
});
