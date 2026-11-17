import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../authenticated-user.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { UserProfile } from '../profiles.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserProfile[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const profile = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user?.profile;
    if (!profile || !required.includes(profile)) {
      throw new ForbiddenException('Seu perfil não tem acesso a esta área.');
    }
    return true;
  }
}
