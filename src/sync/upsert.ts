/** Limite de parâmetros por comando (o Postgres aceita até 65.535). */
const MAX_PARAMS = 60000;

/**
 * INSERT em lote com upsert que só grava o que mudou (igual ao SIMDASH): a
 * cláusula WHERE compara a linha inteira (menos o pk) com o valor novo via
 * IS DISTINCT FROM (trata NULL certo) — linha idêntica não gera escrita.
 * RETURNING pk conta só o que foi de fato inserido ou alterado.
 */
export function buildUpsertSkipUnchanged(schema: string, table: string, pk: string, rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0]);
  const nonPkCols = cols.filter((c) => c !== pk);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const updateSet = nonPkCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const start = values.length;
    cols.forEach((c) => values.push(row[c] ?? null));
    return '(' + cols.map((_, i) => `$${start + i + 1}`).join(', ') + ')';
  });

  let text = `INSERT INTO "${schema}"."${table}" AS t (${colList}) VALUES ${tuples.join(', ')}`;
  if (nonPkCols.length > 0) {
    const lhs = nonPkCols.map((c) => `t."${c}"`).join(', ');
    const rhs = nonPkCols.map((c) => `EXCLUDED."${c}"`).join(', ');
    text += ` ON CONFLICT ("${pk}") DO UPDATE SET ${updateSet} WHERE (${lhs}) IS DISTINCT FROM (${rhs})`;
  } else {
    text += ` ON CONFLICT ("${pk}") DO NOTHING`;
  }
  text += ` RETURNING "${pk}"`;
  return { text, values };
}

export function chunkRows<T>(rows: T[], colCount: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_PARAMS / Math.max(colCount, 1)));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}
