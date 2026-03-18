/**
 * Erzeugung und Rotation des Admin-Access-Tokens.
 *
 * Beim ersten Start erzeugt der Container einen Token, gibt ihn genau einmal im
 * Log aus und legt ihn zusaetzlich in einer restriktiv berechtigten Datei ab,
 * die per Volume auf dem Host liegt. In der Datenbank steht nur der scrypt-Hash.
 */
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateAccessToken, hashAdminToken } from './crypto.ts';
import type { HashedSecret } from './crypto.ts';

export const TOKEN_FILE = process.env.ADMIN_TOKEN_FILE ?? '/data/secrets/admin-access-token';

export interface TokenBootstrapResult {
  readonly token: string;
  readonly stored: HashedSecret;
  readonly path: string;
}

export async function createAndPersistToken(path = TOKEN_FILE): Promise<TokenBootstrapResult> {
  const token = generateAccessToken(32);
  const stored = hashAdminToken(token);

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);

  return { token, stored, path };
}

/** Ausgabe genau einmal, danach nie wieder in Logs. */
export function announceToken(result: TokenBootstrapResult, log: (line: string) => void): void {
  log('');
  log('  Noctura Lizenzserver — Admin-Access-Token erzeugt');
  log('  ------------------------------------------------');
  log(`  ${result.token}`);
  log('');
  log(`  Ebenfalls abgelegt unter ${result.path} (Rechte 0600).`);
  log('  Dieser Token erscheint nicht erneut im Log. Sicher aufbewahren.');
  log('  Rotation: docker compose exec license-api npm run admin-token:rotate');
  log('');
}
