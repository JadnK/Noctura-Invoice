import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNumber, previewNumbers, renderPattern, NumberingError } from '../src/numbering.ts';
import type { NumberSequence } from '../src/numbering.ts';

const seq: NumberSequence = {
  docType: 'invoice',
  pattern: 'RE-{YYYY}-{COUNTER}',
  nextCounter: 1,
  padding: 5,
  resetMode: 'yearly',
  lastResetPeriod: '2026',
};

test('Muster wird mit fuehrenden Nullen aufgeloest', () => {
  assert.equal(nextNumber(seq, '2026-07-26').number, 'RE-2026-00001');
});

test('Zaehler steigt und wird zurueckgegeben', () => {
  const first = nextNumber(seq, '2026-07-26');
  const second = nextNumber(first.sequence, '2026-07-27');
  assert.equal(second.number, 'RE-2026-00002');
  assert.equal(second.sequence.nextCounter, 3);
});

test('jaehrliches Zuruecksetzen greift beim Jahreswechsel', () => {
  const later = { ...seq, nextCounter: 42 };
  assert.equal(nextNumber(later, '2027-01-02').number, 'RE-2027-00001');
  assert.equal(nextNumber(later, '2026-12-31').number, 'RE-2026-00042');
});

test('monatliches Zuruecksetzen greift beim Monatswechsel', () => {
  const monthly: NumberSequence = { ...seq, resetMode: 'monthly', lastResetPeriod: '2026-07', nextCounter: 9 };
  assert.equal(nextNumber(monthly, '2026-07-31').number, 'RE-2026-00009');
  assert.equal(nextNumber(monthly, '2026-08-01').number, 'RE-2026-00001');
});

test('alle Platzhalter werden unterstuetzt', () => {
  const out = renderPattern('{TYPE}{YY}{MM}{DD}-{CUSTOMER}-{COUNTER}', {
    dateIso: '2026-07-26', counter: 7, padding: 3, docType: 'quote', customerNumber: 'K-0042',
  });
  assert.equal(out, 'ANG260726-K-0042-007');
});

test('ein Muster ohne Zaehler wird abgelehnt', () => {
  assert.throws(
    () => renderPattern('RE-{YYYY}', { dateIso: '2026-07-26', counter: 1, padding: 4, docType: 'invoice' }),
    (e: unknown) => e instanceof NumberingError && e.code === 'E_NO_COUNTER',
  );
});

test('Vorschau veraendert den Zaehler nicht', () => {
  const preview = previewNumbers(seq, '2026-07-26');
  assert.deepEqual(preview, ['RE-2026-00001', 'RE-2026-00002', 'RE-2026-00003']);
  assert.equal(seq.nextCounter, 1);
});
