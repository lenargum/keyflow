import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { ProviderPool } from './pool.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allKeys: string[] = JSON.parse(readFileSync(join(root, 'keys.json'), 'utf8'));

// Непересекающиеся куски: A — ключи 1..35, B — 36..50.
// Один код физически не может быть выдан обоими поставщиками.
const SPLIT = 35;
const providers: Record<string, ProviderPool> = {
  a: new ProviderPool('a', allKeys.slice(0, SPLIT)),
  b: new ProviderPool('b', allKeys.slice(SPLIT)),
};

// Резерв для долива пула через админку: коды вне исходных 50.
let refillCounter = 0;
function mintCodes(count: number): string[] {
  return Array.from({ length: count }, () => {
    refillCounter += 1;
    return `RFIL-${String(refillCounter).padStart(4, '0')}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type IssueBody = { request_id?: string; sku?: string; order_id?: string };

const app = Fastify({ logger: false });

app.post<{ Params: { provider: string }; Body: IssueBody }>(
  '/:provider/issue',
  async (req, reply) => {
    const pool = providers[req.params.provider];
    if (!pool) return reply.code(404).send({ status: 'error', reason: 'unknown_provider' });

    const requestId = req.body?.request_id;
    if (!requestId) return reply.code(400).send({ status: 'error', reason: 'request_id_required' });

    // Повтор по известному request_id обслуживаем сразу и без сбоев:
    // код уже выдан, врать про ошибку нельзя.
    const known = pool.lookup(requestId);
    if (known !== undefined) {
      console.log(`[${pool.name}] повтор ${requestId} -> ${known}`);
      return reply.send({ status: 'ok', request_id: requestId, code: known });
    }

    // Явная ошибка поставщика: код НЕ расходуется.
    if (Math.random() < pool.errorRate) {
      console.log(`[${pool.name}] ${requestId} -> provider_error`);
      return reply.code(500).send({ status: 'error', reason: 'provider_error' });
    }

    const code = pool.take(requestId);
    if (code === null) {
      console.log(`[${pool.name}] ${requestId} -> out_of_stock`);
      return reply.code(409).send({ status: 'error', reason: 'out_of_stock' });
    }

    // Ловушка таймаута: код УЖЕ выдан, а ответ не дойдёт вовремя.
    // Клиентский повтор с тем же request_id получит его же — не новый.
    if (Math.random() < pool.timeoutRate) {
      console.log(`[${pool.name}] ${requestId} -> зависание ${pool.hangMs}мс (код ${code} выдан)`);
      await sleep(pool.hangMs);
    }

    console.log(`[${pool.name}] ${requestId} -> ${code}`);
    return reply.send({ status: 'ok', request_id: requestId, code });
  },
);

// --- управляющие ручки для админки и тестов ---

app.get('/admin/state', async () => ({
  providers: Object.values(providers).map((p) => p.state()),
}));

type ConfigBody = Record<string, { errorRate?: number; timeoutRate?: number; hangMs?: number }>;

app.post<{ Body: ConfigBody }>('/admin/config', async (req, reply) => {
  for (const [name, cfg] of Object.entries(req.body ?? {})) {
    const pool = providers[name];
    if (!pool) return reply.code(400).send({ status: 'error', reason: `unknown_provider:${name}` });
    if (cfg.errorRate !== undefined) pool.errorRate = clamp01(cfg.errorRate);
    if (cfg.timeoutRate !== undefined) pool.timeoutRate = clamp01(cfg.timeoutRate);
    if (cfg.hangMs !== undefined) pool.hangMs = Math.max(0, cfg.hangMs);
  }
  return { providers: Object.values(providers).map((p) => p.state()) };
});

app.post<{ Body: { provider?: string; count?: number } }>('/admin/refill', async (req, reply) => {
  const name = req.body?.provider ?? 'a';
  const pool = providers[name];
  if (!pool) return reply.code(400).send({ status: 'error', reason: 'unknown_provider' });
  const remaining = pool.refill(mintCodes(Math.max(1, req.body?.count ?? 1)));
  return { provider: name, remaining };
});

app.post<{ Body: { provider?: string } }>('/admin/drain', async (req, reply) => {
  const names = req.body?.provider ? [req.body.provider] : Object.keys(providers);
  const drained: Record<string, number> = {};
  for (const name of names) {
    const pool = providers[name];
    if (!pool) return reply.code(400).send({ status: 'error', reason: 'unknown_provider' });
    drained[name] = pool.drain();
  }
  return { drained };
});

app.post('/admin/reset', async () => {
  providers.a!.reset(allKeys.slice(0, SPLIT));
  providers.b!.reset(allKeys.slice(SPLIT));
  refillCounter = 0;
  console.log('[providers] пулы сброшены в исходное состояние');
  return { providers: Object.values(providers).map((p) => p.state()) };
});

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const port = Number(process.env.PROVIDERS_PORT ?? 4001);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`[providers] слушает :${port} — пул A: ${SPLIT}, пул B: ${allKeys.length - SPLIT}`);
});
