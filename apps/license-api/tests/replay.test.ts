import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReplay, MemoryNonceStore } from '../src/lib/replay.ts';

const NOW = Date.parse('2026-07-26T10:00:00.000Z');
const nonce = (c: string) => c.repeat(40);

test('eine frische Anfrage geht durch', async () => {
  const store = new MemoryNonceStore(() => NOW);
  const r = await checkReplay(store, nonce('a'), '2026-07-26T10:00:00.000Z', NOW);
  assert.equal(r.ok, true);
});

test('dieselbe Nonce wird kein zweites Mal akzeptiert', async () => {
  const store = new MemoryNonceStore(() => NOW);
  await checkReplay(store, nonce('b'), '2026-07-26T10:00:00.000Z', NOW);
  const second = await checkReplay(store, nonce('b'), '2026-07-26T10:00:00.000Z', NOW);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, 'LIC_REPLAY');
});

test('ein alter Zeitstempel wird abgewiesen', async () => {
  const store = new MemoryNonceStore(() => NOW);
  const r = await checkReplay(store, nonce('c'), '2026-07-26T09:00:00.000Z', NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'LIC_CLOCK_SKEW');
});

test('ein Zeitstempel aus der Zukunft wird ebenso abgewiesen', async () => {
  const store = new MemoryNonceStore(() => NOW);
  const r = await checkReplay(store, nonce('d'), '2026-07-26T11:00:00.000Z', NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'LIC_CLOCK_SKEW');
});

test('geringe Abweichung bleibt zulaessig', async () => {
  const store = new MemoryNonceStore(() => NOW);
  const r = await checkReplay(store, nonce('e'), new Date(NOW - 120_000).toISOString(), NOW);
  assert.equal(r.ok, true);
});

test('eine zu kurze Nonce wird nicht akzeptiert', async () => {
  const store = new MemoryNonceStore(() => NOW);
  const r = await checkReplay(store, 'kurz', '2026-07-26T10:00:00.000Z', NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, 'LIC_NONCE_WEAK');
});

test('nach Ablauf der Merkfrist ist die Nonce wieder frei', async () => {
  let clock = NOW;
  const store = new MemoryNonceStore(() => clock);
  await checkReplay(store, nonce('f'), '2026-07-26T10:00:00.000Z', NOW);
  clock = NOW + 601_000;
  const later = await store.claim(nonce('f'), 600);
  assert.equal(later, true);
});
