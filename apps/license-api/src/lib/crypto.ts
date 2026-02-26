/**
 * Kryptografie der Lizenz-API. Ausschliesslich Node-Kernmodule.
 *
 * Zwei verschiedene Aufgaben, zwei verschiedene Verfahren:
 *  - Lizenzschluessel muessen anhand des Hashes gefunden werden. Ein Salt pro
 *    Datensatz waere hier unbrauchbar, deshalb HMAC-SHA-256 mit serverseitigem
 *    Pepper: deterministisch, aber ohne Kenntnis des Peppers nicht nachrechenbar.
 *  - Der Admin-Access-Token wird gegen genau einen gespeicherten Wert geprueft.
 *    Dort ist scrypt mit Zufallssalt richtig.
 */
import {
  createHmac, createPrivateKey, createPublicKey, generateKeyPairSync,
  randomBytes, scryptSync, sign as edSign, timingSafeEqual, verify as edVerify,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';

const BASE32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne I, L, O, 0, 1

function toBase32(buffer: Buffer): string {
  let out = '';
  for (const byte of buffer) out += BASE32[byte % BASE32.length];
  return out;
}

/** Lizenzschluessel im Format NOCT-XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateLicenseKey(prefix = 'NOCT'): string {
  const groups = Array.from({ length: 4 }, () => toBase32(randomBytes(5)));
  return [prefix, ...groups].join('-');
}

/** Eingabefehler abfangen: Kleinschreibung, fehlende Bindestriche, Leerzeichen. */
export function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Deterministischer Hash zum Nachschlagen. Pepper liegt nur in der Serverumgebung. */
export function hashLicenseKey(key: string, pepper: string): string {
  if (pepper.length < 32) {
    throw new Error('LICENSE_KEY_PEPPER muss mindestens 32 Zeichen haben.');
  }
  return createHmac('sha256', pepper).update(normalizeKey(key)).digest('hex');
}

export function keyPrefix(key: string): string {
  return normalizeKey(key).slice(0, 8);
}

export interface HashedSecret {
  readonly salt: string;
  readonly hash: string;
}

/** Admin-Token: scrypt, N=2^15. Rueckgabe wird in der Datenbank abgelegt. */
export function hashAdminToken(token: string): HashedSecret {
  const salt = randomBytes(16);
  const hash = scryptSync(token, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifyAdminToken(token: string, stored: HashedSecret): boolean {
  const salt = Buffer.from(stored.salt, 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  const actual = scryptSync(token, salt, expected.length, {
    N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Mindestens 32 Zufallsbytes, base64url — fuer Access-Token und Sessions. */
export function generateAccessToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export interface SigningKeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

export function generateSigningKeyPair(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function loadPublicKey(pem: string): KeyObject {
  return createPublicKey(pem);
}

/** Ed25519-Signatur ueber die kanonische Bytefolge des Tokens. */
export function signPayload(payload: string, privateKey: KeyObject): string {
  return edSign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64url');
}

export function verifyPayload(payload: string, signature: string, publicKey: KeyObject): boolean {
  try {
    return edVerify(null, Buffer.from(payload, 'utf8'), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

/** IP-Adressen werden nur als Hash protokolliert. */
export function hashIp(ip: string, pepper: string): string {
  return createHmac('sha256', pepper).update(ip).digest('hex').slice(0, 32);
}
