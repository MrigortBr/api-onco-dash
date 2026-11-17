import type { EntityManager } from 'typeorm';
import { linhasRetornadas } from '../query-rows.js';
import type { CsvValue } from '../seeds/csv.js';

/**
 * Importação da tb_usuario (APAC Onco) para users + users_info, sem alterar
 * nenhum valor. Usada pelo seed (CSV) e pela sincronização diária com o
 * banco de origem (SyncService):
 *
 *   users       ← co_seq_usuario (id), no_usuario (nome), ds_email (email), ds_senha_hash (senha)
 *   users_info  ← todas as outras colunas, com os mesmos nomes, + importado_em
 *
 * Os valores chegam como texto (do CSV ou do banco de origem lido "cru") e
 * o Postgres converte para o tipo da coluna — nada é normalizado aqui.
 */
export const COLUNAS = [
  'co_seq_usuario',
  'no_usuario',
  'no_login',
  'nu_usuario_keycloak',
  'ds_senha_hash',
  'ds_email',
  'st_registro_ativo',
  'st_alterar_senha_prox_acesso',
  'co_cnes',
  'co_usuario_criacao',
  'dt_criacao',
  'co_usuario_atualizacao',
  'dt_atualizacao',
  'co_usuario_exclusao',
  'dt_exclusao',
] as const;
export type Coluna = (typeof COLUNAS)[number];
export type Linha = Record<Coluna, CsvValue>;

/** Tamanho máximo de cada texto (igual à tb_usuario) e obrigatoriedade. */
const REGRAS: Partial<Record<Coluna, { max?: number; obrigatorio?: boolean }>> = {
  co_seq_usuario: { obrigatorio: true },
  no_usuario: { max: 255, obrigatorio: true },
  no_login: { max: 100, obrigatorio: true },
  nu_usuario_keycloak: { max: 36 },
  ds_senha_hash: { max: 500 },
  ds_email: { max: 255 },
  st_registro_ativo: { max: 1, obrigatorio: true },
  st_alterar_senha_prox_acesso: { max: 1, obrigatorio: true },
  co_cnes: { max: 7 },
  dt_criacao: { obrigatorio: true },
};
const INTEIRO = /^\d+$/;
const INT4_MAX = 2147483647;
const LOTE = 50;

/** Como cada coluna do CSV é gravada e comparada no banco. */
const DESTINO: Record<Coluna, { tabela: 'u' | 'i'; coluna: string; cast?: string }> = {
  co_seq_usuario: { tabela: 'u', coluna: 'id', cast: 'integer' },
  no_usuario: { tabela: 'u', coluna: 'nome' },
  ds_email: { tabela: 'u', coluna: 'email' },
  ds_senha_hash: { tabela: 'u', coluna: 'senha' },
  no_login: { tabela: 'i', coluna: 'no_login' },
  nu_usuario_keycloak: { tabela: 'i', coluna: 'nu_usuario_keycloak' },
  st_registro_ativo: { tabela: 'i', coluna: 'st_registro_ativo' },
  st_alterar_senha_prox_acesso: { tabela: 'i', coluna: 'st_alterar_senha_prox_acesso' },
  co_cnes: { tabela: 'i', coluna: 'co_cnes' },
  co_usuario_criacao: { tabela: 'i', coluna: 'co_usuario_criacao', cast: 'bigint' },
  dt_criacao: { tabela: 'i', coluna: 'dt_criacao', cast: 'timestamptz' },
  co_usuario_atualizacao: { tabela: 'i', coluna: 'co_usuario_atualizacao', cast: 'bigint' },
  dt_atualizacao: { tabela: 'i', coluna: 'dt_atualizacao', cast: 'timestamptz' },
  co_usuario_exclusao: { tabela: 'i', coluna: 'co_usuario_exclusao', cast: 'bigint' },
  dt_exclusao: { tabela: 'i', coluna: 'dt_exclusao', cast: 'timestamptz' },
};
const valorTmp = (c: Coluna) => (DESTINO[c].cast ? `t.${c}::${DESTINO[c].cast}` : `t.${c}`);
const COLUNAS_INFO = COLUNAS.filter((c) => DESTINO[c].tabela === 'i');

