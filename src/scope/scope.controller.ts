import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { describeScope } from '../auth/scope.js';
import { canSeePatientCode, type DataScope } from './data-scope.js';
import { Escopo, Restrita } from './restrita.decorator.js';

/**
 * Recorte aplicado ao usuário nas abas restritas. O front usa para mostrar o
 * aviso "Visão de ..." no topo dessas abas; serve também de exemplo de rota
 * com @Restrita() para as abas de dados que virão.
 */
@Controller('painel')
export class ScopeController {
  @Restrita()
  @Get('escopo')
  escopo(@CurrentUser() user: AuthenticatedUser, @Escopo() escopo: DataScope) {
    return {
      escopo,
      descricao: escopo.tipo === 'brasil' ? 'Brasil' : escopo.tipo === 'nada' ? null : describeScope(user.scope),
      podeVerCodigoPaciente: canSeePatientCode(user, true),
    };
  }
}
