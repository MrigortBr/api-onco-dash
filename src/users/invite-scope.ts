import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PROFILE_SCOPE_LEVEL, SCOPE_LEVELS, type ScopeLevel, scopeLevelIndex, type UserProfile } from '../auth/profiles.js';
import { EMPTY_SCOPE, type ScopeItem, type UserScope } from '../auth/scope.js';
import type { ScopeInputDto } from './dto/scope-input.dto.js';

const LEVEL_LABEL: Record<ScopeLevel, string> = {
  uf: 'a UF',
  macrorregiao: 'a macrorregião de saúde',
  regiaoSaude: 'a região de saúde',
  municipio: 'o município',
  cnes: 'o CNES da unidade',
};

/** Converte o DTO plano no formato nível → { codigo, nome }. */
export function scopeFromInput(input: ScopeInputDto | undefined): UserScope {
  const pick = (codigo?: string, nome?: string): ScopeItem | null => (codigo ? { codigo, nome: nome ?? null } : null);
  return {
    uf: pick(input?.ufCodigo, input?.ufNome),
    macrorregiao: pick(input?.macrorregiaoCodigo, input?.macrorregiaoNome),
    regiaoSaude: pick(input?.regiaoSaudeCodigo, input?.regiaoSaudeNome),
    municipio: pick(input?.municipioCodigo, input?.municipioNome),
    cnes: pick(input?.cnesCodigo, input?.cnesNome),
  };
}

/**
 * Escopo final de um usuário novo (ou editado) com o perfil `targetProfile`:
 *  - perfis nacionais não têm escopo;
 *  - só ficam os níveis até o nível do perfil (um Gestor estadual guarda só a UF);
 *  - o nível do próprio perfil é obrigatório;
 *  - se quem convida é restrito, os níveis dele (do mais amplo até o seu) são
 *    copiados por cima do que veio no formulário: o convidado fica sempre
 *    dentro do escopo de quem convidou.
 */
export function resolveInviteScope(
  requester: { profile: UserProfile; scope: UserScope },
  targetProfile: UserProfile,
  input: ScopeInputDto | undefined,
): UserScope {
  const targetLevel = PROFILE_SCOPE_LEVEL[targetProfile];
  if (targetLevel === null) return { ...EMPTY_SCOPE };

  const fromInput = scopeFromInput(input);
  const targetIdx = scopeLevelIndex(targetLevel);
  const result: UserScope = { ...EMPTY_SCOPE };
  for (const level of SCOPE_LEVELS) {
    if (scopeLevelIndex(level) <= targetIdx) result[level] = fromInput[level];
  }

  const requesterLevel = PROFILE_SCOPE_LEVEL[requester.profile];
  if (requesterLevel !== null) {
    if (!requester.scope[requesterLevel]) {
      throw new ForbiddenException('Seu usuário está sem escopo definido; não é possível convidar.');
    }
    const requesterIdx = scopeLevelIndex(requesterLevel);
    for (const level of SCOPE_LEVELS) {
      if (scopeLevelIndex(level) <= requesterIdx) result[level] = requester.scope[level];
    }
  }

  if (!result[targetLevel]) {
    throw new BadRequestException(`Informe ${LEVEL_LABEL[targetLevel]} para este perfil.`);
  }
  return result;
}

/** O usuário-alvo está dentro do escopo de quem pede? (nacional enxerga todos) */
export function isWithinScope(
  requester: { profile: UserProfile; scope: UserScope },
  targetScope: UserScope,
): boolean {
  const level = PROFILE_SCOPE_LEVEL[requester.profile];
  if (level === null) return true;
  const code = requester.scope[level]?.codigo;
  return !!code && targetScope[level]?.codigo === code;
}
