import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import XLSX from 'xlsx';
import { AppDataSource } from '../data-source.js';
import {
  type Celula,
  lerExportacaoCnes,
  lerHabilitacoes,
  type MunicipioIbge,
  montarTerritorio,
} from '../territorio/territorio-carga.js';

/**
 * Carrega (ou recarrega) as tabelas de território do painel: município do
 * serviço, macrorregião, região de saúde, tipo da unidade (CACON/UNACON...)
 * e coordenadas para a distância. Regras em database/territorio/territorio-carga.ts.
 *
 * Uso (na pasta da API), com as planilhas do SIMDASH copiadas para dados/territorio/:
 *   npm run territorio:carregar
 *   npm run territorio:carregar -- --cnes "caminho/Estabelecimento.xlsx" --habilitacao "caminho/CADASTRO GERAL.xls"
 *
 * Sem os parâmetros, procura em dados/territorio/ um arquivo com
 * "estabelecimento" no nome (exportação do CNES) e um com "cadastro"
 * (CADASTRO GERAL ONCOLOGIA). O banco usado é o do .env (DATABASE_URL ou
 * DB_*): para carregar no banco do Railway, aponte o .env para ele.
 *
 * A carga substitui tudo numa transação só: se algo falhar, fica a anterior.
 * O painel passa a usar os dados novos na hora (o cache leva em conta a carga).
 */
const DIR_PADRAO = resolve(process.cwd(), 'dados', 'territorio');
const MUNICIPIOS_JSON = resolve(import.meta.dirname, '..', 'territorio', 'municipios-ibge.json');
const LOTE = 5000;

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function acharArquivo(padrao: RegExp, descricao: string, param: string): string {
  const dado = argumento(param);
  if (dado) {
    if (!existsSync(dado)) throw new Error(`Arquivo não encontrado: ${dado}`);
    return dado;
  }
  const candidatos = existsSync(DIR_PADRAO)
    ? readdirSync(DIR_PADRAO).filter((f) => padrao.test(f) && /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    : [];
  if (candidatos.length !== 1) {
    throw new Error(
      `${descricao}: ${candidatos.length ? 'mais de um arquivo' : 'nenhum arquivo'} em ${DIR_PADRAO}` +
        `${candidatos.length ? ` (${candidatos.join(', ')})` : ''}. Informe com ${param} "caminho".`,
    );
  }
  return join(DIR_PADRAO, candidatos[0]);
}

function abas(caminho: string): Array<{ nome: string; linhas: Celula[][] }> {
  const wb = XLSX.readFile(caminho, { dense: true, cellDates: false, cellHTML: false });
  return wb.SheetNames.map((nome) => ({
    nome,
    linhas: XLSX.utils.sheet_to_json<Celula[]>(wb.Sheets[nome], { header: 1, defval: null, raw: true }),
  }));
}

function lerMunicipiosIbge(): MunicipioIbge[] {
  const json = JSON.parse(readFileSync(MUNICIPIOS_JSON, 'utf8')) as {
    municipios: Array<[string, string, string, number, number]>;
  };
  return json.municipios.map(([coIbge, nome, uf, latitude, longitude]) => ({ coIbge, nome, uf, latitude, longitude }));
}

/** INSERT em lotes com unnest (um parâmetro por coluna, não por célula). */
async function inserir<T extends object>(
  q: (sql: string, params: unknown[]) => Promise<unknown>,
  tabela: string,
  colunas: Array<[keyof T & string, 'text' | 'numeric']>,
  linhas: T[],
) {
  const lista = colunas.map(([c]) => c).join(', ');
  const unnest = colunas.map(([, tipo], i) => `$${i + 1}::${tipo}[]`).join(', ');
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await q(
      `INSERT INTO ${tabela} (${lista}) SELECT * FROM unnest(${unnest})`,
      colunas.map(([c]) => lote.map((l) => l[c] ?? null)),
    );
  }
}

