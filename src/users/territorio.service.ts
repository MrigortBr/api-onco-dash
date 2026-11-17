import { Injectable } from '@nestjs/common';

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

/**
 * Opções de UF, macrorregião, região de saúde, município e CNES para o
 * formulário de convite. Decisão de 13/11/2026: sem tabelas próprias de
 * território — as listas devem sair dos próprios dados do painel.
 *
 * Enquanto a base de solicitações ainda não está ligada, devolve listas
 * vazias e o formulário aceita código + nome digitados. Quando a base
 * existir, basta preencher este método com SELECT DISTINCT sobre ela.
 */
@Injectable()
export class TerritorioService {
  async opcoes(): Promise<TerritorioOpcoes> {
    return { ufs: [], macrorregioes: [], regioesSaude: [], municipios: [], estabelecimentos: [] };
  }
}
