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

export const api = {
  products: () => request<{ products: Product[] }>('/api/products'),
  createOrder: (sku: string) =>
    request<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify({ sku }) }),
  order: (id: string) => request<OrderView>(`/api/orders/${id}`),
  pay: (body: { order_id: string; outcome?: 'paid' | 'failed'; times?: number; event_id?: string }) =>
    request<{ sent: { event_id: string; http: number; duplicate: boolean }[] }>('/api/qa/pay', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
