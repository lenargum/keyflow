import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/products', async () => {
    const res = await query(
      `SELECT sku, name, type, price_rub, image FROM products ORDER BY sku`,
    );
    return { products: res.rows };
  });
}
