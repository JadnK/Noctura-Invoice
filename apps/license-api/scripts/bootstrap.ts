/**
 * Startskript des Containers: Migrationen anwenden, Signaturschluessel und
 * Admin-Token beim ersten Start erzeugen, danach den Server starten.
 *
 * Idempotent: ein erneuter Start erzeugt weder neuen Schluessel noch neuen Token.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateSigningKeyPair, loadPublicKey } from '../src/lib/crypto.ts';
import { announceToken, createAndPersistToken } from '../src/lib/admin-token.ts';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();
const privatePath = process.env.SIGNING_PRIVATE_KEY_FILE ?? '/data/secrets/license-signing.key';
const publicPath = process.env.SIGNING_PUBLIC_KEY_FILE ?? '/data/secrets/license-signing.pub';

function ensureSigningKey(): void {
  if (existsSync(privatePath)) return;
  const pair = generateSigningKeyPair();
  mkdirSync(dirname(privatePath), { recursive: true, mode: 0o700 });
  writeFileSync(privatePath, pair.privateKeyPem, { mode: 0o600 });
  writeFileSync(publicPath, pair.publicKeyPem, { mode: 0o644 });
  chmodSync(privatePath, 0o600);

  const fingerprint = createHash('sha256').update(
    loadPublicKey(pair.publicKeyPem).export({ type: 'spki', format: 'der' }),
  ).digest('hex').slice(0, 32);

  console.log('  Signaturschluessel erzeugt.');
  console.log(`  Fingerabdruck: ${fingerprint}`);
  console.log(`  Oeffentlicher Schluessel: ${publicPath}`);
  console.log('  Dieser Schluessel muss in die Desktop-App eingebettet werden.');
  console.log('  Der private Schluessel verlaesst diesen Server nicht.');
}

async function ensureAdminToken(): Promise<void> {
  const existing = await prisma.serverSetting.findUnique({ where: { key: 'admin_token' } });
  if (existing) return;
  const result = await createAndPersistToken();
  await prisma.serverSetting.create({
    data: {
      key: 'admin_token',
      valueJson: result.stored,
    },
  });
  announceToken(result, (line) => console.log(line));
}

ensureSigningKey();
await ensureAdminToken();
await prisma.$disconnect();
