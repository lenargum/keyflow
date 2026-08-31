import { config } from '../config.js';

export type ProviderResult =
  | { kind: 'ok'; code: string }
  | { kind: 'out_of_stock' }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

/** Один запрос к заглушке поставщика с жёстким клиентским таймаутом. */
export async function issue(
  provider: string,
  body: { request_id: string; sku: string; order_id: string },
): Promise<ProviderResult> {
  try {
    const res = await fetch(`${config.providersUrl}/${provider}/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.providerTimeoutMs),
    });

    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      code?: string;
      reason?: string;
    };

    if (res.ok && data.status === 'ok' && data.code) return { kind: 'ok', code: data.code };
    if (data.reason === 'out_of_stock') return { kind: 'out_of_stock' };
    return { kind: 'error', message: data.reason ?? `http_${res.status}` };
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'error', message: e.message };
  }
}

/** Проксирование управляющих ручек заглушек: админка правит их на лету. */
export async function providerAdmin<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${config.providersUrl}/admin/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`providers/admin/${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function providerState<T = unknown>(): Promise<T> {
  const res = await fetch(`${config.providersUrl}/admin/state`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`providers/admin/state -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
