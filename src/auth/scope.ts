import type { UserInfo } from '../database/entities/user-info.entity.js';
import type { ScopeLevel } from './profiles.js';

export interface ScopeItem {
  codigo: string;
  nome: string | null;
}

/** Escopo territorial do usuário, nível a nível (nulo = não preenchido). */
export type UserScope = Record<ScopeLevel, ScopeItem | null>;

const item = (codigo: string | null, nome: string | null): ScopeItem | null =>
  codigo ? { codigo, nome } : null;

/** Escopo gravado em users_info (sem info carregada = escopo vazio). */
export function scopeOf(user: UserInfo | null | undefined): UserScope {
  if (!user) return { ...EMPTY_SCOPE };
  return {
    uf: item(user.scopeUf, user.scopeUfNome),
    macrorregiao: item(user.scopeMacrorregiaoCod, user.scopeMacrorregiaoNome),
    regiaoSaude: item(user.scopeRegiaoSaudeCod, user.scopeRegiaoSaudeNome),
    municipio: item(user.scopeMunicipioCod, user.scopeMunicipioNome),
    cnes: item(user.scopeCnes, user.scopeCnesNome),
  };
}

/** Grava um escopo em users_info (todos os níveis, inclusive os nulos). */
export function applyScope(user: UserInfo, scope: UserScope): void {
  user.scopeUf = scope.uf?.codigo ?? null;
  user.scopeUfNome = scope.uf?.nome ?? null;
  user.scopeMacrorregiaoCod = scope.macrorregiao?.codigo ?? null;
  user.scopeMacrorregiaoNome = scope.macrorregiao?.nome ?? null;
  user.scopeRegiaoSaudeCod = scope.regiaoSaude?.codigo ?? null;
  user.scopeRegiaoSaudeNome = scope.regiaoSaude?.nome ?? null;
  user.scopeMunicipioCod = scope.municipio?.codigo ?? null;
  user.scopeMunicipioNome = scope.municipio?.nome ?? null;
  user.scopeCnes = scope.cnes?.codigo ?? null;
  user.scopeCnesNome = scope.cnes?.nome ?? null;
}

export const EMPTY_SCOPE: UserScope = { uf: null, macrorregiao: null, regiaoSaude: null, municipio: null, cnes: null };

/** Texto curto do recorte, para e-mail e telas ("Recife (PE)", "UF PE"...). */
export function describeScope(scope: UserScope): string | null {
  const nome = (i: ScopeItem | null) => i?.nome ?? i?.codigo ?? null;
  const uf = scope.uf?.codigo ?? null;
  const withUf = (t: string | null) => (t && uf ? `${t} (${uf})` : t);
  if (scope.cnes) return withUf(`CNES ${scope.cnes.codigo}${scope.cnes.nome ? ` · ${scope.cnes.nome}` : ''}`);
  if (scope.municipio) return withUf(nome(scope.municipio));
  if (scope.regiaoSaude) return withUf(`Região de saúde ${nome(scope.regiaoSaude)}`);
  if (scope.macrorregiao) return withUf(`Macrorregião ${nome(scope.macrorregiao)}`);
  if (scope.uf) return scope.uf.nome ?? `UF ${scope.uf.codigo}`;
  return null;
}
