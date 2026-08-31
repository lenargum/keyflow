import type { FastifyInstance } from 'fastify';
import { createOrder, getOrderView, OrderError } from '../services/orders.js';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { sku?: string } }>('/api/orders', async (req, reply) => {
    const sku = req.body?.sku;
    if (!sku) return reply.code(400).send({ error: 'sku_required' });

    try {
      const order = await createOrder(sku);
      console.log(`[orders] создан ${order.id} ${order.sku} ${order.total_amount}₽`);
      return reply.code(201).send({ order });
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
