/**
 * Leitor de CSV (RFC 4180) que não perde informação:
 *  - campo vazio SEM aspas  → null  (é como DBeaver/psql exportam NULL)
 *  - campo vazio COM aspas  → ''    (texto vazio de verdade)
 *  - aspas duplas internas ("") viram uma aspa; vírgulas e quebras de linha
 *    dentro de aspas são mantidas; nenhum espaço é cortado.
 * Aceita BOM no início e quebras de linha \n ou \r\n.
 */
export type CsvValue = string | null;

export function parseCsv(texto: string, separador = ','): CsvValue[][] {
  const src = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: CsvValue[][] = [];
  let linha: CsvValue[] = [];
  let campo = '';
  let comAspas = false;
  let dentroAspas = false;
  let i = 0;

  const fechaCampo = () => {
    linha.push(campo === '' && !comAspas ? null : campo);
    campo = '';
    comAspas = false;
  };
  const fechaLinha = () => {
    fechaCampo();
    linhas.push(linha);
    linha = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (dentroAspas) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroAspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"' && campo === '' && !comAspas) {
      dentroAspas = true;
      comAspas = true;
      i++;
    } else if (c === separador) {
      fechaCampo();
      i++;
    } else if (c === '\r' && src[i + 1] === '\n') {
      fechaLinha();
      i += 2;
    } else if (c === '\n') {
      fechaLinha();
      i++;
    } else {
      campo += c;
      i++;
    }
  }
  if (dentroAspas) throw new Error('CSV inválido: aspas abertas sem fechar no fim do arquivo.');
  // Última linha sem quebra no fim.
  if (campo !== '' || comAspas || linha.length > 0) fechaLinha();
  return linhas;
}
