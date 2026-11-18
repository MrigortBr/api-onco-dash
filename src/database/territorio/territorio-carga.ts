/**
 * Monta as tabelas de território (schema `territorio`) a partir das planilhas
 * que o SIMDASH já usa. O banco do APAC Onco só tem o CNES do serviço e o
 * código IBGE do município de residência; município do serviço,
 * macrorregião, região de saúde, tipo de habilitação e coordenadas vêm daqui.
 *
 * Fontes:
 *  - Exportação do CNES ("Estabelecimento DD MM AAAA.xlsx"): CNES → UF,
 *    município e macrorregião. Se a exportação trouxer também IBGE, região
 *    de saúde e latitude/longitude (a consulta guardada na aba "SQL" da
 *    própria planilha tem essas colunas), elas são aproveitadas.
 *  - "CADASTRO GERAL ONCOLOGIA" (.xls): habilitação de cada CNES
 *    (CACON, UNACON, ...).
 *  - municipios-ibge.json (nesta pasta): código IBGE e coordenadas da sede
 *    de cada município, para ligar o nome do município ao código e calcular
 *    a distância residência → serviço.
 *
 * Funções puras (sem banco) para poderem ser testadas.
 */

export type Celula = string | number | boolean | Date | null | undefined;

export interface MunicipioIbge {
  coIbge: string;
  nome: string;
  uf: string;
  latitude: number;
  longitude: number;
}

