import { canInvite, invitableProfilesFor, UserProfile as P } from './profiles.js';

describe('hierarquia de convite', () => {
  it('só convida perfil abaixo do próprio', () => {
    expect(canInvite(P.GESTOR_FEDERAL, P.GESTOR_ESTADUAL)).toBe(true);
    expect(canInvite(P.GESTOR_ESTADUAL, P.GESTOR_FEDERAL)).toBe(false);
    expect(canInvite(P.GESTOR_ESTADUAL, P.GESTOR_ESTADUAL)).toBe(false);
    expect(canInvite(P.GESTOR_MUNICIPAL, P.UNIDADE)).toBe(true);
    expect(canInvite(P.UNIDADE, P.UNIDADE)).toBe(false);
  });

  it('Desenvolvedor pode convidar outro Desenvolvedor', () => {
    expect(canInvite(P.DESENVOLVEDOR, P.DESENVOLVEDOR)).toBe(true);
    expect(invitableProfilesFor(P.DESENVOLVEDOR)).toHaveLength(7);
  });

  it('Gestor de região de saúde convida municipal e unidade', () => {
    expect(invitableProfilesFor(P.GESTOR_REGIAO_SAUDE)).toEqual([P.GESTOR_MUNICIPAL, P.UNIDADE]);
    expect(invitableProfilesFor(P.UNIDADE)).toEqual([]);
  });
});
