function str(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`env ${name} не задан`);
  return v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`env ${name} не число: ${raw}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  port: int('PORT', 3000),
  databaseUrl: str('DATABASE_URL', 'postgres://keyflow:keyflow@localhost:5433/keyflow'),
  adminToken: str('ADMIN_TOKEN', 'dev-admin-token'),

  providersUrl: str('PROVIDERS_URL', 'http://localhost:4001'),
  providerTimeoutMs: int('PROVIDER_TIMEOUT_MS', 3000),
  providerRetries: int('PROVIDER_RETRIES', 2),

  workerEnabled: bool('WORKER_ENABLED', true),
  paymentsPollMs: int('PAYMENTS_POLL_MS', 200),
  deliveryPollMs: int('DELIVERY_POLL_MS', 200),
  maxDeliveryAttempts: int('MAX_DELIVERY_ATTEMPTS', 5),
  retryDeliveryFailedMs: int('RETRY_DELIVERY_FAILED_MS', 15000),
  retryOutOfStockMs: int('RETRY_OUT_OF_STOCK_MS', 30000),
} as const;