export interface EstabelecimentoCnes {
  cnes: string;
  nome: string | null;
  uf: string;
  municipio: string;
  coIbge: string | null;
  coMacro: string | null;
  noMacro: string | null;
  coRegiao: string | null;
  noRegiao: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Habilitacao {
  tipo: string;
  habilitacao: string;
}

export interface LinhaMunicipio {
  co_ibge: string;
  co_ibge6: string;
  no_municipio: string;
  sg_uf: string;
  co_macro: string | null;
  no_macro: string | null;
  co_regiao_saude: string | null;
  no_regiao_saude: string | null;
  latitude: number;
  longitude: number;
}

export interface LinhaEstabelecimento {
  co_cnes: string;
  no_estabelecimento: string | null;
  sg_uf: string;
  co_ibge: string | null;
  no_municipio: string;
  co_macro: string | null;
  no_macro: string | null;
  co_regiao_saude: string | null;
  no_regiao_saude: string | null;
  tipo_servico: string | null;
  habilitacao: string | null;
  latitude: number | null;
  longitude: number | null;
}

const texto = (v: Celula): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

/** Cabeçalho comparável: sem acento, maiúsculo, só letras e números. */
export const chaveCabecalho = (v: Celula): string =>
  (texto(v) ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Nome de município comparável: sem acento, maiúsculo, sem o "(nome antigo)". */
export const chaveMunicipio = (uf: string, nome: string): string =>
  `${uf.toUpperCase()}|${nome
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()}`;

/** CNES com 7 dígitos ("3816" → "0003816"); null se não for um CNES. */
export function normalizarCnes(v: Celula): string | null {
  const s = texto(v)?.replace(/\.0$/, '').replace(/\D/g, '');
  return s && s.length <= 7 ? s.padStart(7, '0') : null;
}

const numero = (v: Celula): number | null => {
  const s = texto(v)?.replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * Municípios que mudaram de nome e que a exportação do CNES ainda traz com
 * a grafia antiga (conferido com a exportação de 13/07/2026).
 */
const NOMES_ANTIGOS: Record<string, string> = {
  'CE|ITAPAGE': '2306306', // Itapajé
  'TO|TABOCAO': '1708254', // Fortaleza do Tabocão
  'PA|ELDORADO DOS CARAJAS': '1502954', // Eldorado do Carajás
  'MT|POXOREO': '5107008', // Poxoréu
  'BA|SANTA TEREZINHA': '2928505', // Santa Teresinha
  'SP|SAO LUIS DO PARAITINGA': '3550001', // São Luiz do Paraitinga
  'PE|SAO CAITANO': '2613107', // São Caetano
  'SP|FLORINEA': '3516101', // Florínia
};

export class IndiceMunicipios {
  private readonly porIbge6 = new Map<string, MunicipioIbge>();
  private readonly porNome = new Map<string, MunicipioIbge>();

  constructor(municipios: MunicipioIbge[]) {
    for (const m of municipios) {
      this.porIbge6.set(m.coIbge.slice(0, 6), m);
      this.porNome.set(chaveMunicipio(m.uf, m.nome), m);
    }
    for (const [chave, ibge] of Object.entries(NOMES_ANTIGOS)) {
      const m = this.porIbge6.get(ibge.slice(0, 6));
      if (m) this.porNome.set(chave, m);
    }
  }

  /** Pelo código IBGE (6 ou 7 dígitos) ou, sem ele, pelo nome + UF. */
  achar(uf: string, nome: string, ibge?: string | null): MunicipioIbge | null {
    const cod = ibge?.replace(/\D/g, '');
    if (cod && cod.length >= 6) {
      const m = this.porIbge6.get(cod.slice(0, 6));
      if (m) return m;
    }
    return this.porNome.get(chaveMunicipio(uf, nome)) ?? null;
  }
}

/** Primeira linha (entre as 20 primeiras) que tem uma célula "CNES". */
function linhaCabecalho(linhas: Celula[][]): number {
  for (let i = 0; i < Math.min(linhas.length, 20); i++) {
    if (linhas[i]?.some((c) => chaveCabecalho(c) === 'CNES')) return i;
  }
  return -1;
}

/**
 * Lê a exportação do CNES. Colunas obrigatórias: CNES, UF e município
 * (NO_MUNICIPIO_ACENTUADO ou MUNICÍPIO); as demais entram se existirem.
 */
export function lerExportacaoCnes(linhas: Celula[][]): EstabelecimentoCnes[] {
  const h = linhaCabecalho(linhas);
  if (h < 0) throw new Error('Exportação do CNES: não achei a coluna "CNES".');
  const cab = linhas[h].map(chaveCabecalho);
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    cnes: col('CNES', 'COCNES'),
    uf: col('UF', 'SGUF'),
    municipio: col('NOMUNICIPIOACENTUADO', 'MUNICIPIO', 'NOMUNICIPIO'),
    nome: col('ESTABELECIMENTO', 'NOFANTASIA'),
    ibge: col('IBGE', 'COMUNICIPIOGESTOR', 'COMUNICIPIOIBGE'),
    coMacro: col('COMACROREGIAOSAUDE', 'COMACRORREGIONAL', 'COMACRORREGIAOSAUDE'),
    noMacro: col('MACROREGIAODESAUDE', 'MACRORREGIAODESAUDE', 'NOMACRORREGIONAL'),
    coRegiao: col('COREGIAOSAUDE', 'COCIR'),
    noRegiao: col('REGIAODESAUDE', 'NOREGIAOSAUDE'),
    lat: col('LATICNES', 'NULATITUDE'),
    lon: col('LONGCNES', 'NULONGITUDE'),
  };
  const faltando = (['cnes', 'uf', 'municipio'] as const).filter((k) => c[k] < 0);
  if (faltando.length) throw new Error(`Exportação do CNES: faltam as colunas ${faltando.join(', ')}.`);

  const v = (l: Celula[], i: number) => (i >= 0 ? texto(l[i]) : null);
  const saida: EstabelecimentoCnes[] = [];
  for (const l of linhas.slice(h + 1)) {
    const cnes = normalizarCnes(l[c.cnes]);
    const uf = v(l, c.uf);
    const municipio = v(l, c.municipio);
    if (!cnes || !uf || !municipio) continue;
    saida.push({
      cnes,
      nome: v(l, c.nome),
      uf: uf.toUpperCase(),
      municipio,
      coIbge: v(l, c.ibge),
      coMacro: v(l, c.coMacro),
      noMacro: v(l, c.noMacro),
      coRegiao: v(l, c.coRegiao),
      noRegiao: v(l, c.noRegiao),
      latitude: c.lat >= 0 ? numero(l[c.lat]) : null,
      longitude: c.lon >= 0 ? numero(l[c.lon]) : null,
    });
  }
  return saida;
}

/** Habilitação por extenso → tipo curto mostrado no painel. */
export function classificarHabilitacao(habilitacao: string): string | null {
  const h = chaveCabecalho(habilitacao);
  if (!h) return null;
  if (h.startsWith('CACON')) return 'CACON';
  if (h.startsWith('UNACON')) return 'UNACON';
  if (h.includes('HOSPITALGERAL')) return 'Hospital geral com cirurgia oncológica';
  if (h.includes('ISOLADO')) return 'Serviço isolado de radioterapia';
  if (h.includes('RADIOTERAPIA')) return 'Radioterapia de complexo hospitalar';
  return null;
}

/**
 * Lê as abas do "CADASTRO GERAL ONCOLOGIA". Em cada aba procura a linha de
 * cabeçalho (com "CNES") e a coluna da habilitação; "HABILITAÇÃO EM
 * CONJUNTO", quando preenchida, vale mais (é a habilitação completa).
 * A aba "DESABILITADOS" é ignorada.
 */
export function lerHabilitacoes(abas: Array<{ nome: string; linhas: Celula[][] }>): Map<string, Habilitacao> {
  const saida = new Map<string, Habilitacao>();
  for (const aba of abas) {
    if (chaveCabecalho(aba.nome).startsWith('DESABILITADO')) continue;
    const h = linhaCabecalho(aba.linhas);
    if (h < 0) continue;
    const cab = aba.linhas[h].map(chaveCabecalho);
    const iCnes = cab.indexOf('CNES');
    const iConjunto = cab.indexOf('HABILITACAOEMCONJUNTO');
    let iHab = cab.indexOf('HABILITACAO');
    if (iHab < 0) iHab = cab.findIndex((k) => k.startsWith('TIPODEHABILITACAO'));
    if (iHab < 0) continue;
    for (const l of aba.linhas.slice(h + 1)) {
      const cnes = normalizarCnes(l[iCnes]);
      const habilitacao = texto(iConjunto >= 0 ? l[iConjunto] : null) ?? texto(l[iHab]);
      if (!cnes || !habilitacao) continue;
      const tipo = classificarHabilitacao(habilitacao);
      if (tipo && !saida.has(cnes)) saida.set(cnes, { tipo, habilitacao });
    }
  }
  return saida;
}

/** O valor que mais aparece (empate: o primeiro). */
function maisFrequente<T>(valores: T[]): T | null {
  const conta = new Map<T, number>();
  let melhor: T | null = null;
  let max = 0;
  for (const v of valores) {
    const n = (conta.get(v) ?? 0) + 1;
    conta.set(v, n);
    if (n > max) [melhor, max] = [v, n];
  }
  return melhor;
}

export interface Territorio {
  municipios: LinhaMunicipio[];
  estabelecimentos: LinhaEstabelecimento[];
  /** Municípios da exportação que não foram ligados a um código IBGE. */
  semIbge: string[];
}

export function montarTerritorio(
  exportacao: EstabelecimentoCnes[],
  habilitacoes: Map<string, Habilitacao>,
  municipiosIbge: MunicipioIbge[],
): Territorio {
  const indice = new IndiceMunicipios(municipiosIbge);
  const semIbge = new Set<string>();

  // Macro e região de cada município = as que os estabelecimentos dele trazem.
  const porMunicipio = new Map<string, { macros: string[]; regioes: string[] }>();
  const nomes = new Map<string, string>();
  const estabelecimentos: LinhaEstabelecimento[] = [];
  const vistos = new Set<string>();

  for (const e of exportacao) {
    if (vistos.has(e.cnes)) continue;
    vistos.add(e.cnes);
    const m = indice.achar(e.uf, e.municipio, e.coIbge);
    if (!m) semIbge.add(`${e.municipio} (${e.uf})`);
    if (m) {
      const g = porMunicipio.get(m.coIbge) ?? { macros: [], regioes: [] };
      if (e.coMacro && e.noMacro) {
        g.macros.push(e.coMacro);
        nomes.set(`macro|${e.coMacro}`, e.noMacro);
      }
      if (e.coRegiao && e.noRegiao) {
        g.regioes.push(e.coRegiao);
        nomes.set(`regiao|${e.coRegiao}`, e.noRegiao);
      }
      porMunicipio.set(m.coIbge, g);
    }
    const hab = habilitacoes.get(e.cnes);
    estabelecimentos.push({
      co_cnes: e.cnes,
      no_estabelecimento: e.nome,
      sg_uf: e.uf,
      co_ibge: m?.coIbge ?? null,
      no_municipio: m?.nome ?? e.municipio,
      co_macro: e.coMacro,
      no_macro: e.noMacro,
      co_regiao_saude: e.coRegiao,
      no_regiao_saude: e.noRegiao,
      tipo_servico: hab?.tipo ?? null,
      habilitacao: hab?.habilitacao ?? null,
      latitude: e.latitude ?? m?.latitude ?? null,
      longitude: e.longitude ?? m?.longitude ?? null,
    });
  }

  const municipios: LinhaMunicipio[] = municipiosIbge.map((m) => {
    const g = porMunicipio.get(m.coIbge);
    const macro = g ? maisFrequente(g.macros) : null;
    const regiao = g ? maisFrequente(g.regioes) : null;
    return {
      co_ibge: m.coIbge,
      co_ibge6: m.coIbge.slice(0, 6),
      no_municipio: m.nome,
      sg_uf: m.uf,
      co_macro: macro,
      no_macro: macro ? (nomes.get(`macro|${macro}`) ?? null) : null,
      co_regiao_saude: regiao,
      no_regiao_saude: regiao ? (nomes.get(`regiao|${regiao}`) ?? null) : null,
      latitude: m.latitude,
      longitude: m.longitude,
    };
  });

  return { municipios, estabelecimentos, semIbge: [...semIbge].sort() };
}