/**
 * Confere e converte linhas (na ordem de COLUNAS) em objetos. `origem`
 * descreve de onde vêm as linhas para as mensagens de erro; `primeiraLinha`
 * é o número da primeira linha (2 num CSV com cabeçalho).
 */
export function validarLinhas(linhas: CsvValue[][], origem = 'O arquivo', primeiraLinha = 2): Linha[] {

  const erros: string[] = [];
  const result = linhas.map((valores, idx) => {
    const n = idx + primeiraLinha;
    if (valores.length !== COLUNAS.length) {
      erros.push(`linha ${n}: ${valores.length} colunas (esperado ${COLUNAS.length})`);
    }
    const linha = Object.fromEntries(COLUNAS.map((c, i) => [c, valores[i] ?? null])) as Linha;
    for (const [c, regra] of Object.entries(REGRAS) as Array<[Coluna, { max?: number; obrigatorio?: boolean }]>) {
      const v = linha[c];
      if (regra.obrigatorio && (v === null || v === '')) erros.push(`linha ${n}: ${c} vazio`);
      if (regra.max && v && v.length > regra.max) erros.push(`linha ${n}: ${c} com ${v.length} caracteres (máx. ${regra.max})`);
    }
    for (const c of ['st_registro_ativo', 'st_alterar_senha_prox_acesso'] as const) {
      if (linha[c] && linha[c] !== 'S' && linha[c] !== 'N') erros.push(`linha ${n}: ${c} = "${linha[c]}" (esperado S ou N)`);
    }
    for (const c of ['co_seq_usuario', 'co_usuario_criacao', 'co_usuario_atualizacao', 'co_usuario_exclusao'] as const) {
      if (linha[c] && !INTEIRO.test(linha[c])) erros.push(`linha ${n}: ${c} = "${linha[c]}" não é número inteiro`);
    }
    if (linha.co_seq_usuario && INTEIRO.test(linha.co_seq_usuario) && Number(linha.co_seq_usuario) > INT4_MAX) {
      erros.push(`linha ${n}: co_seq_usuario ${linha.co_seq_usuario} maior que o suportado`);
    }
    return linha;
  });

  const repetidos = (coluna: Coluna, filtro: (l: Linha) => boolean = () => true) => {
    const vistos = new Map<string, number>();
    for (const l of result.filter(filtro)) {
      const v = l[coluna];
      if (v) vistos.set(v, (vistos.get(v) ?? 0) + 1);
    }
    return [...vistos].filter(([, q]) => q > 1).map(([v]) => v);
  };
  const ativos = (l: Linha) => !l.dt_exclusao;
  for (const v of repetidos('co_seq_usuario')) erros.push(`co_seq_usuario ${v} repetido`);
  for (const v of repetidos('no_login', ativos)) erros.push(`no_login "${v}" repetido entre contas não excluídas`);
  for (const v of repetidos('nu_usuario_keycloak', ativos)) erros.push(`nu_usuario_keycloak ${v} repetido`);

  if (erros.length > 0) throw new Error(`${origem} tem ${erros.length} problema(s):\n  ${erros.join('\n  ')}`);
  return result;
}

async function carregarTemporaria(em: EntityManager, linhas: Linha[]): Promise<void> {
  await em.query(`CREATE TEMP TABLE tmp_tb_usuario (${COLUNAS.map((c) => `${c} text`).join(', ')}) ON COMMIT DROP`);
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const params: CsvValue[] = [];
    const tuplas = lote.map((l) => {
      const marcadores = COLUNAS.map((c) => {
        params.push(l[c]);
        return `$${params.length}`;
      });
      return `(${marcadores.join(', ')})`;
    });
    await em.query(`INSERT INTO tmp_tb_usuario (${COLUNAS.join(', ')}) VALUES ${tuplas.join(', ')}`, params);
  }
}

