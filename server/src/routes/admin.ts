import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { reissue } from '../services/delivery.js';
import { getOrderView, listOrders, listStuckOrders } from '../services/orders.js';
import { providerAdmin, providerState } from '../services/provider-client.js';
import { requireAdminToken } from './auth.js';

/**
 * Всё за статическим bearer-токеном. Пользовательской авторизации нет —
 * задание её снимает, для админки достаточно одного префиксного хука.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  requireAdminToken(app);

  app.get('/api/admin/orders', async (req) => {
    const all = (req.query as { all?: string })?.all === '1';
    return { orders: all ? await listOrders() : await listStuckOrders(), filter: all ? 'all' : 'paid_not_delivered' };
  });

  app.post<{ Params: { id: string } }>('/api/admin/orders/:id/reissue', async (req, reply) => {
    const result = await reissue(req.params.id);
    if (result === 'not_found') return reply.code(404).send({ error: 'order_not_found' });
    return { result, order: await getOrderView(req.params.id) };
  });

  app.get('/api/admin/providers', async () => providerState());

  app.post('/api/admin/providers/config', async (req) => providerAdmin('config', req.body));

  app.post('/api/admin/providers/refill', async (req) => providerAdmin('refill', req.body));

  app.post('/api/admin/providers/drain', async (req) => providerAdmin('drain', req.body));

  /**
   * Сброс демо-состояния: заказы, события и выдачи стираются, расход промокодов
   * обнуляется, пулы поставщиков возвращаются в исходные 50 ключей.
   * Каталог и определения промокодов трогать незачем — они не мутируются.
   */
  app.post('/api/admin/reset', async () => {
    await query('TRUNCATE issuances, payment_events, orders RESTART IDENTITY');
    await query('UPDATE promocodes SET used_count = 0');
    const providers = await providerAdmin('reset');
    console.log('[admin] состояние сброшено');
    return { ok: true, providers };
  });
}
