import { config } from '../config.js';
import { one, query, tx } from '../db.js';
import type { Order } from './orders.js';
import { issue, type ProviderResult } from './provider-client.js';

const PROVIDERS = ['a', 'b'] as const;

/**
 * Захватить один заказ на выдачу. Заказ сам себе задача — отдельной таблицы
 * очереди нет. SKIP LOCKED разводит параллельных воркеров по разным заказам,
 * а переход в delivering в том же стейтменте не даёт взять заказ дважды.
 */
export async function claimOrder(): Promise<Order | null> {
  return one<Order>(
    `UPDATE orders SET status = 'delivering', attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM orders
       WHERE status IN ('paid','out_of_stock','delivery_failed')
         AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING *`,
  );
}

/**
 * Спросить одного поставщика, переспрашивая ТЕМ ЖЕ request_id при таймауте
 * или ошибке. Повтор безопасен по контракту: поставщик обязан вернуть тот же
 * код, а не выдать новый.
 */
async function askProvider(
  provider: string,
  requestId: string,
  order: Order,
): Promise<ProviderResult> {
  let last: ProviderResult = { kind: 'error', message: 'not_attempted' };

  for (let attempt = 0; attempt <= config.providerRetries; attempt += 1) {
    last = await issue(provider, { request_id: requestId, sku: order.sku, order_id: order.id });
    if (last.kind === 'ok' || last.kind === 'out_of_stock') return last;
    console.log(`[delivery] ${order.id} поставщик ${provider}: ${last.kind}, попытка ${attempt + 1}`);
  }

  return last;
}

async function fail(
  orderId: string,
  status: 'out_of_stock' | 'delivery_failed',
  delayMs: number,
  error: string,
): Promise<void> {
  // Исчерпав лимит попыток, уводим next_attempt_at в бесконечность:
  // заказ выпадает из автоматического цикла и ждёт ручной выдачи из админки.
  await query(
    `UPDATE orders
     SET status = $2,
         last_error = $4,
         next_attempt_at = CASE
           WHEN attempts >= $5 THEN 'infinity'::timestamptz
           ELSE now() + make_interval(secs => $3::float8 / 1000)
         END,
         updated_at = now()
     WHERE id = $1 AND status = 'delivering'`,
    [orderId, status, delayMs, error, config.maxDeliveryAttempts],
  );
}

/**
 * Выдача по захваченному заказу.
 *
 * request_id детерминирован от order_id — один на заказ навсегда, а не счётчик
 * попыток. Сколько бы раз ни ретраили, поставщик вернёт тот же код.
 */
export async function deliver(order: Order): Promise<void> {
  const requestId = `req_${order.id}`;

  for (const provider of PROVIDERS) {
    const result = await askProvider(provider, requestId, order);

    if (result.kind === 'ok') {
      await record(order, provider, requestId, result.code);
      return;
    }

    if (result.kind === 'out_of_stock') continue; // только это разрешает уйти на B

    // Таймаут значит «возможно, уже выдал»: поставщик мог отдать код, а ответ
    // не дошёл. Уходить на резервного нельзя — это два потраченных кода.
    const reason = result.kind === 'timeout' ? 'provider_timeout' : result.message;
    await fail(order.id, 'delivery_failed', config.retryDeliveryFailedMs, `${provider}:${reason}`);
    console.log(`[delivery] ${order.id} -> delivery_failed (${provider}:${reason})`);
    return;
  }

  await fail(order.id, 'out_of_stock', config.retryOutOfStockMs, 'все поставщики пусты');
  console.log(`[delivery] ${order.id} -> out_of_stock`);
}

/**
 * Зафиксировать выдачу. Два констрейнта делают задвоение невозможным:
 * issuances.order_id UNIQUE и issuances.request_id UNIQUE.
 * ON CONFLICT DO NOTHING значит, что гонку выиграл кто-то другой.
 *
 * Обе записи в ОДНОЙ транзакции. Порознь между ними есть окно: упади процесс
 * после вставки выдачи, но до смены статуса — код записан, а заказ навсегда
 * висит в delivering, и покупатель своего кода не видит.
 */
async function record(
  order: Order,
  provider: string,
  requestId: string,
  code: string,
): Promise<void> {
  const stored = await tx(async (client) => {
    const inserted = await client.query<{ code: string }>(
      `INSERT INTO issuances (order_id, request_id, provider, code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (order_id) DO NOTHING
       RETURNING code`,
      [order.id, requestId, provider, code],
    );

    await client.query(
      `UPDATE orders SET status = 'delivered', last_error = NULL, updated_at = now()
       WHERE id = $1 AND status <> 'delivered'`,
      [order.id],
    );

    // Пусто — значит выдачу записал кто-то другой; тогда и код у заказа его.
    if (inserted.rows[0]) return inserted.rows[0].code;
    const existing = await client.query<{ code: string }>(
      'SELECT code FROM issuances WHERE order_id = $1',
      [order.id],
    );
    return existing.rows[0]?.code ?? code;
  });

  const note = stored === code ? '' : ' (выдачу записал параллельный воркер)';
  console.log(`[delivery] ${order.id} -> delivered (${provider}, ${stored})${note}`);
}

/**
 * Ручная повторная выдача из админки.
 *
 * Идемпотентна по построению: заказ возвращается в очередь, а не выдаётся тут же.
 * Задвоиться выдача не может — request_id остаётся тем же `req_<order_id>`,
 * поставщик обязан вернуть по нему прежний код, а issuances.order_id UNIQUE
 * не пустит вторую строку.
 *
 * delivering в списке разрешённых статусов намеренно: заказ, зависший из-за
 * упавшего процесса, иначе не подберёт ни один цикл воркера.
 */
export async function reissue(orderId: string): Promise<'queued' | 'already_delivered' | 'not_recoverable' | 'not_found'> {
  const order = await one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
  if (!order) return 'not_found';
  if (order.status === 'delivered') return 'already_delivered';

  const res = await query(
    `UPDATE orders
     SET status = 'paid', attempts = 0, next_attempt_at = now(), last_error = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('paid','delivering','out_of_stock','delivery_failed')`,
    [orderId],
  );

  if ((res.rowCount ?? 0) === 0) return 'not_recoverable';
  console.log(`[admin] ${orderId} возвращён в очередь на выдачу`);
  return 'queued';
}