async function main() {
  const arqCnes = acharArquivo(/estabelecimento/i, 'Exportação do CNES', '--cnes');
  const arqHab = acharArquivo(/cadastro/i, 'CADASTRO GERAL ONCOLOGIA', '--habilitacao');

  console.log(`Lendo ${basename(arqCnes)} (pode levar alguns segundos)...`);
  const exportacao = lerExportacaoCnes(abas(arqCnes)[0].linhas);
  console.log(`  ${exportacao.length.toLocaleString('pt-BR')} estabelecimentos`);

  console.log(`Lendo ${basename(arqHab)}...`);
  const habilitacoes = lerHabilitacoes(abas(arqHab));
  console.log(`  ${habilitacoes.size} CNES habilitados em oncologia`);

  const t = montarTerritorio(exportacao, habilitacoes, lerMunicipiosIbge());
  const habilitadosAchados = t.estabelecimentos.filter((e) => e.tipo_servico).length;
  const comRegiao = t.municipios.filter((m) => m.co_regiao_saude).length;

  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (em) => {
      const q = (sql: string, params: unknown[] = []) => em.query(sql, params);
      await q('TRUNCATE territorio.municipio, territorio.estabelecimento');
      await inserir(q, 'territorio.municipio', [
        ['co_ibge', 'text'], ['co_ibge6', 'text'], ['no_municipio', 'text'], ['sg_uf', 'text'],
        ['co_macro', 'text'], ['no_macro', 'text'], ['co_regiao_saude', 'text'], ['no_regiao_saude', 'text'],
        ['latitude', 'numeric'], ['longitude', 'numeric'],
      ], t.municipios);
      await inserir(q, 'territorio.estabelecimento', [
        ['co_cnes', 'text'], ['no_estabelecimento', 'text'], ['sg_uf', 'text'], ['co_ibge', 'text'],
        ['no_municipio', 'text'], ['co_macro', 'text'], ['no_macro', 'text'], ['co_regiao_saude', 'text'],
        ['no_regiao_saude', 'text'], ['tipo_servico', 'text'], ['habilitacao', 'text'],
        ['latitude', 'numeric'], ['longitude', 'numeric'],
      ], t.estabelecimentos);
      await q(
        `INSERT INTO territorio.carga (arquivos, municipios, estabelecimentos, habilitados) VALUES ($1, $2, $3, $4)`,
        [`${basename(arqCnes)} | ${basename(arqHab)}`, t.municipios.length, t.estabelecimentos.length, habilitadosAchados],
      );
    });

    // Quantas solicitações do painel ficaram sem território (CNES fora da exportação).
    const [cobertura] = (await AppDataSource.query(`
      SELECT count(*)::int AS total,
             count(e.co_cnes)::int AS com_territorio,
             count(e.tipo_servico)::int AS com_tipo,
             array_agg(DISTINCT s.co_cnes) FILTER (WHERE e.co_cnes IS NULL) AS cnes_sem
      FROM apac.tb_solicitacao_apac s
      LEFT JOIN territorio.estabelecimento e ON e.co_cnes = lpad(s.co_cnes, 7, '0')
      WHERE s.dt_exclusao IS NULL`)) as Array<{ total: number; com_territorio: number; com_tipo: number; cnes_sem: string[] | null }>;

    console.log('\nCarga concluída:');
    console.log(`  municípios: ${t.municipios.length} (${comRegiao} com região de saúde)`);
    console.log(`  estabelecimentos: ${t.estabelecimentos.length.toLocaleString('pt-BR')} (${habilitadosAchados} com tipo de habilitação)`);
    if (!comRegiao) {
      console.log('  AVISO: a exportação do CNES não tem a coluna de região de saúde — o painel mostra "Não informado" nela.');
    }
    if (t.semIbge.length) {
      console.log(`  AVISO: ${t.semIbge.length} município(s) sem código IBGE (sem coordenadas): ${t.semIbge.slice(0, 15).join(', ')}`);
    }
    console.log(
      `\nSolicitações do painel: ${cobertura.total} — ${cobertura.com_territorio} com território, ${cobertura.com_tipo} com tipo da unidade.`,
    );
    if (cobertura.cnes_sem?.length) {
      console.log(`  CNES que não estão na exportação: ${cobertura.cnes_sem.slice(0, 20).join(', ')}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(`\nFalha na carga do território: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
