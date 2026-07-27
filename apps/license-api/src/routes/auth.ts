/**
 * Firmenkonten pro Lizenz.
 *
 * Getrennt vom Admin-Panel-Zugang (routes/admin.ts): dort verwaltet der
 * Betreiber Lizenzen, hier verwaltet die Firma hinter einer Lizenz ihre
 * eigenen Mitarbeiterkonten. Sessions laufen per Bearer-Token, nicht per
 * Cookie - die Gegenstelle ist die Desktop-App, kein Browser.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import {
  createLicenseUserSchema,
  loginLicenseUserSchema,
  registerLicenseUserSchema,
} from '../lib/schemas.ts';
import { hashLicenseKey, hashSecret, verifySecret } from '../lib/crypto.ts';
import {
  decideCreateUser,
  decideDeleteUser,
  decideRegistration,
  normalizeEmail,
} from '../lib/license-users.ts';
import { ApiError } from '../lib/errors.ts';

const SESSION_TTL_HOURS = 12;

function sessionHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

interface AuthedCaller {
  readonly id: string;
  readonly licenseId: string;
  readonly role: 'admin' | 'member';
  readonly active: boolean;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const pepper = process.env.LICENSE_KEY_PEPPER as string;

  async function requireUser(request: FastifyRequest): Promise<AuthedCaller> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError('AUTH_REQUIRED', 401);
    const token = header.slice('Bearer '.length);
    const session = await app.prisma.licenseUserSession.findUnique({
      where: { tokenHash: sessionHash(token) },
      include: { user: true },
    });
    if (
      !session
      || session.revokedAt
      || session.expiresAt < new Date()
      || !session.user.active
    ) {
      throw new ApiError('AUTH_REQUIRED', 401);
    }
    return {
      id: session.user.id,
      licenseId: session.user.licenseId,
      role: session.user.role,
      active: session.user.active,
    };
  }

  app.post(
    '/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const parsed = registerLicenseUserSchema.safeParse(request.body);
      if (!parsed.success) throw new ApiError('VALIDATION', 400);
      const input = parsed.data;

      const license = await app.prisma.license.findUnique({
        where: { keyHash: hashLicenseKey(input.licenseKey, pepper) },
      });
      if (!license) throw new ApiError('LIC_NOT_FOUND', 404);
      const existingCount = await app.prisma.licenseUser.count({
        where: { licenseId: license.id },
      });
      const decision = decideRegistration(license.status, existingCount);
      if (!decision.ok) {
        throw new ApiError(
          decision.code === 'LICENSE_NOT_ACTIVE' ? 'LIC_BLOCKED' : 'AUTH_ALREADY_REGISTERED',
          decision.code === 'LICENSE_NOT_ACTIVE' ? 403 : 409,
        );
      }
      const email = normalizeEmail(input.email);
      const secret = hashSecret(input.password);
      const user = await app.prisma.licenseUser.create({
        data: {
          licenseId: license.id,
          email,
          displayName: input.displayName,
          role: decision.role,
          passwordHash: secret.hash,
          passwordSalt: secret.salt,
        },
      });

      return reply.status(201).send({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      });
    },
  );

  app.post(
    '/login',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = loginLicenseUserSchema.safeParse(request.body);
      if (!parsed.success) throw new ApiError('VALIDATION', 400);
      const input = parsed.data;

      const license = await app.prisma.license.findUnique({
        where: { keyHash: hashLicenseKey(input.licenseKey, pepper) },
      });
      if (!license) throw new ApiError('AUTH_INVALID', 401);
      const email = normalizeEmail(input.email);
      const user = await app.prisma.licenseUser.findUnique({
        where: { licenseId_email: { licenseId: license.id, email } },
      });
      // Absichtlich dieselbe Fehlermeldung fuer "Konto existiert nicht" und
      // "Passwort falsch" - sonst liesse sich ueber die Fehlermeldung erraten,
      // welche E-Mail-Adressen bei einer fremden Lizenz registriert sind.
      if (
        !user
        || !user.active
        || !verifySecret(input.password, {
          hash: user.passwordHash,
          salt: user.passwordSalt,
        })
      ) {
        throw new ApiError('AUTH_INVALID', 401);
      }
      const raw = randomBytes(32).toString('base64url');
      await app.prisma.$transaction([
        app.prisma.licenseUserSession.create({
          data: {
            userId: user.id,
            tokenHash: sessionHash(raw),
            expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000),
          },
        }),
        app.prisma.licenseUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }),
      ]);
      return reply.send({
        token: raw,
        expiresInHours: SESSION_TTL_HOURS,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
        },
      });
    },
  );

  app.delete('/session', async (request, reply) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      await app.prisma.licenseUserSession.updateMany({
        where: {
          tokenHash: sessionHash(header.slice('Bearer '.length)),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return reply.send({ ok: true });
  });

  app.get('/me', async (request, reply) => {
    const caller = await requireUser(request);
    const user = await app.prisma.licenseUser.findUniqueOrThrow({
      where: { id: caller.id },
    });
    return reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      licenseId: user.licenseId,
    });
  });

  app.get('/users', async (request, reply) => {
    const caller = await requireUser(request);
    const users = await app.prisma.licenseUser.findMany({
      where: { licenseId: caller.licenseId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    return reply.send({ users });
  });

  app.post('/users', async (request, reply) => {
    const caller = await requireUser(request);
    const parsed = createLicenseUserSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError('VALIDATION', 400);
    const input = parsed.data;
    const email = normalizeEmail(input.email);
    const emailTaken = await app.prisma.licenseUser.findUnique({
      where: { licenseId_email: { licenseId: caller.licenseId, email } },
    });
    const decision = decideCreateUser(caller, caller.licenseId, emailTaken !== null);
    if (!decision.ok) {
      throw new ApiError(
        decision.code === 'NOT_ADMIN'
          ? 'AUTH_INVALID'
          : decision.code === 'EMAIL_TAKEN'
            ? 'AUTH_EMAIL_TAKEN'
            : 'VALIDATION',
        decision.code === 'NOT_ADMIN' ? 403 : 409,
      );
    }
    const secret = hashSecret(input.password);
    const user = await app.prisma.licenseUser.create({
      data: {
        licenseId: caller.licenseId,
        email,
        displayName: input.displayName,
        role: input.role,
        passwordHash: secret.hash,
        passwordSalt: secret.salt,
      },
    });
    return reply.status(201).send({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    });
  });

  app.delete('/users/:id', async (request, reply) => {
    const caller = await requireUser(request);
    const { id } = request.params as { id: string };
    const target = await app.prisma.licenseUser.findUnique({ where: { id } });
    if (!target) throw new ApiError('AUTH_INVALID', 404);
    const remainingAdmins = await app.prisma.licenseUser.count({
      where: {
        licenseId: target.licenseId,
        role: 'admin',
        active: true,
        id: { not: target.id },
      },
    });
    const decision = decideDeleteUser(
      caller,
      {
        id: target.id,
        role: target.role,
        active: target.active,
        licenseId: target.licenseId,
      },
      remainingAdmins,
    );
    if (!decision.ok) {
      throw new ApiError(
        decision.code === 'LAST_ADMIN' ? 'AUTH_LAST_ADMIN' : 'AUTH_INVALID',
        decision.code === 'LAST_ADMIN' ? 409 : 403,
      );
    }
    await app.prisma.licenseUser.update({
      where: { id: target.id },
      data: { active: false },
    });
    return reply.send({ deactivated: true });
  });
}
