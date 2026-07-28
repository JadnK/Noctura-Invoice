/**
 * Rotation des Admin-Access-Tokens.
 *   docker compose exec license-api npm run admin-token:rotate
 *
 * Der neue Token wird einmal ausgegeben und in die Token-Datei geschrieben.
 * Bestehende Sessions werden widerrufen, sofern nicht --keep-sessions gesetzt ist.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { announceToken, createAndPersistToken } from '../src/lib/admin-token.ts';

const keepSessions = process.argv.includes('--keep-sessions');
const prisma = new PrismaClient();
const result = await createAndPersistToken();

// Prisma-JSON-Felder akzeptieren keine beliebige benannte Interface-Instanz.
// Durch das explizite JSON-Objekt bleiben nur die beiden Stringwerte erhalten.
const storedJson: Prisma.InputJsonObject = {
  salt: result.stored.salt,
  hash: result.stored.hash,
};

await prisma.serverSetting.upsert({
  where: { key: 'admin_token' },
  create: { key: 'admin_token', valueJson: storedJson },
  update: { valueJson: storedJson },
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
