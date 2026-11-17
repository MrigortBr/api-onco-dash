import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../authenticated-user.js';

/** Usuário autenticado da requisição (colocado pela JwtStrategy). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
});
