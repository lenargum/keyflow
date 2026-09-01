import { getToken } from './auth.js';

export type Product = {
  sku: string;
  name: string;
  type: string;
  price_rub: number;
  image: string | null;
};

export type OrderStatus =
  | 'created'
  | 'paid'
  | 'delivering'
  | 'delivered'
  | 'payment_failed'
  | 'out_of_stock'
  | 'delivery_failed';

export type Order = {
  id: string;
  sku: string;
  base_amount: number;
  promo_code: string | null;
  discount: number;
  total_amount: number;
  status: OrderStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export type OrderView = {
  order: Order;
  code: string | null;
  issuance: { provider: string; request_id: string; issued_at: string } | null;
  events: { event_id: string; status: string; received_at: string; applied_at: string | null }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * Ответ предпросмотра скидки. Все суммы посчитаны сервером — клиент их только
 * показывает. Это не обязательство: окончательную цену считает POST /api/orders.
 */
export type PromoPreview =
  | { valid: false; reason: 'promo_not_found' | 'promo_limit_reached' }
  | {
      valid: true;
      code: string;
      type: 'percent' | 'amount';
      value: number;
      remaining_uses: number;
      prices: Record<string, { base: number; discount: number; total: number }>;
    };

export const api = {
  products: () => request<{ products: Product[] }>('/api/products'),
  previewPromo: (code: string) =>
    request<PromoPreview>('/api/promocodes/preview', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  createOrder: (sku: string, promoCode?: string) =>
    request<{ order: Order }>('/api/orders', {
      method: 'POST',
      // Цену не шлём принципиально: сумму и скидку считает сервер.
      body: JSON.stringify({ sku, promo_code: promoCode || undefined }),
    }),
  order: (id: string) => request<OrderView>(`/api/orders/${id}`),

  // QA-ручки мутируют состояние, поэтому идут с токеном.
  pay: (body: { order_id: string; outcome?: 'paid' | 'failed'; times?: number; event_id?: string }) =>
    request<{ sent: { event_id: string; http: number; duplicate: boolean }[] }>('/api/qa/pay', {
      method: 'POST',
      headers: { authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    }),
  createOrderWithId: (sku: string, orderId: string) =>
    request<{ order: Order }>('/api/qa/orders', {
      method: 'POST',
      headers: { authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ sku, order_id: orderId }),
    }),
};

// --- админка и QA: всё за bearer-токеном ---

export type ProviderState = {
  provider: string;
  remaining: number;
  issued: number;
  errorRate: number;
  timeoutRate: number;
  hangMs: number;
};

export type AdminOrder = Order & { has_issuance: boolean };

export type PromocodeRow = {
  code: string;
  type: 'percent' | 'amount';
  value: number;
  max_uses: number;
  used_count: number;
};

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...init,
    headers: { authorization: `Bearer ${getToken()}`, ...(init?.headers ?? {}) },
  });
}

export const admin = {
  orders: (all = false) => authed<{ orders: AdminOrder[] }>(`/api/admin/orders${all ? '?all=1' : ''}`),
  reissue: (id: string) =>
    authed<{ result: string }>(`/api/admin/orders/${id}/reissue`, { method: 'POST', body: '{}' }),
  providers: () => authed<{ providers: ProviderState[] }>('/api/admin/providers'),
  promocodes: () => authed<{ promocodes: PromocodeRow[] }>('/api/admin/promocodes'),
  configure: (cfg: Record<string, { errorRate?: number; timeoutRate?: number }>) =>
    authed<{ providers: ProviderState[] }>('/api/admin/providers/config', {
      method: 'POST',
      body: JSON.stringify(cfg),
    }),
  refill: (provider: string, count: number) =>
    authed<{ provider: string; remaining: number }>('/api/admin/providers/refill', {
      method: 'POST',
      body: JSON.stringify({ provider, count }),
    }),
  drain: (provider?: string) =>
    authed<{ drained: Record<string, number> }>('/api/admin/providers/drain', {
      method: 'POST',
      body: JSON.stringify(provider ? { provider } : {}),
    }),
  reset: () => authed<{ ok: boolean }>('/api/admin/reset', { method: 'POST', body: '{}' }),
};
