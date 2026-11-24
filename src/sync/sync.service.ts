import { Injectable, Logger } from '@nestjs/common';
import { Client, type ClientConfig } from 'pg';
import { DataSource, type EntityManager } from 'typeorm';
import { decryptCpf, encryptCpf } from '../common/crypto/cpf-cipher.js';
import { linhasRetornadas } from '../database/query-rows.js';
import { COLUNAS as COLUNAS_USUARIO, importarUsuarios, validarLinhas } from '../database/usuarios/usuarios-import.js';
import { SCHEMA_CLONE, TABELAS_ORIGEM, type TabelaOrigem } from './tabelas-origem.js';
import { buildUpsertSkipUnchanged, chunkRows } from './upsert.js';

export type SyncRunTrigger = 'manual' | 'automatico';

export interface SyncTableResult {
  name: string;
  read: number;
  written: number;
  /** Linhas que sumiram da origem e foram apagadas do clone. */
  removed?: number;
}

export interface SyncResult {
  success: boolean;
  tables: SyncTableResult[];
  error?: string;
}

export interface SyncRunHistoryItem {
  id: number;
  trigger: SyncRunTrigger;
  triggeredByNome: string | null;
  triggeredByEmail: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  error: string | null;
  tables: SyncTableResult[];
  totalRead: number;
  totalWritten: number;
}

export interface SyncRunHistoryPage {
  items: SyncRunHistoryItem[];
  total: number;
}

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 100;

/** Configuração da conexão SOMENTE LEITURA com o banco do APAC Onco. */
export function sourceConfig(): (ClientConfig & { schema: string }) | null {
  const host = process.env.SOURCE_DB_HOST;
  const user = process.env.SOURCE_DB_USER;
  const database = process.env.SOURCE_DB_NAME;
  if (!host || !user || !database) return null;
  const ssl = ['1', 'true', 'sim', 'yes'].includes((process.env.SOURCE_DB_SSL ?? '').toLowerCase());
  return {
    host,
    port: Number(process.env.SOURCE_DB_PORT ?? 5432),
    user,
    password: process.env.SOURCE_DB_PASS,
    database,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    schema: process.env.SOURCE_DB_SCHEMA || 'dbapaconco',
    application_name: 'oncodash-sync',
    // Todo valor chega como TEXTO, exatamente como o Postgres da origem o
    // escreve (datas com microssegundos e fuso, int8, numeric...). O banco
    // do OncoDash converte de volta para o tipo da coluna: nada se perde no
    // caminho (o driver converteria timestamptz para Date e cortaria os µs).
    types: { getTypeParser: () => (valor: string) => valor },
  };
}