/** Usuários criados no OncoDash que estão num id da tb_usuario ganham um id novo. */
async function realocarConflitos(em: EntityManager): Promise<Array<{ de: number; para: number; nome: string }>> {
  const conflitos: Array<{ id: number; nome: string }> = await em.query(`
    SELECT u.id, u.nome FROM users u
    JOIN tmp_tb_usuario t ON t.co_seq_usuario::integer = u.id
    LEFT JOIN users_info i ON i.id_users = u.id
    WHERE i.importado_em IS NULL
    ORDER BY u.id
  `);
  if (conflitos.length === 0) return [];

  const [{ base }] = (await em.query(`
    SELECT GREATEST(
      (SELECT COALESCE(MAX(id), 0) FROM users),
      (SELECT COALESCE(MAX(co_seq_usuario::integer), 0) FROM tmp_tb_usuario)
    ) AS base
  `)) as Array<{ base: number }>;

  const movidos: Array<{ de: number; para: number; nome: string }> = [];
  let proximo = Number(base);
  for (const c of conflitos) {
    proximo += 1;
    await em.query(`UPDATE users SET id = $1 WHERE id = $2`, [proximo, c.id]);
    // Referências "soltas" (sem FK) feitas por contas do próprio OncoDash.
    for (const col of ['co_usuario_criacao', 'co_usuario_atualizacao', 'co_usuario_exclusao']) {
      await em.query(`UPDATE users_info SET ${col} = $1 WHERE ${col} = $2 AND importado_em IS NULL`, [proximo, c.id]);
    }
    movidos.push({ de: c.id, para: proximo, nome: c.nome });
  }
  return movidos;
}

/** Linhas do arquivo cujo valor no banco é diferente (ou que não existem no banco). */
async function conferir(em: EntityManager): Promise<Array<{ id: string; coluna: string }>> {
  const partes = COLUNAS.map((c) => {
    const d = DESTINO[c];
    return `SELECT t.co_seq_usuario AS id, '${c}' AS coluna FROM tmp_tb_usuario t
      LEFT JOIN users u ON u.id = t.co_seq_usuario::integer
      LEFT JOIN users_info i ON i.id_users = t.co_seq_usuario::integer
      WHERE u.id IS NULL OR i.id_users IS NULL OR ${d.tabela}.${d.coluna} IS DISTINCT FROM ${valorTmp(c)}`;
  });
  return em.query(`${partes.join('\nUNION ALL\n')} ORDER BY 1, 2`);
}


export type ModoImportacao =
  /** Só insere quem ainda não foi importado; os já importados ficam como estão. */
  | 'novos'
  /** Insere os novos e sobrescreve os campos da tb_usuario dos já importados. */
  | 'atualizar'
  /**
   * Sincronização com a origem: insere os novos e atualiza os já importados,
   * preservando o que o OncoDash mudou de propósito — a senha trocada aqui
   * (senha_alterada_em preenchido) e o e-mail informado aqui quando a origem
   * não tem e-mail.
   */
  | 'sincronizar';

export interface ResumoImportacao {
  lidos: number;
  inseridos: number;
  jaImportados: number;
  /** Contas já importadas que de fato mudaram (modos atualizar/sincronizar). */
  atualizados: number;
  /** Já importadas que ficaram diferentes da origem (modo novos, ou o que o OncoDash preservou). */
  mantidasDiferentes: number;
  movidos: Array<{ de: number; para: number; nome: string }>;
}

/**
 * Grava as linhas dentro da transação `em`. Lança erro (desfazendo tudo) se
 * um login da origem já pertencer a uma conta criada no OncoDash, ou — nos
 * modos novos/atualizar — se a conferência coluna a coluna achar diferença.
 */
