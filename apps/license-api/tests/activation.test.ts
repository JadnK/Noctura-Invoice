import test from 'node:test';
import assert from 'node:assert/strict';
import { decideActivation, hasFeature, PLAN_DEFAULTS } from '../src/lib/activation.ts';
import type { LicenseRecord } from '../src/lib/activation.ts';

const now = '2026-07-26T10:00:00.000Z';
const license: LicenseRecord = {
  id: 'lic-1', status: 'active', plan: 'yearly', features: ['invoices'],
  expiresAt: '2027-07-26T00:00:00.000Z', maxDevices: 2,
};

test('erstes Geraet wird aktiviert', () => {
  const d = decideActivation(license, [], 'GERAET1', now);
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.freeSlots, 1);
});

test('bekanntes Geraet belegt keinen zweiten Platz', () => {
  const d = decideActivation(license, [{ deviceId: 'GERAET1', deactivatedAt: null }], 'GERAET1', now);
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.reusedDevice, true);
});

test('das Geraetelimit wird durchgesetzt', () => {
  const devices = [
    { deviceId: 'A', deactivatedAt: null },
    { deviceId: 'B', deactivatedAt: null },
  ];
  const d = decideActivation(license, devices, 'C', now);
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.code, 'LIC_DEVICE_LIMIT');
    assert.deepEqual(d.detail, { active: 2, maxDevices: 2 });
  }
});

test('ein deaktiviertes Geraet gibt seinen Platz frei', () => {
  const devices = [
    { deviceId: 'A', deactivatedAt: '2026-07-01T00:00:00.000Z' },
    { deviceId: 'B', deactivatedAt: null },
  ];
  const d = decideActivation(license, devices, 'C', now);
  assert.equal(d.ok, true);
});

test('ein deaktiviertes Geraet reaktiviert sich nicht von selbst', () => {
  const devices = [{ deviceId: 'A', deactivatedAt: '2026-07-01T00:00:00.000Z' }];
  const d = decideActivation(license, devices, 'A', now);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'LIC_DEVICE_DEACTIVATED');
});

test('gesperrte Lizenz nennt den Grund', () => {
  const d = decideActivation({ ...license, status: 'blocked', blockedReason: 'Zahlung offen' }, [], 'A', now);
  assert.equal(d.ok, false);
  if (!d.ok) assert.deepEqual(d.detail, { reason: 'Zahlung offen' });
});

test('abgelaufene Lizenz wird abgewiesen', () => {
  const d = decideActivation({ ...license, expiresAt: '2026-01-01T00:00:00.000Z' }, [], 'A', now);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'LIC_EXPIRED');
});

test('unbefristete Lizenz laeuft nicht ab', () => {
  assert.equal(decideActivation({ ...license, expiresAt: null }, [], 'A', '2099-01-01T00:00:00.000Z').ok, true);
});

test('Sperrung schlaegt Ablauf: der Grund wird zuerst genannt', () => {
  const d = decideActivation({ ...license, status: 'blocked', expiresAt: '2020-01-01T00:00:00.000Z' }, [], 'A', now);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'LIC_BLOCKED');
});

test('Funktionspakete: Sternchen schaltet alles frei', () => {
  assert.equal(hasFeature(['invoices'], 'email'), false);
  assert.equal(hasFeature(['*'], 'email'), true);
  assert.equal(hasFeature(PLAN_DEFAULTS.yearly.features, 'recurring'), true);
  assert.equal(hasFeature(PLAN_DEFAULTS.trial.features, 'email'), false);
});
