import type { FastifyInstance } from 'fastify';
import { createOrder, getOrderView, OrderError } from '../services/orders.js';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { sku?: string; promo_code?: string } }>('/api/orders', async (req, reply) => {
    const sku = req.body?.sku;
    if (!sku) return reply.code(400).send({ error: 'sku_required' });

    // Заголовок, а не поле тела: ключ относится к запросу, а не к заказу.
    // Так же это делают платёжные API, и клиенту привычнее.
    const idempotencyKey = req.headers['idempotency-key'];

    try {
      const { order, reused } = await createOrder(sku, {
        promoCode: req.body?.promo_code,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      });
      if (reused) {
        console.log(`[orders] повтор по ключу идемпотентности -> ${order.id}`);
        return reply.code(200).send({ order, reused });
      }
      console.log(`[orders] создан ${order.id} ${order.sku} ${order.total_amount}₽`);
      return reply.code(201).send({ order, reused });
    } catch (err) {
      if (err instanceof OrderError) return reply.code(err.statusCode).send({ error: err.reason });
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>('/api/orders/:id', async (req, reply) => {
    const view = await getOrderView(req.params.id);
    if (!view) return reply.code(404).send({ error: 'order_not_found' });
    return view;
  });
}
