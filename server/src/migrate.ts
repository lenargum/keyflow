import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const client = await pool.connect();
  try {
    // Одновременный запуск миграций (тесты + dev-сервер) не должен пересекаться.
    await client.query('SELECT pg_advisory_lock(834721)');

    if (reset) {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
      console.log('[migrate] схема public пересоздана');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] применена ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`миграция ${file} упала: ${(err as Error).message}`);
      }
    }
    console.log('[migrate] готово');
  } finally {
    await client.query('SELECT pg_advisory_unlock(834721)').catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
