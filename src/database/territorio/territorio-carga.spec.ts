import { describe, expect, it } from 'vitest';
import {
  classificarHabilitacao,
  IndiceMunicipios,
  lerExportacaoCnes,
  lerHabilitacoes,
  type MunicipioIbge,
  montarTerritorio,
  normalizarCnes,
} from './territorio-carga.js';

const MUNICIPIOS: MunicipioIbge[] = [
  { coIbge: '2611606', nome: 'Recife', uf: 'PE', latitude: -8.05, longitude: -34.88 },
  { coIbge: '2405306', nome: 'Januário Cicco (Boa Saúde)', uf: 'RN', latitude: -6.16, longitude: -35.62 },
  { coIbge: '2306306', nome: 'Itapajé', uf: 'CE', latitude: -3.68, longitude: -39.58 },
  { coIbge: '2607901', nome: 'Jaboatão dos Guararapes', uf: 'PE', latitude: -8.11, longitude: -35.01 },
];

describe('normalizarCnes', () => {
  it('completa com zeros e aceita número', () => {
    expect(normalizarCnes(3816)).toBe('0003816');
    expect(normalizarCnes('2001586')).toBe('2001586');
    expect(normalizarCnes('abc')).toBeNull();
    expect(normalizarCnes('123456789')).toBeNull();
  });
});

describe('IndiceMunicipios', () => {
  const idx = new IndiceMunicipios(MUNICIPIOS);
  it('acha pelo nome sem acento, pelo nome antigo e pelo IBGE de 6 dígitos', () => {
    expect(idx.achar('PE', 'JABOATAO DOS GUARARAPES')?.coIbge).toBe('2607901');
    expect(idx.achar('RN', 'JANUARIO CICCO')?.coIbge).toBe('2405306');
    expect(idx.achar('CE', 'ITAPAGE')?.coIbge).toBe('2306306');
    expect(idx.achar('XX', 'qualquer', '261160')?.coIbge).toBe('2611606');
    expect(idx.achar('PE', 'Inexistente')).toBeNull();
  });
});

describe('lerExportacaoCnes', () => {
  it('lê a exportação de 7 colunas do SIMDASH', () => {
    const e = lerExportacaoCnes([
      ['REGIÃO', 'UF', 'NO_MUNICIPIO_ACENTUADO', 'CNES', 'ESTABELECIMENTO', 'CO_MACRO_REGIAO_SAUDE', 'MACRO REGIÃO DE SAÚDE'],
      ['NORDESTE', 'PE', 'RECIFE', '0000582', 'HOSPITAL DE CANCER', '2601', 'MACRO I'],
      [null, null, null, null, null, null, null],
    ]);
    expect(e).toEqual([
      expect.objectContaining({ cnes: '0000582', uf: 'PE', municipio: 'RECIFE', coMacro: '2601', noMacro: 'MACRO I', coRegiao: null }),
    ]);
  });

  it('aproveita região de saúde, IBGE e coordenadas quando a exportação tem', () => {
    const [e] = lerExportacaoCnes([
      ['UF', 'IBGE', 'NO_MUNICIPIO_ACENTUADO', 'CNES', 'CO_REGIAO_SAUDE', 'REGIÃO DE SAÚDE', 'LATI_CNES', 'LONG_CNES'],
      ['PE', '261160', 'RECIFE', 582, '26001', 'I REGIÃO', '-8,04', -34.9],
    ]);
    expect(e).toMatchObject({ cnes: '0000582', coIbge: '261160', coRegiao: '26001', noRegiao: 'I REGIÃO', latitude: -8.04, longitude: -34.9 });
  });

  it('reclama se faltar coluna obrigatória', () => {
    expect(() => lerExportacaoCnes([['CNES', 'UF']])).toThrow(/município|municipio/);
  });
});

describe('habilitações', () => {
  it('classifica o tipo', () => {
    expect(classificarHabilitacao('UNACON com Serviço de Radioterapia')).toBe('UNACON');
    expect(classificarHabilitacao('CACON com Serviço de Oncologia Pediátrica')).toBe('CACON');
    expect(classificarHabilitacao('Hospital Geral com Cirurgia Oncológica')).toBe('Hospital geral com cirurgia oncológica');
    expect(classificarHabilitacao('Serviço Isolado de Radioterapia')).toBe('Serviço isolado de radioterapia');
    expect(classificarHabilitacao('Serviço de Radioterapia de Complexo Hospitalar')).toBe('Radioterapia de complexo hospitalar');
  });

  it('lê as abas do CADASTRO GERAL, prefere a habilitação em conjunto e ignora desabilitados', () => {
    const h = lerHabilitacoes([
      {
        nome: 'HABILITAÇÃO 2026',
        linhas: [
          ['HOSPITAIS HABILITADOS', null, null],
          ['UF', 'CNES', 'HABILITAÇÃO', 'HABILITAÇÃO EM CONJUNTO'],
          ['BA', 3816, 'Hospital Geral com Cirurgia Oncológica de Complexo Hospitalar', 'UNACON com Serviço de Radioterapia'],
          [null, '2006197', 'CACON', null],
        ],
      },
      { nome: 'Serv. Isol. Radioterapia Public', linhas: [[null], ['UF/', 'CNES', 'TIPO DE HABILITAÇÃO (CÓDIGO)'], ['PE', '2430843', 'Serviço Isolado de Radioterapia']] },
      { nome: 'DESABILITADOS', linhas: [['CNES', 'HABILITAÇÃO'], ['2673916', 'UNACON']] },
    ]);
    expect(h.get('0003816')?.tipo).toBe('UNACON');
    expect(h.get('2006197')?.tipo).toBe('CACON');
    expect(h.get('2430843')?.tipo).toBe('Serviço isolado de radioterapia');
    expect(h.has('2673916')).toBe(false);
  });
});

describe('montarTerritorio', () => {
  it('liga CNES ao município, macro, tipo e coordenadas; município herda a macro', () => {
    const t = montarTerritorio(
      [
        { cnes: '0000582', nome: 'HOSP', uf: 'PE', municipio: 'RECIFE', coIbge: null, coMacro: '2601', noMacro: 'MACRO I', coRegiao: null, noRegiao: null, latitude: null, longitude: null },
        { cnes: '9999999', nome: 'X', uf: 'PE', municipio: 'LUGAR NENHUM', coIbge: null, coMacro: '2601', noMacro: 'MACRO I', coRegiao: null, noRegiao: null, latitude: null, longitude: null },
      ],
      new Map([['0000582', { tipo: 'CACON', habilitacao: 'CACON' }]]),
      MUNICIPIOS,
    );
    expect(t.estabelecimentos[0]).toMatchObject({ co_cnes: '0000582', co_ibge: '2611606', no_municipio: 'Recife', tipo_servico: 'CACON', latitude: -8.05 });
    expect(t.estabelecimentos[1]).toMatchObject({ co_ibge: null, no_municipio: 'LUGAR NENHUM', latitude: null });
    expect(t.municipios.find((m) => m.co_ibge === '2611606')).toMatchObject({ co_ibge6: '261160', co_macro: '2601', no_macro: 'MACRO I' });
    expect(t.semIbge).toEqual(['LUGAR NENHUM (PE)']);
  });
});
