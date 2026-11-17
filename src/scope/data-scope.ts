import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PROFILE_SCOPE_LEVEL, type ScopeLevel, UserProfile } from '../auth/profiles.js';

/**
 * Recorte de dados de uma aba restrita para o usuário que pediu:
 *  - `brasil`: sem filtro (Desenvolvedor e Gestor federal);
 *  - `filtro`: só as linhas cujo `nivel` é igual a `codigo`;
 *  - `nada`: perfil restrito sem escopo válido, ou sem perfil — nunca o Brasil
 *    inteiro (mesma defesa do sentinela SEM-UF do SIMDASH).
 */
export type DataScope =
  | { tipo: 'brasil' }
  | { tipo: 'filtro'; nivel: ScopeLevel; codigo: string }
  | { tipo: 'nada' };

export function resolveDataScope(user: Pick<AuthenticatedUser, 'profile' | 'scope'> | null | undefined): DataScope {
  if (!user?.profile) return { tipo: 'nada' };
  const nivel = PROFILE_SCOPE_LEVEL[user.profile];
  if (nivel === null) return { tipo: 'brasil' };
  const codigo = user.scope[nivel]?.codigo;
  return codigo ? { tipo: 'filtro', nivel, codigo } : { tipo: 'nada' };
}

/** Coluna que guarda cada nível na consulta da aba (ex.: { uf: 'sol.uf_servico', cnes: 'sol.cnes' }). */
export type ScopeColumns = Partial<Record<ScopeLevel, string>>;

/**
 * Condição SQL do recorte, pronta para `qb.andWhere(sql, params)`. Se a aba
 * não informar a coluna do nível do usuário, devolve "nada" (falha fechada).
 */
export function scopeWhere(scope: DataScope, columns: ScopeColumns): { sql: string; params: Record<string, string> } | null {
  if (scope.tipo === 'brasil') return null;
  if (scope.tipo === 'nada') return { sql: '1 = 0', params: {} };
  const column = columns[scope.nivel];
  if (!column) return { sql: '1 = 0', params: {} };
  return { sql: `${column} = :escopoCodigo`, params: { escopoCodigo: scope.codigo } };
}

/** O código do paciente só aparece para o perfil Unidade, e só dentro de abas restritas. */
export function canSeePatientCode(user: Pick<AuthenticatedUser, 'profile'> | null | undefined, restrictedTab: boolean): boolean {
  return restrictedTab && user?.profile === UserProfile.UNIDADE;
}
