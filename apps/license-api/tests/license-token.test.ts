import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSigningKeyPair, loadPrivateKey, loadPublicKey } from '../src/lib/crypto.ts';
import { checkToken, issueToken, isAllowedInRestrictedMode, TOKEN_ERRORS } from '../src/lib/license-token.ts';
import type { LicenseTokenPayload } from '../src/lib/license-token.ts';

const pair = generateSigningKeyPair();
const priv = loadPrivateKey(pair.privateKeyPem);
const pub = loadPublicKey(pair.publicKeyPem);

const payload: LicenseTokenPayload = {
  lic: 'lic-1', dev: 'GERAET1', plan: 'yearly', feat: ['invoices'],
  exp: '2027-01-01T00:00:00.000Z', iat: '2026-07-01T00:00:00.000Z',
  nonce: 'n'.repeat(32), graceDays: 7, checkIntervalH: 24,
};

const base = { expectedDeviceId: 'GERAET1', lastOnlineAt: '2026-07-26T00:00:00.000Z', now: '2026-07-26T06:00:00.000Z' };

test('ein frisches Token wird akzeptiert', () => {
  const result = checkToken(issueToken(payload, priv), pub, base);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.plan, 'yearly');
    assert.equal(result.warnOffline, false);
  }
});

test('manipulierte Nutzlast faellt durch die Signaturpruefung', () => {
  const token = issueToken(payload, priv);
  const decoded = JSON.parse(Buffer.from(token.payload, 'base64url').toString());
  decoded.plan = 'lifetime';
  const forged = { payload: Buffer.from(JSON.stringify(decoded)).toString('base64url'), signature: token.signature };
  const result = checkToken(forged, pub, base);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, TOKEN_ERRORS.SIGNATURE);
});

test('ein Token fuer ein anderes Geraet gilt nicht', () => {
  const result = checkToken(issueToken(payload, priv), pub, { ...base, expectedDeviceId: 'ANDERES' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, TOKEN_ERRORS.DEVICE);
});

test('abgelaufene Lizenz wird erkannt', () => {
  const result = checkToken(issueToken(payload, priv), pub, {
    ...base, lastOnlineAt: '2027-01-05T00:00:00.000Z', now: '2027-01-05T00:00:00.000Z',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, TOKEN_ERRORS.EXPIRED);
});

test('unbefristete Lizenz laeuft nie ab', () => {
  const result = checkToken(issueToken({ ...payload, exp: null }, priv), pub, {
    ...base, lastOnlineAt: '2099-01-01T00:00:00.000Z', now: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(result.ok, true);
});

test('innerhalb der Offline-Toleranz bleibt die App voll nutzbar', () => {
  const result = checkToken(issueToken(payload, priv), pub, {
    ...base, lastOnlineAt: '2026-07-20T00:00:00.000Z', now: '2026-07-24T00:00:00.000Z',
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.warnOffline, false);
});

test('ab Tag 5 von 7 wird gewarnt, aber nicht gesperrt', () => {
  const result = checkToken(issueToken(payload, priv), pub, {
    ...base, lastOnlineAt: '2026-07-20T00:00:00.000Z', now: '2026-07-25T12:00:00.000Z',
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.warnOffline, true);
});

test('nach Ablauf der Toleranz greift der eingeschraenkte Modus', () => {
  const result = checkToken(issueToken(payload, priv), pub, {
    ...base, lastOnlineAt: '2026-07-10T00:00:00.000Z', now: '2026-07-26T00:00:00.000Z',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, TOKEN_ERRORS.GRACE);
});

test('Nonce-Bindung verhindert das Wiedereinspielen alter Antworten', () => {
  const result = checkToken(issueToken(payload, priv), pub, { ...base, expectedNonce: 'a'.repeat(32) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, TOKEN_ERRORS.NONCE);
});

test('im eingeschraenkten Modus bleiben Lesen und Export erlaubt', () => {
  assert.equal(isAllowedInRestrictedMode('invoices.read'), true);
  assert.equal(isAllowedInRestrictedMode('invoices.export'), true);
  assert.equal(isAllowedInRestrictedMode('backup.create'), true);
  assert.equal(isAllowedInRestrictedMode('invoices.finalize'), false);
  assert.equal(isAllowedInRestrictedMode('email.send'), false);
});
