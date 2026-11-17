/**
 * `EntityManager.query` do TypeORM (Postgres) devolve só as linhas num
 * SELECT/INSERT, mas [linhas, quantidade] num UPDATE/DELETE com RETURNING.
 * Esta função devolve sempre as linhas.
 */
export function linhasRetornadas<T = unknown>(resultado: unknown): T[] {
  if (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }
  return Array.isArray(resultado) ? (resultado as T[]) : [];
}
