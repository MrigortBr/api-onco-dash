import { describe, expect, it } from 'vitest';
import { normalizarFinalidade, normalizarLinha } from './normalizar.js';

describe('normalizarLinha', () => {
  it('junta as grafias de adjuvância', () => {
    expect(normalizarLinha('ADJUVÂNCIA (Resgate)')).toBe('Adjuvante');
    expect(normalizarLinha('Adjuvante')).toBe('Adjuvante');
    expect(normalizarLinha('NEOADJUVÂNCIA (Resgate)')).toBe('Neoadjuvante');
  });

  it('padroniza as linhas, inclusive mais de uma', () => {
    expect(normalizarLinha('PRIMEIRA LINHA (Resgate)')).toBe('Primeira linha');
    expect(normalizarLinha('1ª linha')).toBe('Primeira linha');
    expect(normalizarLinha('Primeira linha; Segunda linha')).toBe('Primeira e segunda linha');
  });

  it('mantém outros valores (só tira as maiúsculas) e vazio vira null', () => {
    expect(normalizarLinha('MANUTENÇÃO')).toBe('Manutenção');
    expect(normalizarLinha('  ')).toBeNull();
    expect(normalizarLinha(null)).toBeNull();
  });
});

describe('normalizarFinalidade', () => {
  it('aglutina maiúsculas e minúsculas', () => {
    expect(normalizarFinalidade('CURATIVA')).toBe('Curativa');
    expect(normalizarFinalidade('Curativa')).toBe('Curativa');
    expect(normalizarFinalidade('PALIATIVA (Resgate)')).toBe('Paliativa');
    expect(normalizarFinalidade('Controle de doença')).toBe('Controle de doença');
    expect(normalizarFinalidade('CONTROLE DA DOENÇA')).toBe('Controle de doença');
  });
});
