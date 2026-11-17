import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm-options.js';

/**
 * DataSource usado só pela CLI do TypeORM (migration:run/revert) e pela seed,
 * fora do ciclo de vida do Nest. A CLI exige exatamente UM export de
 * DataSource neste arquivo.
 */
export const AppDataSource = new DataSource(buildTypeOrmOptions());
