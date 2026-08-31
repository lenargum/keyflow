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
