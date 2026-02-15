import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFilename, sanitizeFilename } from '../src/filename.ts';

test('Umlaute werden umschrieben', () => {
  assert.equal(sanitizeFilename('Müller & Söhne.pdf'), 'Mueller & Soehne.pdf');
});

test('auf Windows verbotene Zeichen werden ersetzt', () => {
  assert.equal(sanitizeFilename('RE:2026/07*01?.pdf'), 'RE_2026_07_01_.pdf');
});

test('reservierte Windows-Namen werden entschaerft', () => {
  assert.equal(sanitizeFilename('CON.pdf'), '_CON.pdf');
  assert.equal(sanitizeFilename('lpt1.txt'), '_lpt1.txt');
});

test('fuehrende und abschliessende Punkte verschwinden', () => {
  assert.equal(sanitizeFilename('  ..Rechnung..  '), 'Rechnung');
});

test('Pfadwechsel ist nicht moeglich', () => {
  const out = sanitizeFilename('../../etc/passwd');
  assert.equal(out.includes('/'), false);
  assert.equal(out.includes('\\'), false);
});

test('leere Eingabe erhaelt einen Ersatznamen', () => {
  assert.equal(sanitizeFilename('   '), 'dokument');
});

test('Schema wird zum Dateinamen aufgeloest', () => {
  const name = renderFilename('{NUMMER}_{KUNDE}_{DATUM}', {
    number: 'RE-2026-00001', customer: 'Musterfirma', dateIso: '2026-07-25T10:00:00Z', type: 'Rechnung',
  });
  assert.equal(name, 'RE-2026-00001_Musterfirma_2026-07-25.pdf');
});
