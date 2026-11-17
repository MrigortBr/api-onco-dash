/**
 * Perfis do OncoDash e a regra de hierarquia (ver "OncoDash · Lógica de login
 * e registro", seção Perfis). Mesma ideia do `profile-rank.ts` do SIMDASH,
 * com os 7 níveis territoriais: quanto maior o nível, mais restrito o recorte.
 */
export enum UserProfile {
  DESENVOLVEDOR = 'Desenvolvedor',
  GESTOR_FEDERAL = 'Gestor federal',
  GESTOR_ESTADUAL = 'Gestor estadual',
  GESTOR_MACRORREGIAO = 'Gestor de macrorregião',
  GESTOR_REGIAO_SAUDE = 'Gestor de região de saúde',
  GESTOR_MUNICIPAL = 'Gestor municipal',
  UNIDADE = 'Unidade',
}

/** Níveis do recorte territorial, do mais amplo ao mais restrito. */
export type ScopeLevel = 'uf' | 'macrorregiao' | 'regiaoSaude' | 'municipio' | 'cnes';

export const SCOPE_LEVELS: readonly ScopeLevel[] = ['uf', 'macrorregiao', 'regiaoSaude', 'municipio', 'cnes'];

export const PROFILE_RANK: Record<UserProfile, number> = {
  [UserProfile.DESENVOLVEDOR]: 0,
  [UserProfile.GESTOR_FEDERAL]: 1,
  [UserProfile.GESTOR_ESTADUAL]: 2,
  [UserProfile.GESTOR_MACRORREGIAO]: 3,
  [UserProfile.GESTOR_REGIAO_SAUDE]: 4,
  [UserProfile.GESTOR_MUNICIPAL]: 5,
  [UserProfile.UNIDADE]: 6,
};

/** Nível de escopo que cada perfil restrito precisa ter preenchido. */
export const PROFILE_SCOPE_LEVEL: Record<UserProfile, ScopeLevel | null> = {
  [UserProfile.DESENVOLVEDOR]: null,
  [UserProfile.GESTOR_FEDERAL]: null,
  [UserProfile.GESTOR_ESTADUAL]: 'uf',
  [UserProfile.GESTOR_MACRORREGIAO]: 'macrorregiao',
  [UserProfile.GESTOR_REGIAO_SAUDE]: 'regiaoSaude',
  [UserProfile.GESTOR_MUNICIPAL]: 'municipio',
  [UserProfile.UNIDADE]: 'cnes',
};

/** Perfis que veem o Brasil inteiro (sem recorte). */
export function isNationalProfile(profile: UserProfile): boolean {
  return PROFILE_SCOPE_LEVEL[profile] === null;
}

/** Perfis com acesso às telas de auditoria e à edição de qualquer usuário. */
export const ADMIN_PROFILES: UserProfile[] = [UserProfile.DESENVOLVEDOR, UserProfile.GESTOR_FEDERAL];

/** Perfis que podem convidar alguém (se também tiverem `can_add`). */
export const INVITER_PROFILES: UserProfile[] = Object.values(UserProfile).filter(
  (p) => p !== UserProfile.UNIDADE,
);

/**
 * Só se convida perfil de nível maior que o próprio. O Desenvolvedor é a
 * única exceção: pode convidar outro Desenvolvedor (igual ao SIMDASH).
 */
export function canInvite(requester: UserProfile, target: UserProfile): boolean {
  if (requester === UserProfile.DESENVOLVEDOR && target === UserProfile.DESENVOLVEDOR) return true;
  return PROFILE_RANK[target] > PROFILE_RANK[requester];
}

export function invitableProfilesFor(profile: UserProfile): UserProfile[] {
  return Object.values(UserProfile).filter((candidate) => canInvite(profile, candidate));
}

/** Índice do nível dentro de SCOPE_LEVELS (0 = UF ... 4 = CNES). */
export function scopeLevelIndex(level: ScopeLevel): number {
  return SCOPE_LEVELS.indexOf(level);
}
