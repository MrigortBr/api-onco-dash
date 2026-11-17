import { avaliarRiscoLogin, distanciaKm } from './login-risk.js';

const recife = { latitude: -8.05, longitude: -34.9 };
const saoPaulo = { latitude: -23.55, longitude: -46.63 };

describe('avaliarRiscoLogin', () => {
  it('primeiro login nunca é suspeito', () => {
    expect(avaliarRiscoLogin({ fingerprint: 'a'.repeat(16), ...recife, data: new Date() }, []).suspeito).toBe(false);
  });

  it('mesmo dispositivo e mesmo lugar não é suspeito', () => {
    const r = avaliarRiscoLogin({ fingerprint: 'fp-1-aaaaaa', ...recife, data: new Date() }, [
      { fingerprint: 'fp-1-aaaaaa', ...recife, createdAt: new Date(Date.now() - 86_400_000) },
    ]);
    expect(r).toEqual({ suspeito: false, motivos: [], distanciaKm: 0 });
  });

  it('marca dispositivo novo, local distante e deslocamento impossível', () => {
    const r = avaliarRiscoLogin({ fingerprint: 'fp-2-bbbbbb', ...saoPaulo, data: new Date() }, [
      { fingerprint: 'fp-1-aaaaaa', ...recife, createdAt: new Date(Date.now() - 30 * 60_000) },
    ]);
    expect(r.suspeito).toBe(true);
    expect(r.motivos[0]).toBe('Dispositivo novo');
    expect(r.motivos.some((m) => m.startsWith('Local a'))).toBe(true);
    expect(r.motivos.some((m) => m.startsWith('Deslocamento impossível'))).toBe(true);
  });

  it('distância Recife–São Paulo ≈ 2.130 km', () => {
    expect(Math.round(distanciaKm(recife.latitude, recife.longitude, saoPaulo.latitude, saoPaulo.longitude) / 10)).toBe(213);
  });
});
