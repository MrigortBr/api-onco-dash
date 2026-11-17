import { SetMetadata } from '@nestjs/common';
import type { UserProfile } from '../profiles.js';

export const ROLES_KEY = 'roles';

/** Restringe a rota a estes perfis (usar junto com JwtAuthGuard e RolesGuard). */
export const Roles = (...roles: UserProfile[]) => SetMetadata(ROLES_KEY, roles);
