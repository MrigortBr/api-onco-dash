import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { describeScope } from '../auth/scope.js';
import { canSeePatientCode, type DataScope } from '../scope/data-scope.js';
import { Escopo, Restrita } from '../scope/restrita.decorator.js';
import { PainelService } from './painel.service.js';

/** Perfil do painel (nomes usados pelo protótipo). */
const PERFIL_PAINEL: Record<string, string> = {
  uf: 'estadual',
  macrorregiao: 'macro',
  regiaoSaude: 'regional',
  municipio: 'municipal',
  cnes: 'local',
};

@Controller('painel')
export class PainelController {
  constructor(private readonly painel: PainelService) {}

  /**
   * Dados do painel, já no recorte do usuário (todas as abas seguem o
   * recorte, como no protótipo: "cada perfil só vê o próprio escopo").
   */
  @Restrita()
  @Get('solicitacoes')
  async solicitacoes(@CurrentUser() user: AuthenticatedUser, @Escopo() escopo: DataScope) {
    const dados = await this.painel.solicitacoes(escopo);
    const nivel = escopo.tipo === 'filtro' ? escopo.nivel : null;
    return {
      ...dados,
      perfil: {
        painel: escopo.tipo === 'brasil' ? 'federal' : nivel ? PERFIL_PAINEL[nivel] : 'nenhum',
        // Valor que o painel compara com a coluna da linha: código para UF e CNES, nome para os demais.
        escopo:
          escopo.tipo === 'filtro'
            ? nivel === 'uf' || nivel === 'cnes'
              ? escopo.codigo
              : (user.scope[nivel!]?.nome ?? escopo.codigo)
            : '',
        descricao: escopo.tipo === 'brasil' ? 'Brasil' : describeScope(user.scope),
        podeVerCodigoPaciente: canSeePatientCode(user, true),
      },
    };
  }
}
