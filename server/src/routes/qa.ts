import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { createOrder, OrderError } from '../services/orders.js';
import { requireAdminToken } from './auth.js';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

type PayBody = {
  order_id?: string;
  outcome?: 'paid' | 'failed';
  times?: number;
  /** Задать явно, чтобы повторить один и тот же event_id — сценарий приёмки №2. */
  event_id?: string;
};

/**
 * Эмулятор платёжной системы. Шлёт настоящие HTTP-вебхуки на наш же эндпоинт,
 * а не дёргает сервис напрямую: гонки должны проверяться на том же пути,
 * которым ходит платёжка.
 */
export async function qaRoutes(app: FastifyInstance): Promise<void> {
  // QA-ручки мутируют состояние — закрыты тем же токеном, что и админка.
  requireAdminToken(app);

  /**
   * Создать заказ с заранее известным id. Нужно ровно для одного сценария:
   * прислать вебхук ДО того, как заказ появится в базе. Публичный
   * POST /api/orders id не принимает — клиенту такое доверять нельзя.
   */
  app.post<{ Body: { sku?: string; order_id?: string } }>('/api/qa/orders', async (req, reply) => {
    const sku = req.body?.sku;
    if (!sku) return reply.code(400).send({ error: 'sku_required' });
    try {
      const order = await createOrder(sku, { id: req.body?.order_id });
      return reply.code(201).send({ order });
    } catch (err) {
      if (err instanceof OrderError) return reply.code(err.statusCode).send({ error: err.reason });
      throw err;
    }
  });

  app.post<{ Body: PayBody }>('/api/qa/pay', async (req, reply) => {
    const orderId = req.body?.order_id;
    if (!orderId) return reply.code(400).send({ error: 'order_id_required' });

    const outcome = req.body?.outcome ?? 'paid';
    const times = Math.min(200, Math.max(1, req.body?.times ?? 1));
    const fixedEventId = req.body?.event_id;
    const url = `http://127.0.0.1:${config.port}/api/webhooks/payment`;

    const sent = await Promise.all(
      Array.from({ length: times }, async () => {
        const eventId = fixedEventId ?? `evt_${nano()}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            event_id: eventId,
            order_id: orderId,
            status: outcome,
            currency: 'RUB',
            created_at: new Date().toISOString(),
          }),
        });
        const data = (await res.json()) as { duplicate?: boolean };
        return { event_id: eventId, http: res.status, duplicate: data.duplicate ?? false };
      }),
    );

    console.log(`[qa] ${orderId}: отправлено вебхуков ${times}, outcome=${outcome}`);
    return { sent };
  });
}
