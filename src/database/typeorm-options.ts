import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import 'dotenv/config';
import { ENTITIES } from './entities/index.js';

/**
 * Opções do TypeORM compartilhadas pela API (TypeOrmModule) e pela CLI de
 * migrations (data-source.ts). Mesmo modelo do SIMDASH: `synchronize`
 * sempre desligado — o banco só muda por migration.
 */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.trim().toLowerCase());
}

export function buildTypeOrmOptions(): DataSourceOptions {
  const dir = import.meta.dirname;
  const ssl = parseBoolean(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : undefined;

  const base = {
    type: 'postgres' as const,
    entities: ENTITIES,
    migrations: [join(dir, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: parseBoolean(process.env.DB_LOGGING, false),
    ssl,
  };

  // DATABASE_URL (Railway) tem prioridade sobre as variáveis separadas.
  if (process.env.DATABASE_URL) {
    return { ...base, url: process.env.DATABASE_URL };
  }

  return {
    ...base,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'oncodash',
  };
}
