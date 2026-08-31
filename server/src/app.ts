import Fastify, { type FastifyInstance } from 'fastify';
import { orderRoutes } from './routes/orders.js';
import { productRoutes } from './routes/products.js';
import { qaRoutes } from './routes/qa.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ ok: true }));
  app.register(productRoutes);
  app.register(orderRoutes);
  app.register(webhookRoutes);
  app.register(qaRoutes);

  return app;
}
