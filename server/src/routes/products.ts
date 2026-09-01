import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { preview } from '../services/promo.js';

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/products', async () => {
    const res = await query(
      `SELECT sku, name, type, price_rub, image FROM products ORDER BY sku`,
    );
    return { products: res.rows };
  });

  /**
   * Предпросмотр скидки: ручка только читает, использование промокода не тратит.
   *
   * Открыта без токена намеренно — это часть витрины. Ответ не обязательство:
   * окончательную сумму считает POST /api/orders, он же атомарно списывает
   * использование и вправе отказать, если лимит исчерпали между запросами.
   */
  app.post<{ Body: { code?: string } }>('/api/promocodes/preview', async (req, reply) => {
    const code = req.body?.code?.trim().toUpperCase();
    if (!code) return reply.code(400).send({ error: 'code_required' });
    return preview(code);
  });
}
