import type { FastifyInstance } from 'fastify';
import { recordEvent, type WebhookPayload } from '../services/payments.js';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Контракт платёжки: at-least-once, порядок не гарантирован, ответ нужен быстрый.
   *
   * 200 отдаётся ДО всякого похода к поставщику. Иначе зависший поставщик
   * роняет ответ вебхуку, платёжка ретраит, и мы сами себе устраиваем шторм
   * параллельных вебхуков. Вся тяжёлая работа — на воркере.
   */
  app.post<{ Body: WebhookPayload }>('/api/webhooks/payment', async (req, reply) => {
    const body = req.body;
    if (!body?.event_id || !body?.order_id || !body?.status) {
      // Даже на кривой payload отвечаем 200: 5xx заставит платёжку ретраить вечно.
      return reply.code(200).send({ received: false, error: 'invalid_payload' });
    }

    const { duplicate } = await recordEvent(body);
    return reply.code(200).send({ received: true, duplicate });
  });
}
