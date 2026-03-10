/**
 * Rotation des Admin-Access-Tokens.
 *   docker compose exec license-api npm run admin-token:rotate
 *
 * Der neue Token wird einmal ausgegeben und in die Token-Datei geschrieben.
 * Bestehende Sessions werden widerrufen, sofern nicht --keep-sessions gesetzt ist.
 */
import { PrismaClient } from '@prisma/client';
import { announceToken, createAndPersistToken } from '../src/lib/admin-token.ts';

const keepSessions = process.argv.includes('--keep-sessions');
const prisma = new PrismaClient();

const result = await createAndPersistToken();
await prisma.serverSetting.upsert({
  where: { key: 'admin_token' },
  create: { key: 'admin_token', valueJson: result.stored },
  update: { valueJson: result.stored },
});

if (!keepSessions) {
  const revoked = await prisma.adminSession.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(`  ${revoked.count} aktive Sitzung(en) widerrufen.`);
}

announceToken(result, (line) => console.log(line));
await prisma.$disconnect();
