import type pg from 'pg';
import { query, tx } from '../db.js';

export type PaymentEvent = {
  event_id: string;
  order_id: string;
  status: string;
  amount: number | null;
  currency: string | null;
  payload: unknown;
  received_at: Date;
  applied_at: Date | null;
};

export type WebhookPayload = {
  event_id: string;
  order_id: string;
  status: string;
  amount?: number;
  currency?: string;
  created_at?: string;
};

/**
 * Приём вебхука. Единственная работа ручки — записать событие и отдать 200.
 * Повтор с тем же event_id отсекается первичным ключом, а не кодом приложения.
 * FK на orders намеренно нет: событие может прийти раньше заказа.
 */
export async function recordEvent(p: WebhookPayload): Promise<{ duplicate: boolean }> {
  const res = await query(
    `INSERT INTO payment_events (event_id, order_id, status, amount, currency, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_id) DO NOTHING`,
    [p.event_id, p.order_id, p.status, p.amount ?? null, p.currency ?? null, JSON.stringify(p)],
  );
  return { duplicate: res.rowCount === 0 };
}

/**
 * Захватить одно необработанное событие.
 * JOIN orders означает: событие для ещё не созданного заказа просто останется
 * необработанным и подберётся, когда заказ появится — сценарий приёмки №3.
 */
export async function processNextEvent(): Promise<{ event: PaymentEvent; changed: boolean } | null> {
  return tx(async (client) => {
    const claimed = await client.query<PaymentEvent>(
      `UPDATE payment_events SET applied_at = now()
       WHERE event_id = (
         SELECT e.event_id FROM payment_events e
         JOIN orders o ON o.id = e.order_id
         WHERE e.applied_at IS NULL
         ORDER BY e.received_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       RETURNING *`,
    );

    const event = claimed.rows[0];
    if (!event) return null;

    // Пометка «применено» и само применение — в одной транзакции. Порознь
    // между ними окно: упади процесс после пометки, но до смены статуса —
    // событие считается обработанным, а заказ навсегда остаётся неоплаченным.
    // Повтор вебхука его не спасёт: тот же event_id отсечёт первичный ключ.
    return { event, changed: await applyEvent(client, event) };
  });
}

/**
 * Применить статус оплаты к заказу. Один атомарный стейтмент на переход,
 * без «прочитал — проверил — записал».
 *
 * rowCount = 0 значит, что заказ уже ушёл дальше по жизненному циклу:
 * тихо выходим, это и есть идемпотентность.
 *
 * paid побеждает failed независимо от порядка прихода — деньги реально прошли.
 */
async function applyEvent(client: pg.PoolClient, event: PaymentEvent): Promise<boolean> {
  if (event.status === 'paid') {
    const res = await client.query(
      `UPDATE orders SET status = 'paid', updated_at = now()
       WHERE id = $1 AND status IN ('created','payment_failed')`,
      [event.order_id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  if (event.status === 'failed') {
    const res = await client.query(
      `UPDATE orders SET status = 'payment_failed', updated_at = now()
       WHERE id = $1 AND status = 'created'`,
      [event.order_id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  return false;
}
