import Fastify, { type FastifyInstance } from 'fastify';
import { productRoutes } from './routes/products.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { transport: undefined, level: process.env.LOG_LEVEL ?? 'info' },
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.register(productRoutes);

  return app;
}
