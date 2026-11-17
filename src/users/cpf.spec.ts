import { isValidCpf } from './cpf.js';

describe('isValidCpf', () => {
  it('aceita CPF com dígitos corretos e recusa os inválidos', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });
});
