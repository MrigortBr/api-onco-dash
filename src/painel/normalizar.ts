/**
 * O APAC Onco grava linha de tratamento e finalidade como texto livre, e as
 * solicitações migradas do sistema antigo ("Resgate") vêm em MAIÚSCULAS e com
 * outra grafia — o mesmo valor aparecia duas vezes no painel
 * ("ADJUVÂNCIA (Resgate)" × "Adjuvante", "CURATIVA" × "Curativa").
 * Estas funções juntam as variações num rótulo só. O banco não é alterado.
 */

/** minúsculas, sem acento, sem "(Resgate)" e sem espaços sobrando. */
function chave(valor: string): string {
  return valor
    .normalize('NFKD') // NFKD: também transforma ª em a
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\s*resgate\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "TEXTO QUALQUER" → "Texto qualquer" (só quando veio tudo em maiúsculas). */
function capitalizar(valor: string): string {
  const limpo = valor.replace(/\(\s*resgate\s*\)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (limpo !== limpo.toUpperCase()) return limpo;
  const min = limpo.toLocaleLowerCase('pt-BR');
  return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1);
}

const ORDINAIS: Array<[RegExp, string]> = [
  [/\b(primeira|1a)\b/, 'Primeira'],
  [/\b(segunda|2a)\b/, 'Segunda'],
  [/\b(terceira|3a)\b/, 'Terceira'],
  [/\b(quarta|4a)\b/, 'Quarta'],
];

export function normalizarLinha(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const k = chave(valor);
  if (/neo\s*-?\s*adjuv/.test(k)) return 'Neoadjuvante';
  if (/adjuv/.test(k)) return 'Adjuvante';
  // Uma ou mais linhas ("Primeira linha; Segunda linha" → "Primeira e segunda linha").
  const linhas = ORDINAIS.filter(([re]) => re.test(k)).map(([, nome]) => nome);
  if (linhas.length === 1) return `${linhas[0]} linha`;
  if (linhas.length > 1) {
    const [ultima, ...resto] = linhas.reverse();
    const lista = resto.reverse().map((n, i) => (i === 0 ? n : n.toLowerCase()));
    return `${lista.join(', ')} e ${ultima.toLowerCase()} linha`;
  }
  return capitalizar(valor);
}

export function normalizarFinalidade(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const k = chave(valor);
  if (/curativ/.test(k)) return 'Curativa';
  if (/paliativ/.test(k)) return 'Paliativa';
  if (/controle/.test(k)) return 'Controle de doença';
  if (/neo\s*-?\s*adjuv/.test(k)) return 'Neoadjuvante';
  if (/adjuv/.test(k)) return 'Adjuvante';
  return capitalizar(valor);
}
