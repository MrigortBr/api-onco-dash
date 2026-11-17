import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataSource } from '../data-source.js';
import { COLUNAS, importarUsuarios, validarLinhas } from '../usuarios/usuarios-import.js';
import { parseCsv } from './csv.js';

/**
 * Importa os usuários da tb_usuario (APAC Onco) a partir do CSV exportado,
 * SEM alterar nenhum valor (regras em database/usuarios/usuarios-import.ts).
 * Depois disso, a sincronização diária (SyncService) mantém a lista em dia
 * lendo direto do banco de origem — o CSV serve para a primeira carga ou
 * quando não houver acesso ao banco.
 *
 * Uso (na pasta da API):
 *   npm run seed:usuarios                          lê dados/tb_usuario.csv
 *   npm run seed:usuarios -- caminho/arquivo.csv
 *   npm run seed:usuarios -- caminho/arquivo.csv --atualizar
 *
 * Sem --atualizar, quem já foi importado fica como está. Com --atualizar,
 * os campos da tb_usuario dessas contas são sobrescritos pelos do arquivo;
 * os campos do OncoDash (perfil, escopo, CPF criptografado...) não mudam.
 *
 * Se um usuário criado no OncoDash (ex.: pelo `npm run conta:registrar`)
 * estiver ocupando um id da tb_usuario, ele ganha um id novo — as tabelas
 * ligadas acompanham pelo ON UPDATE CASCADE.
 *
 * No fim, cada linha do arquivo é comparada, coluna a coluna, com o que
 * ficou no banco. Qualquer diferença numa linha recém-importada desfaz tudo.
 *
 * O CSV tem CPF e hash de senha: não versionar (a pasta dados/ está no .gitignore).
 */
function lerArquivo(caminho: string) {
  const [cabecalho, ...resto] = parseCsv(readFileSync(caminho, 'utf8'));
  if (!cabecalho || cabecalho.join(',') !== COLUNAS.join(',')) {
    throw new Error(`Cabeçalho inesperado. Esperado:\n  ${COLUNAS.join(',')}\nRecebido:\n  ${cabecalho?.join(',')}`);
  }
  // Linhas totalmente vazias (ex.: quebra de linha extra no fim) são ignoradas.
  return validarLinhas(resto.filter((l) => !(l.length === 1 && l[0] === null)));
}

async function main() {
  const args = process.argv.slice(2);
  const atualizar = args.includes('--atualizar');
  const caminho = resolve(args.find((a) => !a.startsWith('--')) ?? process.env.SEED_USUARIOS_CSV ?? 'dados/tb_usuario.csv');

  console.log(`Lendo ${caminho}`);
  const linhas = lerArquivo(caminho);
  console.log(`${linhas.length} usuários no arquivo, sem erros de formato.`);

  await AppDataSource.initialize();
  try {
    const resumo = await AppDataSource.transaction((em) => importarUsuarios(em, linhas, atualizar ? 'atualizar' : 'novos'));

    for (const m of resumo.movidos) {
      console.log(`  Conta do OncoDash "${m.nome}" mudou de id ${m.de} para ${m.para} (o id ${m.de} é da tb_usuario).`);
    }
    console.log(`Importados agora: ${resumo.inseridos}.`);
    if (resumo.jaImportados > 0) {
      console.log(
        atualizar
          ? `Já existiam e foram atualizados pelo arquivo: ${resumo.jaImportados}.`
          : `Já existiam e foram mantidos como estão: ${resumo.jaImportados}` +
              (resumo.mantidasDiferentes > 0
                ? ` (${resumo.mantidasDiferentes} diferentes do arquivo — use --atualizar para sobrescrever).`
                : '.'),
      );
    }
    const conferidas = linhas.length - resumo.mantidasDiferentes;
    console.log(`Conferência: ${conferidas} de ${linhas.length} linhas do arquivo batem coluna a coluna com o banco.`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
