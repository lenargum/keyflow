import { customAlphabet } from 'nanoid';
import { one, query } from '../db.js';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

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
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export class OrderError extends Error {
  constructor(
    readonly statusCode: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/**
 * Цену считает сервер. От клиента приходит только sku:
 * данным от клиента не доверяем, сумма берётся из products.
 */
export async function createOrder(sku: string): Promise<Order> {
  const product = await one<{ price_rub: number }>(
    'SELECT price_rub FROM products WHERE sku = $1',
    [sku],
  );
  if (!product) throw new OrderError(404, 'unknown_sku');

  const base = product.price_rub;
  const id = `ord_${nano()}`;

  const order = await one<Order>(
    `INSERT INTO orders (id, sku, base_amount, discount, total_amount)
     VALUES ($1, $2, $3, 0, $3)
     RETURNING *`,
    [id, sku, base],
  );
  if (!order) throw new OrderError(500, 'order_not_created');
  return order;
}

export async function getOrder(id: string): Promise<Order | null> {
  return one<Order>('SELECT * FROM orders WHERE id = $1', [id]);
}

export type OrderView = {
  order: Order;
  code: string | null;
  issuance: { provider: string; request_id: string; issued_at: Date } | null;
  events: { event_id: string; status: string; received_at: Date; applied_at: Date | null }[];
};

/** Заказ вместе с кодом и логом вебхуков — для страницы статуса и QA-панели. */
export async function getOrderView(id: string): Promise<OrderView | null> {
  const order = await getOrder(id);
  if (!order) return null;

  const issuance = await one<{
    provider: string;
    request_id: string;
    code: string;
    issued_at: Date;
  }>('SELECT provider, request_id, code, issued_at FROM issuances WHERE order_id = $1', [id]);

  const events = await query<{
    event_id: string;
    status: string;
    received_at: Date;
    applied_at: Date | null;
  }>(
    `SELECT event_id, status, received_at, applied_at
     FROM payment_events WHERE order_id = $1 ORDER BY received_at`,
    [id],
  );

  return {
    order,
    // Код показываем только когда заказ реально доставлен.
    code: order.status === 'delivered' && issuance ? issuance.code : null,
    issuance: issuance
      ? { provider: issuance.provider, request_id: issuance.request_id, issued_at: issuance.issued_at }
      : null,
    events: events.rows,
  };
}