export async function importarUsuarios(em: EntityManager, linhas: Linha[], modo: ModoImportacao): Promise<ResumoImportacao> {
  await em.query(`LOCK TABLE users, users_info IN EXCLUSIVE MODE`);
  await carregarTemporaria(em, linhas);

  // Login igual ao de uma conta criada no OncoDash: não dá para decidir sozinho qual vale.
  const loginsEmUso: Array<{ id: number; no_login: string }> = await em.query(`
    SELECT i.id_users AS id, i.no_login FROM users_info i
    JOIN tmp_tb_usuario t ON lower(t.no_login) = lower(i.no_login)
    WHERE i.importado_em IS NULL AND i.dt_exclusao IS NULL AND t.dt_exclusao IS NULL
      AND i.id_users <> t.co_seq_usuario::integer
  `);
  if (loginsEmUso.length > 0) {
    throw new Error(
      `Estes logins da tb_usuario já pertencem a contas criadas no OncoDash:\n  ${loginsEmUso
        .map((l) => `${l.no_login} (users.id ${l.id})`)
        .join('\n  ')}\nResolva (exclua ou troque o login dessas contas) e rode de novo.`,
    );
  }

  const movidos = await realocarConflitos(em);

  const jaImportados: Array<{ id: number }> = await em.query(`
    SELECT i.id_users AS id FROM users_info i
    JOIN tmp_tb_usuario t ON t.co_seq_usuario::integer = i.id_users
    WHERE i.importado_em IS NOT NULL
  `);
  const jaSet = new Set(jaImportados.map((r) => String(r.id)));

  await em.query(`
    INSERT INTO users (id, nome, email, senha)
    SELECT t.co_seq_usuario::integer, t.no_usuario, t.ds_email, t.ds_senha_hash
    FROM tmp_tb_usuario t
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.co_seq_usuario::integer)
  `);
  await em.query(`
    INSERT INTO users_info (id_users, ${COLUNAS_INFO.map((c) => DESTINO[c].coluna).join(', ')}, importado_em)
    SELECT t.co_seq_usuario::integer, ${COLUNAS_INFO.map(valorTmp).join(', ')}, now()
    FROM tmp_tb_usuario t
    WHERE NOT EXISTS (SELECT 1 FROM users_info i WHERE i.id_users = t.co_seq_usuario::integer)
  `);

  let atualizados = 0;
  if (modo !== 'novos' && jaSet.size > 0) {
    const sincronizar = modo === 'sincronizar';
    const email = sincronizar ? 'COALESCE(t.ds_email, u.email)' : 't.ds_email';
    const senha = sincronizar ? 'CASE WHEN i.senha_alterada_em IS NULL THEN t.ds_senha_hash ELSE u.senha END' : 't.ds_senha_hash';
    const mudouUsers = linhasRetornadas<{ id: number }>(await em.query(`
      UPDATE users u SET nome = t.no_usuario, email = ${email}, senha = ${senha}
      FROM tmp_tb_usuario t, users_info i
      WHERE u.id = t.co_seq_usuario::integer AND i.id_users = u.id AND i.importado_em IS NOT NULL
        AND (u.nome, u.email, u.senha) IS DISTINCT FROM (t.no_usuario, ${email}, ${senha})
      RETURNING u.id
    `));
    const colsInfo = COLUNAS_INFO.map((c) => `i.${DESTINO[c].coluna}`).join(', ');
    const valsInfo = COLUNAS_INFO.map(valorTmp).join(', ');
    const mudouInfo = linhasRetornadas<{ id: number }>(await em.query(`
      UPDATE users_info i SET ${COLUNAS_INFO.map((c) => `${DESTINO[c].coluna} = ${valorTmp(c)}`).join(', ')}
        ${sincronizar ? '' : ', importado_em = now()'}
      FROM tmp_tb_usuario t
      WHERE i.id_users = t.co_seq_usuario::integer AND i.importado_em IS NOT NULL
        ${sincronizar ? `AND (${colsInfo}) IS DISTINCT FROM (${valsInfo})` : ''}
      RETURNING i.id_users AS id
    `));
    atualizados = new Set([...mudouUsers, ...mudouInfo].map((r) => r.id)).size;
  }

  await em.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))`);

  const diferencas = await conferir(em);
  if (modo !== 'sincronizar') {
    const novasComDiferenca = diferencas.filter((d) => modo === 'atualizar' || !jaSet.has(d.id));
    if (novasComDiferenca.length > 0) {
      throw new Error(
        `Conferência falhou — nada foi gravado. Diferenças:\n  ${novasComDiferenca
          .slice(0, 50)
          .map((d) => `co_seq_usuario ${d.id}: ${d.coluna}`)
          .join('\n  ')}`,
      );
    }
  }
  return {
    lidos: linhas.length,
    inseridos: linhas.length - jaSet.size,
    jaImportados: jaSet.size,
    atualizados: modo === 'atualizar' ? jaSet.size : atualizados,
    mantidasDiferentes: new Set(diferencas.map((d) => d.id)).size,
    movidos,
  };
}
