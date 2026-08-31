import pg from 'pg';
import { config } from './config.js';

// Деньги — INTEGER рублей, а не NUMERIC: pg по умолчанию отдаёт
// int8/numeric строками. INTEGER приходит числом, так что парсеры не трогаем.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
});

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/** Одна строка или null. */
export async function one<T extends Row = Row>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const res = await query<T>(text, params);
  return res.rows[0] ?? null;
}

/** Транзакция с откатом на любой ошибке. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
