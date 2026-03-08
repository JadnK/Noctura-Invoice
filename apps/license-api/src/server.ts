/**
 * Einstiegspunkt der Lizenz-API.
 *
 * Der Server startet nur, wenn alle Geheimnisse vorhanden sind. Ein fehlender
 * Signaturschluessel ist ein Startfehler, kein Warnhinweis — ein Server, der
 * ungeprueft Tokens ausgibt, waere schlimmer als einer, der nicht laeuft.
 */
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { loadPrivateKey } from './lib/crypto.ts';
import { ApiError } from './lib/errors.ts';
import { registerLicenseRoutes } from './routes/licenses.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerHealthRoutes } from './routes/health.ts';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'LICENSE_KEY_PEPPER',
  'IP_HASH_PEPPER',
  'SIGNING_PRIVATE_KEY_FILE',
  'PUBLIC_BASE_URL',
] as const;

function readEnv(): Record<string, string> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  }
  return Object.fromEntries(REQUIRED_ENV.map((k) => [k, process.env[k] as string]));
}

export async function build() {
  const env = readEnv();
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Der Access-Token und Lizenzschluessel duerfen nie im Log landen.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body.key', 'req.body.token'],
    },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cookie, { secret: false });
  await app.register(rateLimit, {
    global: false,
    redis: process.env.REDIS_URL ? new (await import('ioredis')).default(process.env.REDIS_URL) : undefined,
  });

  const prisma = new PrismaClient();
  const privateKey = loadPrivateKey(readFileSync(env.SIGNING_PRIVATE_KEY_FILE, 'utf8'));
  const basePath = process.env.API_BASE_PATH ?? '/api/v1';

  app.decorate('prisma', prisma);
  app.decorate('signingKey', privateKey);

  await app.register(registerHealthRoutes);
  await app.register(registerLicenseRoutes, { prefix: `${basePath}/licenses` });
  await app.register(registerAdminRoutes, { prefix: `${basePath}/admin` });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      request.log.warn({ code: error.code, id: error.id }, 'Fachlicher Fehler');
      return reply.status(error.status).send(error.toResponse());
    }
    const wrapped = new ApiError('INTERNAL', 500);
    request.log.error({ err: error, id: wrapped.id }, 'Unerwarteter Fehler');
    return reply.status(500).send(wrapped.toResponse());
  });

  app.addHook('onClose', async () => { await prisma.$disconnect(); });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await build();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}
