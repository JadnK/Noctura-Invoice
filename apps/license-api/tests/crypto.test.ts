import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAccessToken, generateLicenseKey, generateSigningKeyPair, hashAdminToken,
  hashLicenseKey, keyPrefix, loadPrivateKey, loadPublicKey, normalizeKey,
  signPayload, verifyAdminToken, verifyPayload,
} from '../src/lib/crypto.ts';

const PEPPER = 'x'.repeat(48);

test('Lizenzschluessel haben ein stabiles Format ohne verwechselbare Zeichen', () => {
  for (let i = 0; i < 50; i++) {
    const key = generateLicenseKey();
    assert.match(key, /^NOCT-[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
    assert.equal(/[ILO01]/.test(key.slice(5)), false);
  }
});

test('Schluessel sind nicht vorhersagbar', () => {
  const keys = new Set(Array.from({ length: 500 }, () => generateLicenseKey()));
  assert.equal(keys.size, 500);
});

test('Tippfehler bei Gross- und Kleinschreibung fallen nicht auf die Fuesse', () => {
  const key = generateLicenseKey();
  assert.equal(
    hashLicenseKey(key, PEPPER),
    hashLicenseKey(` ${key.toLowerCase().replace(/-/g, ' ')} `, PEPPER),
  );
});

test('gleicher Schluessel mit anderem Pepper ergibt anderen Hash', () => {
  const key = generateLicenseKey();
  assert.notEqual(hashLicenseKey(key, PEPPER), hashLicenseKey(key, 'y'.repeat(48)));
});

test('ein zu kurzer Pepper wird abgelehnt', () => {
  assert.throws(() => hashLicenseKey('NOCT-AAAAA', 'kurz'), /LICENSE_KEY_PEPPER/);
});

test('Praefix ist stabil und kurz genug fuer die Anzeige', () => {
  assert.equal(keyPrefix('noct-abcde-fghij'), 'NOCTABCD');
  assert.equal(normalizeKey('noct-ab cd'), 'NOCTABCD');
});

test('Admin-Token wird gesalzen gehasht und korrekt geprueft', () => {
  const token = generateAccessToken(32);
  const stored = hashAdminToken(token);
  assert.equal(verifyAdminToken(token, stored), true);
  assert.equal(verifyAdminToken(`${token}x`, stored), false);
  assert.notEqual(hashAdminToken(token).hash, stored.hash, 'Salt muss je Aufruf neu sein');
});

test('Access-Token hat mindestens 32 Zufallsbytes', () => {
  const token = generateAccessToken(32);
  assert.ok(Buffer.from(token, 'base64url').length >= 32);
});

test('Ed25519-Signatur haelt und faellt korrekt', () => {
  const pair = generateSigningKeyPair();
  const priv = loadPrivateKey(pair.privateKeyPem);
  const pub = loadPublicKey(pair.publicKeyPem);
  const signature = signPayload('nutzlast', priv);
  assert.equal(verifyPayload('nutzlast', signature, pub), true);
  assert.equal(verifyPayload('nutzlast!', signature, pub), false);
  assert.equal(verifyPayload('nutzlast', 'AAAA', pub), false);
});

test('ein fremder Schluessel kann keine gueltige Signatur erzeugen', () => {
  const good = generateSigningKeyPair();
  const evil = generateSigningKeyPair();
  const signature = signPayload('token', loadPrivateKey(evil.privateKeyPem));
  assert.equal(verifyPayload('token', signature, loadPublicKey(good.publicKeyPem)), false);
});
