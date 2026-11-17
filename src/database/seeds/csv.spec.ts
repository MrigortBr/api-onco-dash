import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('distingue vazio sem aspas (NULL) de vazio com aspas (texto vazio)', () => {
    expect(parseCsv('a,"",,c\n')).toEqual([['a', '', null, 'c']]);
  });

  it('mantém vírgulas, aspas e espaços dentro de aspas', () => {
    expect(parseCsv('"38817723835 - UNICAMP, CAMPINAS","diz ""oi""","  x  "')).toEqual([
      ['38817723835 - UNICAMP, CAMPINAS', 'diz "oi"', '  x  '],
    ]);
  });

  it('não mexe em CPF com máscara, zeros à esquerda nem hash bcrypt', () => {
    expect(parseCsv('"123.949.490-40","0010456",$2a$11$abc./XYZ')).toEqual([
      ['123.949.490-40', '0010456', '$2a$11$abc./XYZ'],
    ]);
  });

  it('aceita BOM, \\r\\n e última linha sem quebra', () => {
    expect(parseCsv('﻿a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('acusa aspas sem fechar', () => {
    expect(() => parseCsv('"abc')).toThrow(/aspas/);
  });
});
