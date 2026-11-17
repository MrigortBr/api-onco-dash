import { UserProfile as P } from '../auth/profiles.js';
import { EMPTY_SCOPE } from '../auth/scope.js';
import { canSeePatientCode, resolveDataScope, scopeWhere } from './data-scope.js';

describe('recorte das abas restritas', () => {
  it('nacional vê o Brasil inteiro', () => {
    const s = resolveDataScope({ profile: P.GESTOR_FEDERAL, scope: EMPTY_SCOPE });
    expect(s).toEqual({ tipo: 'brasil' });
    expect(scopeWhere(s, { uf: 'sol.uf' })).toBeNull();
  });

  it('gestor municipal filtra pelo município', () => {
    const s = resolveDataScope({
      profile: P.GESTOR_MUNICIPAL,
      scope: { ...EMPTY_SCOPE, uf: { codigo: 'PE', nome: null }, municipio: { codigo: '2611606', nome: 'Recife' } },
    });
    expect(s).toEqual({ tipo: 'filtro', nivel: 'municipio', codigo: '2611606' });
    expect(scopeWhere(s, { uf: 'sol.uf', municipio: 'sol.mun_servico' })).toEqual({
      sql: 'sol.mun_servico = :escopoCodigo',
      params: { escopoCodigo: '2611606' },
    });
  });

  it('falha fechada: sem escopo, sem perfil ou sem coluna = nada', () => {
    expect(resolveDataScope({ profile: P.UNIDADE, scope: EMPTY_SCOPE })).toEqual({ tipo: 'nada' });
    expect(resolveDataScope(null)).toEqual({ tipo: 'nada' });
    const s = resolveDataScope({ profile: P.UNIDADE, scope: { ...EMPTY_SCOPE, cnes: { codigo: '0000434', nome: null } } });
    expect(scopeWhere(s, { uf: 'sol.uf' })?.sql).toBe('1 = 0');
  });

  it('código do paciente só para Unidade em aba restrita', () => {
    expect(canSeePatientCode({ profile: P.UNIDADE }, true)).toBe(true);
    expect(canSeePatientCode({ profile: P.UNIDADE }, false)).toBe(false);
    expect(canSeePatientCode({ profile: P.DESENVOLVEDOR }, true)).toBe(false);
  });
});
