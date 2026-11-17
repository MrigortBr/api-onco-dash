import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { type DataScope, resolveDataScope } from './data-scope.js';

/** Coloca em `req.dataScope` o recorte do usuário (ver data-scope.ts). */
@Injectable()
export class RestritaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; dataScope?: DataScope }>();
    req.dataScope = resolveDataScope(req.user);
    return true;
  }
}
