/**
 * Admin-Endpunkte. Zugang ueber Login-Formular mit Access-Token, danach
 * HttpOnly-Session-Cookie. Der Token wandert nie in den Browser-Storage und
 * nie in eine URL.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { adminLoginSchema, blockLicenseSchema, createLicenseSchema, extendLicenseSchema } from '../lib/schemas.ts';
import { generateLicenseKey, hashLicenseKey, keyPrefix, verifyAdminToken } from '../lib/crypto.ts';
import { PLAN_DEFAULTS } from '../lib/activation.ts';
import { ApiError } from '../lib/errors.ts';

const SESSION_COOKIE = 'noctura_admin';
const SESSION_TTL_MINUTES = 60;

function sessionHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const pepper = process.env.LICENSE_KEY_PEPPER as string;

  async function requireSession(request: FastifyRequest): Promise<string> {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) throw new ApiError('AUTH_REQUIRED', 401);
    const session = await app.prisma.adminSession.findUnique({ where: { tokenHash: sessionHash(raw) } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new ApiError('AUTH_REQUIRED', 401);
    }
    // Nicht-GET-Anfragen brauchen zusaetzlich den CSRF-Header.
    if (request.method !== 'GET' && request.headers['x-csrf-token'] !== session.csrfToken) {
      throw new ApiError('AUTH_REQUIRED', 403);
    }
    return session.id;
  }

  app.post('/session', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);

    const setting = await app.prisma.serverSetting.findUnique({ where: { key: 'admin_token' } });
    if (!setting) throw new ApiError('AUTH_INVALID', 401);
    const stored = setting.valueJson as { salt: string; hash: string };
    if (!verifyAdminToken(parsed.data.token, stored)) throw new ApiError('AUTH_INVALID', 401);

    const raw = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    await app.prisma.adminSession.create({
      data: {
        tokenHash: sessionHash(raw),
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60_000),
      },
    });

    return reply
      .setCookie(SESSION_COOKIE, raw, {
        httpOnly: true, secure: true, sameSite: 'strict', path: '/',
        maxAge: SESSION_TTL_MINUTES * 60,
      })
      .send({ csrfToken, expiresInMinutes: SESSION_TTL_MINUTES });
  });

  app.delete('/session', async (request, reply) => {
    const id = await requireSession(request);
    await app.prisma.adminSession.update({ where: { id }, data: { revokedAt: new Date() } });
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true });
  });

  app.get('/licenses', async (request, reply) => {
    await requireSession(request);
    const licenses = await app.prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { owner: true, _count: { select: { devices: true } } },
    });
    return reply.send({ licenses });
  });

  app.post('/licenses', async (request, reply) => {
    await requireSession(request);
    const parsed = createLicenseSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const input = parsed.data;
    const defaults = PLAN_DEFAULTS[input.plan];

    // Der Klartextschluessel existiert genau in dieser Antwort. Danach nur noch Hash und Praefix.
    const key = generateLicenseKey();
    const owner = await app.prisma.licenseOwner.upsert({
      where: { email: input.ownerEmail },
      create: { email: input.ownerEmail, name: input.ownerName },
      update: { name: input.ownerName },
    });

    const license = await app.prisma.license.create({
      data: {
        keyHash: hashLicenseKey(key, pepper),
        keyPrefix: keyPrefix(key),
        product: 'noctura-invoice',
        plan: input.plan,
        status: input.plan === 'trial' ? 'trial' : 'active',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        maxDevices: input.maxDevices ?? defaults.maxDevices,
        ownerId: owner.id,
        note: input.note,
        features: { create: (input.features ?? defaults.features).map((code) => ({ featureCode: code })) },
      },
    });

    return reply.status(201).send({ license, key });
  });

  app.post('/licenses/:id/block', async (request, reply) => {
    await requireSession(request);
    const parsed = blockLicenseSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const { id } = request.params as { id: string };
    const license = await app.prisma.license.update({
      where: { id },
      data: { status: 'blocked', blockedReason: parsed.data.reason },
    });
    return reply.send({ license });
  });

  app.post('/licenses/:id/unblock', async (request, reply) => {
    await requireSession(request);
    const { id } = request.params as { id: string };
    return reply.send({
      license: await app.prisma.license.update({ where: { id }, data: { status: 'active', blockedReason: null } }),
    });
  });

  app.post('/licenses/:id/extend', async (request, reply) => {
    await requireSession(request);
    const parsed = extendLicenseSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const { id } = request.params as { id: string };
    return reply.send({
      license: await app.prisma.license.update({
        where: { id },
        data: { expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, status: 'active' },
      }),
    });
  });

  app.post('/licenses/:id/reset-devices', async (request, reply) => {
    await requireSession(request);
    const { id } = request.params as { id: string };
    const result = await app.prisma.licenseDevice.updateMany({
      where: { licenseId: id, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });
    return reply.send({ deactivated: result.count });
  });

  app.get('/stats', async (request, reply) => {
    await requireSession(request);
    const [total, active, expired, blocked, trial, devices] = await Promise.all([
      app.prisma.license.count(),
      app.prisma.license.count({ where: { status: 'active' } }),
      app.prisma.license.count({ where: { status: 'expired' } }),
      app.prisma.license.count({ where: { status: 'blocked' } }),
      app.prisma.license.count({ where: { status: 'trial' } }),
      app.prisma.licenseDevice.count({ where: { deactivatedAt: null } }),
    ]);
    return reply.send({ total, active, expired, blocked, trial, devices });
  });
}
