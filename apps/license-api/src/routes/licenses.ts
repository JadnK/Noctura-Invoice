/** Oeffentliche Lizenzendpunkte. */
import type { FastifyInstance } from 'fastify';
import { activateSchema, deactivateDeviceSchema, heartbeatSchema, validateSchema } from '../lib/schemas.ts';
import { hashIp, hashLicenseKey } from '../lib/crypto.ts';
import { checkReplay, MemoryNonceStore } from '../lib/replay.ts';
import { decideActivation, PLAN_DEFAULTS } from '../lib/activation.ts';
import { issueToken } from '../lib/license-token.ts';
import { ApiError } from '../lib/errors.ts';

export async function registerLicenseRoutes(app: FastifyInstance): Promise<void> {
  const nonceStore = new MemoryNonceStore(); // in Produktion Redis-Implementierung
  const pepper = process.env.LICENSE_KEY_PEPPER as string;
  const ipPepper = process.env.IP_HASH_PEPPER as string;

  app.post('/activate', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = activateSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400, { issues: parsed.error.issues.map((i) => i.path.join('.')) });
    const input = parsed.data;

    const replay = await checkReplay(nonceStore, input.nonce, input.ts, Date.now());
    if (!replay.ok) throw new ApiError(replay.code, 400);

    const keyHash = hashLicenseKey(input.key, pepper);
    const license = await app.prisma.license.findUnique({
      where: { keyHash },
      include: { devices: true, features: true },
    });

    const ipHash = hashIp(request.ip, ipPepper);
    if (!license) {
      // Fehlversuche werden protokolliert, damit Rateraktionen sichtbar werden.
      await app.prisma.licenseActivation.create({
        data: { licenseId: null, deviceId: input.deviceId, ipHash, result: 'not_found', reason: 'unknown_key' },
      });
      throw new ApiError('LIC_NOT_FOUND', 404);
    }

    const nowIso = new Date().toISOString();
    const decision = decideActivation(
      {
        id: license.id,
        status: license.status as never,
        plan: license.plan,
        features: license.features.map((f) => f.featureCode),
        expiresAt: license.expiresAt?.toISOString() ?? null,
        maxDevices: license.maxDevices,
        blockedReason: license.blockedReason,
      },
      license.devices.map((d) => ({ deviceId: d.deviceId, deactivatedAt: d.deactivatedAt?.toISOString() ?? null })),
      input.deviceId,
      nowIso,
    );

    if (!decision.ok) {
      await app.prisma.licenseActivation.create({
        data: { licenseId: license.id, deviceId: input.deviceId, ipHash, result: 'denied', reason: decision.code },
      });
      throw new ApiError(decision.code, decision.code === 'LIC_DEVICE_LIMIT' ? 409 : 403, decision.detail);
    }

    const defaults = PLAN_DEFAULTS[license.plan] ?? PLAN_DEFAULTS.monthly;
    await app.prisma.$transaction([
      app.prisma.licenseDevice.upsert({
        where: { licenseId_deviceId: { licenseId: license.id, deviceId: input.deviceId } },
        create: { licenseId: license.id, deviceId: input.deviceId, appVersion: input.appVersion, os: input.os },
        update: { lastSeenAt: new Date(), appVersion: input.appVersion },
      }),
      app.prisma.licenseActivation.create({
        data: { licenseId: license.id, deviceId: input.deviceId, ipHash, result: 'granted', reason: null },
      }),
      app.prisma.license.update({ where: { id: license.id }, data: { lastSeenAt: new Date(), activatedAt: license.activatedAt ?? new Date() } }),
    ]);

    const token = issueToken({
      lic: license.id,
      dev: input.deviceId,
      plan: license.plan,
      feat: license.features.map((f) => f.featureCode),
      exp: license.expiresAt?.toISOString() ?? null,
      iat: nowIso,
      nonce: input.nonce,
      graceDays: defaults.graceDays,
      checkIntervalH: defaults.checkIntervalH,
    }, app.signingKey);

    return reply.send({ ...token, expiresAt: license.expiresAt, features: license.features.map((f) => f.featureCode) });
  });

  app.post('/heartbeat', {
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const input = parsed.data;

    const replay = await checkReplay(nonceStore, input.nonce, input.ts, Date.now());
    if (!replay.ok) throw new ApiError(replay.code, 400);

    // Das vom Geraet mitgeschickte "token" ist nur die Nutzlast (kein
    // Signaturteil) - sie stammt aus einer frueheren, vom Server signierten
    // Antwort und dient hier ausschliesslich dazu, die Lizenz zu finden, ohne
    // dass das Geraet bei jedem Heartbeat erneut den Lizenzschluessel
    // mitschicken muss. Autorisiert wird nicht ueber diese Nutzlast, sondern
    // ueber den Abgleich mit einem tatsaechlich fuer diese Lizenz aktivierten
    // Geraet in der Datenbank (siehe deviceRecord unten).
    let decoded: { lic?: unknown; dev?: unknown };
    try {
      decoded = JSON.parse(Buffer.from(input.token, 'base64url').toString('utf8'));
    } catch {
      throw new ApiError('VALIDATION', 400);
    }
    if (typeof decoded.lic !== 'string' || typeof decoded.dev !== 'string' || decoded.dev !== input.deviceId) {
      throw new ApiError('VALIDATION', 400);
    }

    const license = await app.prisma.license.findUnique({
      where: { id: decoded.lic },
      include: { devices: true, features: true },
    });
    if (!license) throw new ApiError('LIC_NOT_FOUND', 404);

    // Gleiche Pruefkette wie bei /activate (Status, Ablauf, Geraet), ohne ein
    // neues Geraet anzulegen: ein Geraet, das dieser Lizenz nie zugeordnet
    // war, gilt hier als abgelehnt statt - wie bei /activate - als neu
    // hinzuzufuegen.
    const deviceRecord = license.devices.find((d) => d.deviceId === input.deviceId);
    if (!deviceRecord) throw new ApiError('LIC_DEVICE_DEACTIVATED', 403);

    const nowIso = new Date().toISOString();
    const decision = decideActivation(
      {
        id: license.id,
        status: license.status as never,
        plan: license.plan,
        features: license.features.map((f) => f.featureCode),
        expiresAt: license.expiresAt?.toISOString() ?? null,
        maxDevices: license.maxDevices,
        blockedReason: license.blockedReason,
      },
      license.devices.map((d) => ({ deviceId: d.deviceId, deactivatedAt: d.deactivatedAt?.toISOString() ?? null })),
      input.deviceId,
      nowIso,
    );
    if (!decision.ok) throw new ApiError(decision.code, decision.code === 'LIC_DEVICE_LIMIT' ? 409 : 403, decision.detail);

    await app.prisma.$transaction([
      app.prisma.license.update({ where: { id: license.id }, data: { lastSeenAt: new Date() } }),
      app.prisma.licenseDevice.update({
        where: { licenseId_deviceId: { licenseId: license.id, deviceId: input.deviceId } },
        data: { lastSeenAt: new Date(), appVersion: input.appVersion },
      }),
    ]);

    const defaults = PLAN_DEFAULTS[license.plan] ?? PLAN_DEFAULTS.monthly;
    const token = issueToken({
      lic: license.id,
      dev: input.deviceId,
      plan: license.plan,
      feat: license.features.map((f) => f.featureCode),
      exp: license.expiresAt?.toISOString() ?? null,
      iat: nowIso,
      nonce: input.nonce,
      graceDays: defaults.graceDays,
      checkIntervalH: defaults.checkIntervalH,
    }, app.signingKey);

    return reply.send({ ...token, expiresAt: license.expiresAt, features: license.features.map((f) => f.featureCode) });
  });

  app.post('/validate', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = validateSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    return reply.send({ valid: true });
  });

  app.post('/deactivate-device', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = deactivateDeviceSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const license = await app.prisma.license.findUnique({ where: { keyHash: hashLicenseKey(parsed.data.key, pepper) } });
    if (!license) throw new ApiError('LIC_NOT_FOUND', 404);
    await app.prisma.licenseDevice.update({
      where: { licenseId_deviceId: { licenseId: license.id, deviceId: parsed.data.deviceId } },
      data: { deactivatedAt: new Date() },
    });
    return reply.send({ deactivated: true });
  });
}
