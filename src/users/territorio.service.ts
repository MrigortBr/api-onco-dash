import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TerritorioOpcao {
  codigo: string;
  nome: string;
  /** Código do nível de cima (UF de uma macro, macro de uma região, ...). */
  pai?: string;
}

export interface TerritorioOpcoes {
  ufs: TerritorioOpcao[];
  macrorregioes: TerritorioOpcao[];
  regioesSaude: TerritorioOpcao[];
  municipios: TerritorioOpcao[];
  estabelecimentos: TerritorioOpcao[];
}

const UFS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/**
 * Opções de UF, macrorregião, região de saúde, município e CNES para o
 * formulário de convite. Decisão de 13/11/2026: as listas saem dos próprios
 * dados do painel — os serviços que aparecem nas solicitações, com o
 * território carregado do CNES (schema `territorio`). `pai` é sempre a UF,
 * para o formulário filtrar pela UF escolhida.
 *
 * Sem território carregado (ou sem solicitações), as listas de macro/região/
 * município ficam vazias e o formulário aceita código + nome digitados.
 */
@Injectable()
export class TerritorioService {
  private readonly logger = new Logger(TerritorioService.name);

  constructor(private readonly dataSource: DataSource) {}

  async opcoes(): Promise<TerritorioOpcoes> {
    const ufs = Object.entries(UFS).map(([codigo, nome]) => ({ codigo, nome }));
    try {
      const rows: Array<{ nivel: string; codigo: string; nome: string | null; pai: string }> = await this.dataSource.query(`
        WITH srv AS (
          SELECT DISTINCT e.*
          FROM (SELECT DISTINCT lpad(co_cnes, 7, '0') AS cnes FROM apac.tb_solicitacao_apac WHERE dt_exclusao IS NULL) s
          JOIN territorio.estabelecimento e ON e.co_cnes = s.cnes
        )
        SELECT DISTINCT 'macro' AS nivel, co_macro AS codigo, no_macro AS nome, sg_uf AS pai FROM srv WHERE co_macro IS NOT NULL
        UNION SELECT DISTINCT 'regiao', co_regiao_saude, no_regiao_saude, sg_uf FROM srv WHERE co_regiao_saude IS NOT NULL
        UNION SELECT DISTINCT 'municipio', co_ibge, no_municipio, sg_uf FROM srv WHERE co_ibge IS NOT NULL
        UNION SELECT DISTINCT 'cnes', co_cnes, no_estabelecimento, sg_uf FROM srv
        ORDER BY 1, 3`);
      const de = (nivel: string): TerritorioOpcao[] =>
        rows.filter((r) => r.nivel === nivel).map((r) => ({ codigo: r.codigo, nome: r.nome ?? r.codigo, pai: r.pai }));
      return {
        ufs,
        macrorregioes: de('macro'),
        regioesSaude: de('regiao'),
        municipios: de('municipio'),
        estabelecimentos: de('cnes'),
      };
    } catch (err) {
      // Território ainda não migrado/carregado: o formulário segue aceitando código digitado.
      this.logger.warn(`Opções de território indisponíveis: ${err instanceof Error ? err.message : String(err)}`);
      return { ufs, macrorregioes: [], regioesSaude: [], municipios: [], estabelecimentos: [] };
    }
  }
}
