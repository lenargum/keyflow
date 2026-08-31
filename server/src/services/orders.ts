import { customAlphabet } from 'nanoid';
import { one, query, tx } from '../db.js';
import { consume, PromoError } from './promo.js';

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
 * Цену считает сервер. От клиента приходит только sku и, если есть, промокод:
 * данным от клиента не доверяем, сумма и скидка берутся из БД.
 *
 * Списание промокода и создание заказа — в одной транзакции. Если вставка
 * заказа упадёт, использование промокода откатится вместе с ней.
 */
export async function createOrder(
  sku: string,
  opts: { id?: string; promoCode?: string } = {},
): Promise<Order> {
  return tx(async (client) => {
    const product = await client.query<{ price_rub: number }>(
      'SELECT price_rub FROM products WHERE sku = $1',
      [sku],
    );
    const base = product.rows[0]?.price_rub;
    if (base === undefined) throw new OrderError(404, 'unknown_sku');

    let discount = 0;
    let promoCode: string | null = null;
    if (opts.promoCode) {
      try {
        const applied = await consume(client, opts.promoCode, base);
        discount = applied.amount;
        promoCode = applied.code;
      } catch (err) {
        if (err instanceof PromoError) throw new OrderError(409, err.reason);
        throw err;
      }
    }

    // id задаётся снаружи только из QA-ручки — чтобы можно было прислать вебхук
    // раньше, чем появится заказ (сценарий приёмки №3).
    const orderId = opts.id ?? `ord_${nano()}`;

    const res = await client.query<Order>(
      `INSERT INTO orders (id, sku, base_amount, promo_code, discount, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orderId, sku, base, promoCode, discount, base - discount],
    );

    const order = res.rows[0];
    if (!order) throw new OrderError(500, 'order_not_created');
    return order;
  });
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

export type StuckOrder = Order & { has_issuance: boolean };

/**
 * Список «оплачен, но код не выдан» — рабочий экран админки.
 * Критерий именно такой: деньги прошли, строки в issuances нет.
 */
export async function listStuckOrders(): Promise<StuckOrder[]> {
  const res = await query<StuckOrder>(
    `SELECT o.*, (i.id IS NOT NULL) AS has_issuance
     FROM orders o
     LEFT JOIN issuances i ON i.order_id = o.id
     WHERE o.status IN ('paid','delivering','out_of_stock','delivery_failed')
       AND i.id IS NULL
     ORDER BY o.created_at`,
  );
  return res.rows;
}

export async function listOrders(limit = 50): Promise<StuckOrder[]> {
  const res = await query<StuckOrder>(
    `SELECT o.*, (i.id IS NOT NULL) AS has_issuance
     FROM orders o
     LEFT JOIN issuances i ON i.order_id = o.id
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}
