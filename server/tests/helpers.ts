import pg from 'pg';
import { API, PROV, TEST_DB_URL } from './env.js';

export const db = new pg.Pool({ connectionString: TEST_DB_URL });

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function get<T>(url: string): Promise<T> {
  return (await (await fetch(url)).json()) as T;
}

export type OrderRow = {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
};

export async function createOrder(sku = 'KEY-GTA5', orderId?: string): Promise<OrderRow> {
  const url = orderId ? `${API}/api/qa/orders` : `${API}/api/orders`;
  const res = await post<{ order: OrderRow }>(url, { sku, order_id: orderId });
  return res.order;
}

export async function orderRow(id: string): Promise<OrderRow> {
  const res = await db.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
  const row = res.rows[0];
  if (!row) throw new Error(`заказ ${id} не найден`);
  return row;
}

export async function countIssuances(orderId: string): Promise<number> {
  const res = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM issuances WHERE order_id = $1',
    [orderId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function countEvents(orderId: string): Promise<number> {
  const res = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM payment_events WHERE order_id = $1',
    [orderId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

export type ProviderState = {
  provider: string;
  remaining: number;
  issued: number;
  errorRate: number;
  timeoutRate: number;
  hangMs: number;
  issuedCodes: string[];
};

export async function providerStates(): Promise<Record<string, ProviderState>> {
  const { providers } = await get<{ providers: ProviderState[] }>(`${PROV}/admin/state`);
  return Object.fromEntries(providers.map((p) => [p.provider, p]));
}

/** Сколько кодов израсходовано у поставщиков суммарно. */
export async function totalIssued(): Promise<number> {
  const states = await providerStates();
  return Object.values(states).reduce((sum, p) => sum + p.issued, 0);
}

export async function configureProviders(cfg: Record<string, Partial<ProviderState>>): Promise<void> {
  await post(`${PROV}/admin/config`, cfg);
}

export async function drainProviders(provider?: string): Promise<void> {
  await post(`${PROV}/admin/drain`, provider ? { provider } : {});
}

export async function refillProvider(provider: string, count: number): Promise<void> {
  await post(`${PROV}/admin/refill`, { provider, count });
}

/** Дождаться, пока заказ придёт в один из ожидаемых статусов. */
export async function waitForStatus(
  id: string,
  statuses: string[],
  timeoutMs = 20_000,
): Promise<OrderRow> {
  const deadline = Date.now() + timeoutMs;
  let last: OrderRow | null = null;
  while (Date.now() < deadline) {
    last = await orderRow(id);
    if (statuses.includes(last.status)) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `заказ ${id} за ${timeoutMs}мс не дошёл до [${statuses.join(', ')}], сейчас ${last?.status}`,
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
