import type { PrismaClient } from '@prisma/client';
import type { KeyObject } from 'node:crypto';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    signingKey: KeyObject;
  }
}
