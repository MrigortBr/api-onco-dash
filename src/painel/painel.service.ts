import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ScopeLevel } from '../auth/profiles.js';
import type { DataScope } from '../scope/data-scope.js';
import { COLUNAS_PAINEL, SQL_PAINEL } from './painel.sql.js';

/**
 * Coluna do clone que guarda cada nível do recorte. Os níveis sem coluna
 * (macrorregião, região de saúde, município do serviço) ainda não existem
 * no banco do APAC Onco: quem tem esses perfis recebe "nada" (falha fechada)
 * até as tabelas de território serem incorporadas.
 */
const COLUNA_ESCOPO: Partial<Record<ScopeLevel, string>> = {
  uf: 's.sg_uf_estabelecimento',
  cnes: 's.co_cnes',
};

export interface PainelDados {
  colunas: readonly string[];
  linhas: unknown[][];
  /** Última atualização com o APAC Onco (null = nunca sincronizado). */
  atualizadoEm: string | null;
}

/** Cache simples: a resposta só muda quando uma atualização (sync) termina. */
const CACHE_MAX = 50;

@Injectable()
export class PainelService {
  private readonly cache = new Map<string, PainelDados>();

  constructor(private readonly dataSource: DataSource) {}

  async solicitacoes(escopo: DataScope): Promise<PainelDados> {
    const atualizadoEm = await this.ultimaAtualizacao();
    const chave = `${atualizadoEm}|${JSON.stringify(escopo)}`;
    const emCache = this.cache.get(chave);
    if (emCache) return emCache;

    let condicao = 'TRUE';
    const params: string[] = [];
    if (escopo.tipo === 'nada') condicao = 'FALSE';
    if (escopo.tipo === 'filtro') {
      const coluna = COLUNA_ESCOPO[escopo.nivel];
      if (coluna) {
        params.push(escopo.codigo);
        condicao = `${coluna} = $1`;
      } else {
        condicao = 'FALSE';
      }
    }

    const rows: Array<Record<string, unknown>> = await this.dataSource.query(SQL_PAINEL.replace(':escopo', condicao), params);
    const linhas = rows.map((r) =>
      COLUNAS_PAINEL.map((c) => {
        const v = r[c];
        // numeric chega como string do driver; o painel espera número.
        return typeof v === 'string' && (c === 'dias_ate_parecer' || c === 'dias_aguardando') ? Number(v) : v;
      }),
    );
    const dados: PainelDados = { colunas: COLUNAS_PAINEL, linhas, atualizadoEm };

    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(chave, dados);
    return dados;
  }

  private async ultimaAtualizacao(): Promise<string | null> {
    try {
      const rows: Array<{ updated_at: Date }> = await this.dataSource.query('SELECT updated_at FROM sync_run LIMIT 1');
      return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
    } catch {
      return null;
    }
  }
}
