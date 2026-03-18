/** Healthchecks. Ohne Auth, ohne Details, die einem Angreifer helfen. */
import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    const checks = { db: false, signingKey: false };
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch { /* bleibt false */ }
    checks.signingKey = app.signingKey !== undefined;
    const ready = Object.values(checks).every(Boolean);
    return reply.status(ready ? 200 : 503).send({ ready, checks });
  });
}