/**
 * Clona o banco do APAC Onco (schema dbapaconco) para o banco do OncoDash —
 * mesma lógica do SIMDASH:
 *
 *  - leitura da origem numa transação SOMENTE LEITURA com snapshot
 *    (REPEATABLE READ): todas as tabelas como estavam no mesmo instante, sem
 *    bloquear quem está usando o APAC Onco;
 *  - upsert que só grava o que mudou (IS DISTINCT FROM), contando o que foi
 *    de fato escrito;
 *  - CPFs gravados cifrados, reaproveitando o valor cifrado quando o CPF não
 *    mudou (senão o IV aleatório faria toda linha parecer alterada);
 *  - colunas novas da origem que o clone não conhece são ignoradas com aviso
 *    (o sync não quebra quando o APAC Onco muda o schema).
 *
 * Diferenças em relação ao SIMDASH:
 *  - a gravação no OncoDash acontece numa transação só: o painel nunca vê
 *    metade de uma atualização, e uma falha desfaz tudo;
 *  - linhas apagadas fisicamente na origem também são apagadas no clone
 *    (exceto se a origem vier vazia, que é tratado como erro de leitura);
 *  - a tb_usuario também é sincronizada (contas novas, desativadas, nome,
 *    e-mail...), preservando a senha trocada no OncoDash.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  isConfigured(): boolean {
    return sourceConfig() !== null;
  }

  async getStatus(): Promise<{ updatedAt: string | null; running: boolean; configured: boolean }> {
    let updatedAt: string | null = null;
    try {
      const rows: Array<{ updated_at: Date }> = await this.dataSource.query('SELECT updated_at FROM sync_run LIMIT 1');
      updatedAt = rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
    } catch {
      // tabela ainda não migrada
    }
    return { updatedAt, running: this.running, configured: this.isConfigured() };
  }

  async history(query: { limit?: number; offset?: number }): Promise<SyncRunHistoryPage> {
    const limit = Math.min(Math.max(query.limit || HISTORY_DEFAULT_LIMIT, 1), HISTORY_MAX_LIMIT);
    const offset = Math.max(query.offset || 0, 0);
    const rows: Array<{
      id: number;
      trigger: SyncRunTrigger;
      started_at: Date;
      finished_at: Date;
      success: boolean;
      error: string | null;
      tables: SyncTableResult[] | null;
      nome: string | null;
      email: string | null;
    }> = await this.dataSource.query(
      `SELECT l.id, l.trigger, l.started_at, l.finished_at, l.success, l.error, l.tables, u.nome, u.email
       FROM sync_run_log l LEFT JOIN users u ON u.id = l.triggered_by_id_users
       ORDER BY l.started_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const [{ count }] = (await this.dataSource.query('SELECT COUNT(*)::int AS count FROM sync_run_log')) as Array<{
      count: number;
    }>;
    return {
      total: count,
      items: rows.map((r) => {
        const tables = r.tables ?? [];
        const started = new Date(r.started_at);
        const finished = new Date(r.finished_at);
        return {
          id: r.id,
          trigger: r.trigger,
          triggeredByNome: r.nome,
          triggeredByEmail: r.email,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          durationMs: finished.getTime() - started.getTime(),
          success: r.success,
          error: r.error,
          tables,
          totalRead: tables.reduce((s, t) => s + t.read, 0),
          totalWritten: tables.reduce((s, t) => s + t.written + (t.removed ?? 0), 0),
        };
      }),
    };
  }

  /**
   * `triggeredByIdUsers` = quem disparou pelo painel; null = agendamento.
   * Cada execução (sucesso ou falha) vira uma linha em sync_run_log; um
   * disparo enquanto outro roda é ignorado e não gera linha.
   */
  async run(onProgress?: (msg: string) => void, triggeredByIdUsers: number | null = null): Promise<SyncResult> {
    const log = (msg: string) => {
      this.logger.log(msg);
      onProgress?.(msg);
    };

    if (this.running) {
      const error = 'Sincronização já em andamento — disparo ignorado.';
      log(`[AVISO] ${error}`);
      return { success: false, tables: [], error };
    }

    const trigger: SyncRunTrigger = triggeredByIdUsers !== null ? 'manual' : 'automatico';
    const startedAt = new Date();
    log(
      trigger === 'manual'
        ? `Sincronização disparada manualmente (usuário #${triggeredByIdUsers})`
        : 'Sincronização disparada pelo agendamento',
    );

    const cfg = sourceConfig();
    if (!cfg) {
      const result: SyncResult = { success: false, tables: [], error: 'Variáveis SOURCE_DB_* não configuradas no .env' };
      log(`[ERRO] ${result.error}`);
      await this.saveRunLog(trigger, triggeredByIdUsers, startedAt, result);
      return result;
    }

    this.running = true;
    const { schema, ...clientCfg } = cfg;
    const source = new Client(clientCfg);
    // Sem este listener, um erro assíncrono da conexão (ex.: a origem derrubar a
    // sessão por timeout) vira 'Unhandled error event' e derruba a API inteira.
    source.on('error', (err) => log(`[AVISO] Conexão com a origem: ${err.message}`));
    let origemAberta = false;
    const tables: SyncTableResult[] = [];
    const errosParciais: string[] = [];

    try {
      log('Conectando ao banco do APAC Onco...');
      await source.connect();
      origemAberta = true;
      await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      log(`Conexão estabelecida (leitura em snapshot, schema ${schema}).`);

      // 2026-11-24: a origem derrubava a sessão com "idle-in-transaction timeout"
      // porque a transação de leitura ficava aberta (parada) enquanto o clone era
      // gravado tabela a tabela. Agora lê TUDO primeiro (mesmo snapshot), encerra
      // a conexão com a origem e só então grava — a origem nunca fica ociosa
      // dentro da transação.
      const lidas = new Map<string, Record<string, unknown>[]>();
      for (const tabela of TABELAS_ORIGEM) {
        const { rows } = await source.query<Record<string, unknown>>(`SELECT * FROM "${schema}"."${tabela.name}"`);
        lidas.set(tabela.name, rows);
        log(`${tabela.name}: ${rows.length} linha(s) lida(s) da origem`);
      }
      const { rows: usuariosOrigem } = await source.query<Record<string, string | null>>(
        `SELECT ${COLUNAS_USUARIO.join(', ')} FROM "${schema}"."tb_usuario" ORDER BY co_seq_usuario`,
      );
      log(`tb_usuario: ${usuariosOrigem.length} linha(s) lida(s) da origem`);
      await source.query('COMMIT');
      await source.end();
      origemAberta = false;
      log('Leitura da origem concluída — conexão encerrada. Gravando no OncoDash...');

      await this.dataSource.transaction(async (em) => {
        for (const tabela of TABELAS_ORIGEM) {
          tables.push(await this.syncTabela(em, lidas.get(tabela.name) ?? [], tabela, log));
        }
        // Usuários num SAVEPOINT: um problema só neles (ex.: login da origem igual ao de
        // uma conta criada no OncoDash) não impede os dados do painel de atualizarem.
        await em.query('SAVEPOINT sync_usuarios');
        try {
          tables.push(await this.syncUsuarios(em, usuariosOrigem, log));
          await em.query('RELEASE SAVEPOINT sync_usuarios');
        } catch (err) {
          await em.query('ROLLBACK TO SAVEPOINT sync_usuarios');
          const msg = `Usuários não sincronizados: ${err instanceof Error ? err.message : String(err)}`;
          log(`[ERRO] ${msg}`);
          errosParciais.push(msg);
        }
        await em.query(`
          INSERT INTO sync_run (id, updated_at) VALUES (true, now())
          ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
        `);
      });

      const lidos = tables.reduce((s, t) => s + t.read, 0);
      const gravados = tables.reduce((s, t) => s + t.written, 0);
      const removidos = tables.reduce((s, t) => s + (t.removed ?? 0), 0);
      log(`Sincronização concluída — ${lidos} lido(s), ${gravados} gravado(s), ${removidos} removido(s).`);
      if (errosParciais.length > 0) log('[AVISO] Os dados do painel foram atualizados, mas houve erro acima.');
      const result: SyncResult = errosParciais.length
        ? { success: false, tables, error: errosParciais.join('\n') }
        : { success: true, tables };
      await this.saveRunLog(trigger, triggeredByIdUsers, startedAt, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[ERRO] ${message}`);
      log('Nada foi gravado nesta execução (a transação foi desfeita).');
      const result: SyncResult = { success: false, tables, error: message };
      await this.saveRunLog(trigger, triggeredByIdUsers, startedAt, result);
      return result;
    } finally {
      this.running = false;
      if (origemAberta) {
        await source.query('ROLLBACK').catch(() => null);
        await source.end().catch(() => null);
      }
    }
  }

  // ── Tabelas de dados ──────────────────────────────────────────────────

  private async syncTabela(
    em: EntityManager,
    rows: Record<string, unknown>[],
    t: TabelaOrigem,
    log: (msg: string) => void,
  ): Promise<SyncTableResult> {
    const destino = await this.colunasDestino(em, t.name);

    if (rows.length === 0) {
      const [{ n }] = (await em.query(`SELECT COUNT(*)::int AS n FROM "${SCHEMA_CLONE}"."${t.name}"`)) as Array<{
        n: number;
      }>;
      if (n > 0) {
        log(`[AVISO] ${t.name}: a origem veio vazia mas o clone tem ${n} linha(s) — mantidas (possível erro de leitura).`);
      } else {
        log(`${t.name}: vazia`);
      }
      return { name: t.name, read: 0, written: 0, removed: 0 };
    }

    let linhas = t.derivar ? rows.map(t.derivar) : rows;
    if (t.cpfColumns) linhas = await this.cifrarCpfs(em, t, linhas);

    // Só as colunas que o clone tem; avisa das desconhecidas (fora as omitidas de propósito).
    const omitidas = new Set(t.omitir ?? []);
    const desconhecidas = Object.keys(linhas[0]).filter((c) => !destino.has(c) && !omitidas.has(c));
    if (desconhecidas.length > 0) {
      log(`[AVISO] ${t.name}: coluna(s) da origem que o clone não conhece, ignoradas: ${desconhecidas.join(', ')}`);
    }
    const colunas = Object.keys(linhas[0]).filter((c) => destino.has(c));
    linhas = linhas.map((row) => Object.fromEntries(colunas.map((c) => [c, row[c] ?? null])));

    let written = 0;
    for (const lote of chunkRows(linhas, colunas.length)) {
      const { text, values } = buildUpsertSkipUnchanged(SCHEMA_CLONE, t.name, t.pk, lote);
      written += linhasRetornadas(await em.query(text, values)).length;
    }

    // O que sumiu da origem sai do clone.
    const pks = linhas.map((r) => String(r[t.pk]));
    const removidas = linhasRetornadas(
      await em.query(
        `DELETE FROM "${SCHEMA_CLONE}"."${t.name}" WHERE NOT ("${t.pk}" = ANY($1::bigint[])) RETURNING "${t.pk}"`,
        [pks],
      ),
    );

    log(`${t.name}: ${rows.length} lido(s), ${written} gravado(s)${removidas.length ? `, ${removidas.length} removido(s)` : ''}`);
    return { name: t.name, read: rows.length, written, removed: removidas.length };
  }

  private async colunasDestino(em: EntityManager, tabela: string): Promise<Set<string>> {
    const rows: Array<{ column_name: string }> = await em.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [SCHEMA_CLONE, tabela],
    );
    if (rows.length === 0) throw new Error(`Tabela ${SCHEMA_CLONE}.${tabela} não existe — rode npm run migration:run.`);
    return new Set(rows.map((r) => r.column_name));
  }

  /** Cifra os CPFs, reaproveitando o valor já cifrado quando o CPF não mudou. */
  private async cifrarCpfs(
    em: EntityManager,
    t: TabelaOrigem,
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const cols = t.cpfColumns!;
    const existentes: Array<Record<string, unknown>> = await em.query(
      `SELECT "${t.pk}"::text AS pk, ${cols.map((c) => `"${c}"`).join(', ')}
       FROM "${SCHEMA_CLONE}"."${t.name}" WHERE "${t.pk}" = ANY($1::bigint[])`,
      [rows.map((r) => String(r[t.pk]))],
    );
    const porPk = new Map(existentes.map((r) => [r.pk as string, r]));

    return rows.map((row) => {
      const copia = { ...row };
      const atual = porPk.get(String(row[t.pk]));
      for (const col of cols) {
        const texto = typeof copia[col] === 'string' ? (copia[col] as string).trim() : '';
        if (!texto) {
          copia[col] = copia[col] === null || copia[col] === undefined ? null : '';
          continue;
        }
        const cifrado = atual?.[col];
        if (typeof cifrado === 'string' && cifrado) {
          try {
            if (decryptCpf(cifrado) === texto) {
              copia[col] = cifrado;
              continue;
            }
          } catch {
            // valor antigo não decifra (chave trocada) — cifra de novo
          }
        }
        copia[col] = encryptCpf(texto);
      }
      return copia;
    });
  }

  // ── Usuários ──────────────────────────────────────────────────────────

  /**
   * tb_usuario → users + users_info (mesmas regras do seed:usuarios, modo
   * "sincronizar"): contas novas entram, as importadas acompanham a origem
   * (inclusive desativação/exclusão), a senha trocada no OncoDash e o
   * e-mail informado aqui (quando a origem não tem) são preservados.
   */
  private async syncUsuarios(
    em: EntityManager,
    rows: Record<string, string | null>[],
    log: (msg: string) => void,
  ): Promise<SyncTableResult> {
    if (rows.length === 0) {
      log('[AVISO] tb_usuario: a origem veio vazia — usuários mantidos como estão.');
      return { name: 'tb_usuario', read: 0, written: 0 };
    }
    const linhas = validarLinhas(
      rows.map((r) => COLUNAS_USUARIO.map((c) => r[c] ?? null)),
      'A tb_usuario da origem',
      1,
    );
    const resumo = await importarUsuarios(em, linhas, 'sincronizar');
    for (const m of resumo.movidos) {
      log(`  Conta do OncoDash "${m.nome}" mudou de id ${m.de} para ${m.para} (o id ${m.de} é da tb_usuario).`);
    }
    log(`tb_usuario: ${resumo.lidos} lido(s), ${resumo.inseridos} conta(s) nova(s), ${resumo.atualizados} atualizada(s)`);
    return { name: 'tb_usuario', read: resumo.lidos, written: resumo.inseridos + resumo.atualizados };
  }

  private async saveRunLog(
    trigger: SyncRunTrigger,
    triggeredByIdUsers: number | null,
    startedAt: Date,
    result: SyncResult,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO sync_run_log (triggered_by_id_users, trigger, started_at, finished_at, success, error, tables)
         VALUES ($1, $2, $3, now(), $4, $5, $6)`,
        [triggeredByIdUsers, trigger, startedAt, result.success, result.error ?? null, JSON.stringify(result.tables)],
      );
    } catch (err) {
      this.logger.error(`Falha ao gravar o log da sincronização: ${String(err)}`);
    }
  }
}
