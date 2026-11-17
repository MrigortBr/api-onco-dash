import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserProfile as P } from '../auth/profiles.js';
import { EMPTY_SCOPE, type UserScope } from '../auth/scope.js';
import { isWithinScope, resolveInviteScope } from './invite-scope.js';

const federal = { profile: P.GESTOR_FEDERAL, scope: EMPTY_SCOPE };
const estadualPE = { profile: P.GESTOR_ESTADUAL, scope: { ...EMPTY_SCOPE, uf: { codigo: 'PE', nome: 'Pernambuco' } } };

describe('resolveInviteScope', () => {
  it('perfil nacional não guarda escopo', () => {
    expect(resolveInviteScope(federal, P.GESTOR_FEDERAL, { ufCodigo: 'SP' })).toEqual(EMPTY_SCOPE);
  });

  it('exige o nível do perfil convidado', () => {
    expect(() => resolveInviteScope(federal, P.GESTOR_MUNICIPAL, { ufCodigo: 'PE' })).toThrow(BadRequestException);
  });

  it('descarta níveis abaixo do perfil', () => {
    const s = resolveInviteScope(federal, P.GESTOR_ESTADUAL, { ufCodigo: 'PE', cnesCodigo: '0000434' });
    expect(s.uf?.codigo).toBe('PE');
    expect(s.cnes).toBeNull();
  });

  it('gestor estadual não consegue convidar fora da própria UF', () => {
    const s = resolveInviteScope(estadualPE, P.GESTOR_MUNICIPAL, {
      ufCodigo: 'SP',
      municipioCodigo: '2611606',
      municipioNome: 'Recife',
    });
    expect(s.uf).toEqual({ codigo: 'PE', nome: 'Pernambuco' });
    expect(s.municipio?.codigo).toBe('2611606');
  });

  it('quem convida sem escopo próprio é barrado', () => {
    expect(() => resolveInviteScope({ profile: P.GESTOR_ESTADUAL, scope: EMPTY_SCOPE }, P.UNIDADE, { cnesCodigo: '0000434' })).toThrow(
      ForbiddenException,
    );
  });
});

describe('isWithinScope', () => {
  const alvoPE: UserScope = { ...EMPTY_SCOPE, uf: { codigo: 'PE', nome: null } };
  const alvoSP: UserScope = { ...EMPTY_SCOPE, uf: { codigo: 'SP', nome: null } };
  it('nacional enxerga todos; estadual só a própria UF', () => {
    expect(isWithinScope(federal, alvoSP)).toBe(true);
    expect(isWithinScope(estadualPE, alvoPE)).toBe(true);
    expect(isWithinScope(estadualPE, alvoSP)).toBe(false);
  });
});
