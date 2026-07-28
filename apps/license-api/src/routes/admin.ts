/**
 * Admin-Endpunkte. Zugang ueber Login-Formular mit Access-Token, danach
 * HttpOnly-Session-Cookie. Der Token wandert nie in den Browser-Storage und
 * nie in eine URL.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import {
  adminAuditLogQuerySchema,
  adminLoginSchema,
  blockLicenseSchema,
  createLicenseSchema,
  extendLicenseSchema,
} from '../lib/schemas.ts';
import { generateLicenseKey, hashIp, hashLicenseKey, keyPrefix, verifyAdminToken } from '../lib/crypto.ts';
import { PLAN_DEFAULTS } from '../lib/activation.ts';
import { ApiError } from '../lib/errors.ts';
const SESSION_COOKIE = 'noctura_admin';
const SESSION_TTL_MINUTES = 60;

function sessionHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const pepper = process.env.LICENSE_KEY_PEPPER as string;
  const ipPepper = process.env.IP_HASH_PEPPER as string;

  /**
   * Protokolliert eine administrative Aenderung im AdminAuditLog. Die
   * eigentliche Admin-Aktion ist zu diesem Zeitpunkt bereits abgeschlossen -
   * ein Fehler beim Schreiben des Logs darf sie deshalb nicht rueckwirkend
   * scheitern lassen, sonst wuerde ein reines Protokollierungsproblem eine
   * erfolgreiche Lizenzaenderung als Fehler an den Admin melden.
   */
  async function writeAuditLog(
    request: FastifyRequest,
    entry: {
      actor: string;
      action: string;
      objectType: string;
      objectId: string | null;
      diffJson?: Prisma.InputJsonValue | null;
    },
  ): Promise<void> {
    try {
      await app.prisma.adminAuditLog.create({
        data: {
          actor: entry.actor,
          action: entry.action,
          objectType: entry.objectType,
          objectId: entry.objectId,
          diffJson: entry.diffJson ?? undefined,
          ipHash: hashIp(request.ip, ipPepper),
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Audit-Log konnte nicht geschrieben werden');
    }
  }

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
  app.get('/session', async (request, reply) => {
    const id = await requireSession(request);
    const session = await app.prisma.adminSession.findUnique({
      where: { id },
      select: { csrfToken: true, expiresAt: true },
    });
    if (!session) throw new ApiError('AUTH_REQUIRED', 401);

    return reply.send({
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    });
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
  app.get('/licenses/:id', async (request, reply) => {
    await requireSession(request);
    const { id } = request.params as { id: string };
    const license = await app.prisma.license.findUnique({
      where: { id },
      include: {
        owner: true,
        features: true,
        devices: { orderBy: { lastSeenAt: 'desc' } },
        users: {
          select: { id: true, email: true, displayName: true, role: true, active: true, createdAt: true, lastLoginAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!license) throw new ApiError('LIC_NOT_FOUND', 404);
    return reply.send({ license });
  });
  app.post('/licenses', async (request, reply) => {
    const actor = await requireSession(request);
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
    // Nie den Klartextschluessel im Audit-Log ablegen - nur Plan und Geraetelimit.
    await writeAuditLog(request, {
      actor,
      action: 'license.create',
      objectType: 'license',
      objectId: license.id,
      diffJson: { plan: license.plan, maxDevices: license.maxDevices },
    });
    return reply.status(201).send({ license, key });
  });

  app.post('/licenses/:id/block', async (request, reply) => {
    const actor = await requireSession(request);
    const parsed = blockLicenseSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const { id } = request.params as { id: string };
    const license = await app.prisma.license.update({
      where: { id },
      data: { status: 'blocked', blockedReason: parsed.data.reason },
    });
    // Alle Firmenkonten dieser Lizenz sofort ausloggen. Ohne das koennten
    // bereits angemeldete Personen mit ihrem noch gueltigen Sitzungs-Token
    // weiterarbeiten, obwohl die Lizenz gerade gesperrt wurde - die Sperre
    // waere dann bis zum naechsten eigenstaendigen Ablauf der Sitzung
    // wirkungslos.
    await app.prisma.licenseUserSession.updateMany({
      where: { revokedAt: null, user: { licenseId: id } },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(request, {
      actor,
      action: 'license.block',
      objectType: 'license',
      objectId: id,
      diffJson: { reason: parsed.data.reason },
    });
    return reply.send({ license });
  });

  app.post('/licenses/:id/unblock', async (request, reply) => {
    const actor = await requireSession(request);
    const { id } = request.params as { id: string };
    const license = await app.prisma.license.update({
      where: { id },
      data: { status: 'active', blockedReason: null },
    });
    await writeAuditLog(request, {
      actor,
      action: 'license.unblock',
      objectType: 'license',
      objectId: id,
      diffJson: { status: license.status },
    });
    return reply.send({ license });
  });
  app.post('/licenses/:id/extend', async (request, reply) => {
    const actor = await requireSession(request);
    const parsed = extendLicenseSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const { id } = request.params as { id: string };
    const license = await app.prisma.license.update({
      where: { id },
      data: { expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, status: 'active' },
    });
    await writeAuditLog(request, {
      actor,
      action: 'license.extend',
      objectType: 'license',
      objectId: id,
      diffJson: { expiresAt: parsed.data.expiresAt },
    });
    return reply.send({ license });
  });
  app.post('/licenses/:id/reset-devices', async (request, reply) => {
    const actor = await requireSession(request);
    const { id } = request.params as { id: string };
    const result = await app.prisma.licenseDevice.updateMany({
      where: { licenseId: id, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });
    await writeAuditLog(request, {
      actor,
      action: 'license.reset-devices',
      objectType: 'license',
      objectId: id,
      diffJson: { deactivated: result.count },
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

  app.get('/owners', async (request, reply) => {
    await requireSession(request);
    const owners = await app.prisma.licenseOwner.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { licenses: true } },
        licenses: {
          select: { id: true, plan: true, status: true, expiresAt: true },
        },
      },
    });
    return reply.send({
      owners: owners.map((owner) => ({
        id: owner.id,
        name: owner.name,
        email: owner.email,
        note: owner.note,
        createdAt: owner.createdAt.toISOString(),
        licenseCount: owner._count.licenses,
        licenses: owner.licenses.map((license) => ({
          id: license.id,
          plan: license.plan,
          status: license.status,
          expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
        })),
      })),
    });
  });

  app.get('/audit-log', async (request, reply) => {
    await requireSession(request);
    const parsed = adminAuditLogQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const limit = parsed.data.limit ?? 50;
    const entries = await app.prisma.adminAuditLog.findMany({
      orderBy: { at: 'desc' },
      take: limit + 1,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    });
    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;
    return reply.send({
      entries: page.map((entry) => ({
        id: entry.id,
        at: entry.at.toISOString(),
        actor: entry.actor,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId,
        diffJson: entry.diffJson,
        ipHash: entry.ipHash,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  });
}
