import type { UserProfile } from './profiles.js';
import type { UserScope } from './scope.js';

/** Conteúdo assinado no JWT: só identificadores. Perfil e escopo são lidos do banco a cada requisição. */
export interface JwtPayload {
  sub: number;
  sid: number;
}

/**
 * Usuário já validado (sessão ativa + mesmo dispositivo) que a estratégia JWT
 * coloca em `req.user`. Perfil e escopo vêm do banco, então uma mudança de
 * permissão vale na próxima requisição, sem esperar novo login.
 */
export interface AuthenticatedUser {
  id: number;
  sid: number;
  login: string | null;
  email: string | null;
  nome: string;
  profile: UserProfile | null;
  canAdd: boolean;
  canEdit: boolean;
  scope: UserScope;
}
