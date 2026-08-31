import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ADMIN_DB_URL,
  API,
  API_PORT,
  MAX_DELIVERY_ATTEMPTS,
  PROV,
  PROVIDERS_PORT,
  PROVIDER_TIMEOUT_MS,
  RETRY_DELIVERY_FAILED_MS,
  RETRY_OUT_OF_STOCK_MS,
  TEST_DB_NAME,
  TEST_DB_URL,
} from './env.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const providersDir = join(serverDir, '..', 'providers');

/** Отдельная база под тесты: прогон не должен затирать девовые данные. */
async function ensureDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
}

function spawnNode(
  label: string,
  entry: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (b: Buffer) => process.stdout.write(`[${label}] ${b}`));
  child.stderr?.on('data', (b: Buffer) => process.stderr.write(`[${label}] ${b}`));
  return child;
}

function runToCompletion(
  label: string,
  entry: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnNode(label, entry, args, cwd, env);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} завершился с кодом ${code}`)),
    );
  });
}

async function waitFor(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${label} не поднялся за 30 секунд`);
}

export default async function setup(): Promise<() => Promise<void>> {
  await ensureDatabase();

  // Чистая схема на каждый прогон: тесты считают строки, остатки мешают.
  await runToCompletion('migrate', join(serverDir, 'src', 'migrate.ts'), ['--reset'], serverDir, {
    DATABASE_URL: TEST_DB_URL,
  });
  await runToCompletion('seed', join(serverDir, 'seed', 'seed.ts'), [], serverDir, {
    DATABASE_URL: TEST_DB_URL,
  });

  const providers = spawnNode(
    'providers',
    join(providersDir, 'src', 'index.ts'),
    [],
    providersDir,
    { PROVIDERS_PORT: String(PROVIDERS_PORT) },
  );

  const api = spawnNode('api', join(serverDir, 'src', 'index.ts'), [], serverDir, {
    PORT: String(API_PORT),
    DATABASE_URL: TEST_DB_URL,
    PROVIDERS_URL: PROV,
    PROVIDER_TIMEOUT_MS: String(PROVIDER_TIMEOUT_MS),
    WORKER_ENABLED: 'true',
    PAYMENTS_POLL_MS: '50',
    DELIVERY_POLL_MS: '50',
    RETRY_OUT_OF_STOCK_MS: String(RETRY_OUT_OF_STOCK_MS),
    MAX_DELIVERY_ATTEMPTS: String(MAX_DELIVERY_ATTEMPTS),
    RETRY_DELIVERY_FAILED_MS: String(RETRY_DELIVERY_FAILED_MS),
    ADMIN_TOKEN: 'test-admin-token',
  });

  await waitFor(`${PROV}/admin/state`, 'providers');
  await waitFor(`${API}/api/health`, 'api');

  return async () => {
    api.kill();
    providers.kill();
  };
}
