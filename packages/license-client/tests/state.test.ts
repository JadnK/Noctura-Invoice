import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLicense, isAllowed } from '../src/state.ts';
import type { LicenseCache } from '../src/state.ts';

const NOW = '2026-07-26T10:00:00.000Z';
const base: LicenseCache = {
  status: 'valid', plan: 'yearly', features: ['invoices', 'quotes', 'email'],
  expiresAt: '2027-07-26T00:00:00.000Z', lastOnlineAt: '2026-07-26T08:00:00.000Z',
  graceDays: 7, checkIntervalH: 24,
};

test('frisch geprueft und gueltig', () => {
  const view = evaluateLicense(base, NOW);
  assert.equal(view.mode, 'active');
  assert.equal(view.shouldCheckNow, false);
});

test('nach 24 Stunden wird eine neue Pruefung angestossen', () => {
  const view = evaluateLicense({ ...base, lastOnlineAt: '2026-07-25T08:00:00.000Z' }, NOW);
  assert.equal(view.shouldCheckNow, true);
  assert.equal(view.mode, 'active', 'ohne Verbindung darf trotzdem gearbeitet werden');
});

test('ab zwei verbleibenden Tagen wird gewarnt', () => {
  const view = evaluateLicense({ ...base, lastOnlineAt: '2026-07-21T10:00:00.000Z' }, NOW);
  assert.equal(view.mode, 'warning');
  assert.equal(view.offlineDaysLeft, 2);
});

test('nach Ablauf der Toleranz greift der eingeschraenkte Modus', () => {
  const view = evaluateLicense({ ...base, lastOnlineAt: '2026-07-15T10:00:00.000Z' }, NOW);
  assert.equal(view.mode, 'restricted');
  assert.ok(view.detail.includes('vorhandenen Daten'));
});

test('abgelaufene Lizenz sperrt nur die Neuerstellung', () => {
  const view = evaluateLicense({ ...base, expiresAt: '2026-07-01T00:00:00.000Z' }, NOW);
  assert.equal(view.mode, 'restricted');
  assert.equal(isAllowed(view, 'invoices.export'), true);
  assert.equal(isAllowed(view, 'invoices.finalize'), false);
});

test('vor dem Ablauf wird rechtzeitig erinnert', () => {
  const view = evaluateLicense({ ...base, expiresAt: '2026-08-05T00:00:00.000Z' }, NOW);
  assert.equal(view.mode, 'warning');
  assert.equal(view.daysUntilExpiry, 9);
});

test('unbefristete Lizenz kennt kein Ablaufdatum', () => {
  const view = evaluateLicense({ ...base, expiresAt: null }, NOW);
  assert.equal(view.mode, 'active');
  assert.equal(view.daysUntilExpiry, null);
});

test('gesperrte Lizenz nennt den Grund', () => {
  const view = evaluateLicense({ ...base, status: 'blocked', blockedReason: 'Zahlung offen' }, NOW);
  assert.equal(view.mode, 'restricted');
  assert.ok(view.detail.includes('Zahlung offen'));
});

test('ohne Lizenz bleiben Lesen und Sichern erlaubt', () => {
  const view = evaluateLicense({ status: 'none' }, NOW);
  assert.equal(view.mode, 'unlicensed');
  for (const capability of ['invoices.read', 'invoices.export', 'backup.create', 'payments.record']) {
    assert.equal(isAllowed(view, capability), true, capability);
  }
  assert.equal(isAllowed(view, 'invoices.finalize'), false);
  assert.equal(isAllowed(view, 'email.send'), false);
});

test('Funktionspakete der Lizenz werden beachtet', () => {
  const view = evaluateLicense(base, NOW);
  assert.equal(isAllowed(view, 'email.send', ['invoices']), false);
  assert.equal(isAllowed(view, 'email.send', ['invoices', 'email']), true);
  assert.equal(isAllowed(view, 'email.send', ['*']), true);
});
