import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKeys, matchShortcut, SHORTCUTS } from '../src/lib/shortcuts.ts';
import { describeError, ERROR_CATALOG } from '../src/lib/errors.ts';

test('Tastenkuerzel sind eindeutig belegt', () => {
  const seen = new Set<string>();
  for (const shortcut of SHORTCUTS) {
    const key = `${shortcut.scope}:${shortcut.keys.join('+').toLowerCase()}`;
    assert.equal(seen.has(key), false, `doppelt belegt: ${key}`);
    seen.add(key);
  }
});

test('Anzeige verwendet deutsche Tastennamen', () => {
  assert.equal(formatKeys(SHORTCUTS.find((s) => s.id === 'invoice.new')!), 'Strg + N');
  assert.equal(formatKeys(SHORTCUTS.find((s) => s.id === 'customer.new')!), 'Strg + Umschalt + N');
  assert.equal(formatKeys(SHORTCUTS.find((s) => s.id === 'close')!), 'Esc');
});

test('Strg + N und Strg + Umschalt + N werden unterschieden', () => {
  const plain = matchShortcut({ key: 'n', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }, 'global');
  const shifted = matchShortcut({ key: 'N', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, 'global');
  assert.equal(plain?.id, 'invoice.new');
  assert.equal(shifted?.id, 'customer.new');
});

test('Cmd wirkt wie Strg, damit macOS sich vertraut anfuehlt', () => {
  const match = matchShortcut({ key: 'k', ctrlKey: false, shiftKey: false, altKey: false, metaKey: true }, 'global');
  assert.equal(match?.id, 'palette');
});

test('Editor-Kuerzel greifen nicht in Dialogen', () => {
  const event = { key: 's', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
  assert.equal(matchShortcut(event, 'editor')?.id, 'save');
  assert.equal(matchShortcut(event, 'dialog'), undefined);
});

test('jeder Fehler nennt Ursache und Lösungsweg', () => {
  for (const [code, info] of Object.entries(ERROR_CATALOG)) {
    assert.equal(info.code, code);
    assert.ok(info.title.length > 5, code);
    assert.ok(info.cause.length > 10, code);
    assert.ok(info.fix.length > 10, code);
  }
});

test('unbekannte Codes erhalten trotzdem eine brauchbare Meldung', () => {
  const info = describeError('E_IRGENDWAS');
  assert.equal(info.code, 'E_IRGENDWAS');
  assert.ok(info.fix.includes('Fehler-ID'));
});

test('Fehlermeldungen entschuldigen sich nicht', () => {
  for (const info of Object.values(ERROR_CATALOG)) {
    const text = `${info.title} ${info.cause} ${info.fix}`.toLowerCase();
    for (const word of ['entschuldigung', 'leider', 'tut uns leid', 'ups']) {
      assert.equal(text.includes(word), false, `${info.code} enthaelt "${word}"`);
    }
  }
});
