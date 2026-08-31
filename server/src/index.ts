import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = buildApp();

async function main(): Promise<void> {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[api] слушает :${config.port}`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await app.close();
      await pool.end();
      process.exit(0);
    })();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
