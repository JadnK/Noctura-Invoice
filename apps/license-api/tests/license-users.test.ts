import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideCreateUser, decideDeleteUser, decideRegistration, normalizeEmail,
} from '../src/lib/license-users.ts';

test('der allererste Nutzer einer aktiven Lizenz wird Admin', () => {
  const result = decideRegistration('active', 0);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.role, 'admin');
});

test('eine Testlizenz erlaubt ebenfalls die erste Registrierung', () => {
  assert.equal(decideRegistration('trial', 0).ok, true);
});

test('eine zweite offene Registrierung wird abgelehnt', () => {
  const result = decideRegistration('active', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'ALREADY_HAS_USERS');
});

test('gesperrte oder abgelaufene Lizenzen lassen keine Registrierung zu', () => {
  for (const status of ['blocked', 'expired', 'archived']) {
    const result = decideRegistration(status, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'LICENSE_NOT_ACTIVE');
  }
});

const admin = { id: 'a1', role: 'admin' as const, active: true, licenseId: 'lic-1' };
const member = { id: 'm1', role: 'member' as const, active: true, licenseId: 'lic-1' };

test('ein Admin darf ein weiteres Konto in derselben Lizenz anlegen', () => {
  assert.equal(decideCreateUser(admin, 'lic-1', false).ok, true);
});

test('ein Mitglied darf keine Konten anlegen', () => {
  const result = decideCreateUser(member, 'lic-1', false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'NOT_ADMIN');
});

test('ein Admin kann keine Konten fuer eine fremde Lizenz anlegen', () => {
  const result = decideCreateUser(admin, 'lic-andere', false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'LICENSE_MISMATCH');
});

test('eine bereits vergebene E-Mail wird abgelehnt', () => {
  const result = decideCreateUser(admin, 'lic-1', true);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'EMAIL_TAKEN');
});

test('ein deaktivierter Admin darf keine Konten mehr anlegen', () => {
  const result = decideCreateUser({ ...admin, active: false }, 'lic-1', false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'NOT_ADMIN');
});

test('ein Admin darf ein Mitglied entfernen', () => {
  assert.equal(decideDeleteUser(admin, member, 1).ok, true);
});

test('ein Admin darf sich selbst entfernen, wenn ein weiterer Admin uebrig bleibt', () => {
  assert.equal(decideDeleteUser(admin, admin, 1).ok, true);
});

test('der letzte verbliebene Admin kann nicht entfernt werden', () => {
  const result = decideDeleteUser(admin, admin, 0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'LAST_ADMIN');
});

test('ein Mitglied darf niemanden entfernen', () => {
  const result = decideDeleteUser(member, member, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'NOT_ADMIN');
});

test('Konten ueber Lizenzgrenzen hinweg zu entfernen wird verweigert', () => {
  const foreignTarget = { ...member, licenseId: 'lic-andere' };
  const result = decideDeleteUser(admin, foreignTarget, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'LICENSE_MISMATCH');
});

test('E-Mail-Normalisierung ist gross-/kleinschreibungsunabhaengig', () => {
  assert.equal(normalizeEmail('  Buchhaltung@Musterfirma.DE '), 'buchhaltung@musterfirma.de');
});
