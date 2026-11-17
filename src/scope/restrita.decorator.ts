import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { DataScope } from './data-scope.js';
import { RestritaGuard } from './restrita.guard.js';

export const RESTRITA_KEY = 'oncodash:restrita';

/**
 * Marca a rota de uma aba restrita: exige login e calcula o recorte do
 * usuário (`@Escopo() escopo: DataScope`). Rotas sem esta marca devolvem o
 * Brasil inteiro. Restringir uma aba nova = acrescentar `@Restrita()`.
 */
export const Restrita = () => applyDecorators(SetMetadata(RESTRITA_KEY, true), UseGuards(JwtAuthGuard, RestritaGuard));

/** Recorte calculado pelo RestritaGuard. */
export const Escopo = createParamDecorator((_data: unknown, ctx: ExecutionContext): DataScope => {
  return ctx.switchToHttp().getRequest<{ dataScope?: DataScope }>().dataScope ?? { tipo: 'nada' };
});
