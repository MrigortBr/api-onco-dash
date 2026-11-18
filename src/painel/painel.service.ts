import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ScopeLevel } from '../auth/profiles.js';
import type { DataScope } from '../scope/data-scope.js';
import { normalizarFinalidade, normalizarLinha } from './normalizar.js';
import { COLUNAS_PAINEL, SQL_PAINEL } from './painel.sql.js';

/**
 * Condição de cada nível do recorte. Macro, região e município vêm do
 * território do CNES (schema `territorio`): uma solicitação cujo CNES não
 * está carregado lá não aparece para esses perfis (falha fechada).
 * Município: compara os 6 primeiros dígitos do IBGE (com ou sem o verificador).
 */
const COLUNA_ESCOPO: Record<ScopeLevel, { coluna: string; valor?: (codigo: string) => string }> = {
  uf: { coluna: 's.sg_uf_estabelecimento' },
  macrorregiao: { coluna: 'est.co_macro' },
  regiaoSaude: { coluna: 'est.co_regiao_saude' },
  municipio: { coluna: 'left(est.co_ibge, 6)', valor: (c) => c.replace(/\D/g, '').slice(0, 6) },
  cnes: { coluna: 's.co_cnes' },
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
    const chave = `${atualizadoEm}|${await this.ultimaCargaTerritorio()}|${JSON.stringify(escopo)}`;
    const emCache = this.cache.get(chave);
    if (emCache) return emCache;

    let condicao = 'TRUE';
    const params: string[] = [];
    if (escopo.tipo === 'nada') condicao = 'FALSE';
    if (escopo.tipo === 'filtro') {
      const regra = COLUNA_ESCOPO[escopo.nivel];
      if (regra) {
        params.push(regra.valor ? regra.valor(escopo.codigo) : escopo.codigo);
        condicao = `${regra.coluna} = $1`;
      } else {
        condicao = 'FALSE';
      }
    }

    const rows: Array<Record<string, unknown>> = await this.dataSource.query(SQL_PAINEL.replace(':escopo', condicao), params);
    const linhas = rows.map((r) =>
      COLUNAS_PAINEL.map((c) => {
        const v = r[c];
        // numeric chega como string do driver; o painel espera número.
        if (typeof v === 'string' && (c === 'dias_ate_parecer' || c === 'dias_aguardando')) return Number(v);
        // Texto livre com grafias diferentes para o mesmo valor (ver normalizar.ts).
        if (c === 'linha_tratamento') return normalizarLinha(v);
        if (c === 'finalidade') return normalizarFinalidade(v);
        return v;
      }),
    );
    const dados: PainelDados = { colunas: COLUNAS_PAINEL, linhas, atualizadoEm };

    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(chave, dados);
    return dados;
  }

  /** Muda quando o território é recarregado — entra na chave do cache. */
  private async ultimaCargaTerritorio(): Promise<string> {
    try {
      const rows: Array<{ id: number | null }> = await this.dataSource.query('SELECT max(id) AS id FROM territorio.carga');
      return String(rows[0]?.id ?? 0);
    } catch {
      return '0';
    }
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
