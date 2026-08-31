import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/**
 * Статический bearer-токен на весь контекст плагина. Пользовательской
 * авторизации в задании нет; админка и мутирующие QA-ручки закрыты одним хуком.
 *
 * Сам вебхук платёжки намеренно открыт: подпись задание проверять не требует,
 * а токена у платёжной системы нет.
 */
export function requireAdminToken(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers.authorization !== `Bearer ${config.adminToken}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
