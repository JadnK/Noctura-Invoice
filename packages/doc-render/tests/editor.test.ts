import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT } from '../src/model.ts';
import {
  addBlock, bumpVersion, duplicateLayout, exportLayout, importLayout, isSavable,
  moveBlock, moveToSection, removeBlock, toggleVisibility, updateBlock, updateStyle, validateLayout,
} from '../src/editor.ts';

test('Bausteine werden hinzugefuegt und erhalten eindeutige Kennungen', () => {
  const one = addBlock(DEFAULT_LAYOUT, 'body', 'text');
  const two = addBlock(one, 'body', 'text');
  const ids = two.body.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('Einfuegen an einer bestimmten Stelle', () => {
  const layout = addBlock(DEFAULT_LAYOUT, 'body', 'divider', 0);
  assert.equal(layout.body[0].type, 'divider');
  assert.equal(layout.body.length, DEFAULT_LAYOUT.body.length + 1);
});

test('Verschieben aendert die Reihenfolge', () => {
  const moved = moveBlock(DEFAULT_LAYOUT, 'body', 'totals', -1);
  const before = DEFAULT_LAYOUT.body.findIndex((b) => b.id === 'totals');
  const after = moved.body.findIndex((b) => b.id === 'totals');
  assert.equal(after, before - 1);
});

test('am Rand passiert beim Verschieben nichts', () => {
  const first = DEFAULT_LAYOUT.body[0].id;
  assert.deepEqual(moveBlock(DEFAULT_LAYOUT, 'body', first, -1), DEFAULT_LAYOUT);
  const last = DEFAULT_LAYOUT.body[DEFAULT_LAYOUT.body.length - 1].id;
  assert.deepEqual(moveBlock(DEFAULT_LAYOUT, 'body', last, 1), DEFAULT_LAYOUT);
});

test('unbekannte Kennung laesst das Layout unveraendert', () => {
  assert.deepEqual(moveBlock(DEFAULT_LAYOUT, 'body', 'gibtsnicht', 1), DEFAULT_LAYOUT);
});

test('Bausteine wandern zwischen Bereichen', () => {
  const moved = moveToSection(DEFAULT_LAYOUT, 'body', 'footer', 'qr');
  assert.equal(moved.body.some((b) => b.id === 'qr'), false);
  assert.equal(moved.footer.some((b) => b.id === 'qr'), true);
});

test('Entfernen loescht genau einen Baustein', () => {
  const layout = removeBlock(DEFAULT_LAYOUT, 'body', 'qr');
  assert.equal(layout.body.length, DEFAULT_LAYOUT.body.length - 1);
  assert.equal(layout.body.some((b) => b.id === 'qr'), false);
});

test('Sichtbarkeit laesst sich umschalten, ohne den Baustein zu verlieren', () => {
  const hidden = toggleVisibility(DEFAULT_LAYOUT, 'body', 'qr');
  assert.equal(hidden.body.find((b) => b.id === 'qr')?.visible, false);
  const shown = toggleVisibility(hidden, 'body', 'qr');
  assert.equal(shown.body.find((b) => b.id === 'qr')?.visible, true);
});

test('Inhalt und Stil werden getrennt gepflegt', () => {
  const withText = updateBlock(DEFAULT_LAYOUT, 'body', 'intro', { content: 'Vielen Dank für Ihren Auftrag.' });
  const styled = updateStyle(withText, 'body', 'intro', { bold: true, fontSizePt: 11 });
  const block = styled.body.find((b) => b.id === 'intro');
  assert.equal(block?.content, 'Vielen Dank für Ihren Auftrag.');
  assert.equal(block?.style?.bold, true);
  assert.equal(block?.style?.fontSizePt, 11);
});

test('Operationen veraendern das Ausgangslayout nicht', () => {
  const snapshot = JSON.stringify(DEFAULT_LAYOUT);
  addBlock(DEFAULT_LAYOUT, 'body', 'text');
  removeBlock(DEFAULT_LAYOUT, 'body', 'totals');
  updateStyle(DEFAULT_LAYOUT, 'body', 'intro', { bold: true });
  assert.equal(JSON.stringify(DEFAULT_LAYOUT), snapshot, 'Rueckgaengig braucht unveraenderte Vorgaenger');
});

test('die Standardvorlage ist speicherbar', () => {
  assert.equal(isSavable(DEFAULT_LAYOUT), true);
  assert.deepEqual(validateLayout(DEFAULT_LAYOUT).filter((p) => p.severity === 'error'), []);
});

test('ohne Positionstabelle ist eine Vorlage kein Beleg', () => {
  const broken = removeBlock(DEFAULT_LAYOUT, 'body', 'items');
  const problems = validateLayout(broken);
  assert.equal(isSavable(broken), false);
  assert.ok(problems.some((p) => p.severity === 'error' && p.message.includes('Positionstabelle')));
});

test('eine ausgeblendete Positionstabelle zaehlt nicht als vorhanden', () => {
  const hidden = toggleVisibility(DEFAULT_LAYOUT, 'body', 'items');
  assert.equal(isSavable(hidden), false);
});

test('unbekannte Platzhalter sind eine Warnung, kein Fehler', () => {
  const layout = updateBlock(DEFAULT_LAYOUT, 'body', 'intro', { content: 'Hallo {{kunde.lieblingsfarbe}}' });
  const problems = validateLayout(layout);
  assert.ok(problems.some((p) => p.severity === 'warning' && p.message.includes('lieblingsfarbe')));
  assert.equal(isSavable(layout), true);
});

test('zu kleine Schrift wird verhindert', () => {
  const tiny = { ...DEFAULT_LAYOUT, page: { ...DEFAULT_LAYOUT.page, baseFontSizePt: 5 } };
  assert.equal(isSavable(tiny), false);
});

test('knappe Raender ergeben eine Warnung', () => {
  const narrow = { ...DEFAULT_LAYOUT, page: { ...DEFAULT_LAYOUT.page, marginTopMm: 5 } };
  assert.ok(validateLayout(narrow).some((p) => p.message.includes('Ränder')));
  assert.equal(isSavable(narrow), true);
});

test('verworfenes CSS wird im Editor gemeldet', () => {
  const layout = { ...DEFAULT_LAYOUT, customCss: '.x { position: fixed; }' };
  assert.ok(validateLayout(layout).some((p) => p.message.includes('CSS wird nicht übernommen')));
});

test('Duplikat startet wieder bei Version 1', () => {
  const copy = duplicateLayout(bumpVersion(bumpVersion(DEFAULT_LAYOUT)), 'Kopie');
  assert.equal(copy.name, 'Kopie');
  assert.equal(copy.version, 1);
});

test('Export und Import ergeben dieselbe Vorlage', () => {
  const result = importLayout(exportLayout(DEFAULT_LAYOUT));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.layout.body.length, DEFAULT_LAYOUT.body.length);
    assert.equal(result.layout.page.fontFamily, DEFAULT_LAYOUT.page.fontFamily);
  }
});

test('kaputte Dateien werden verstaendlich abgelehnt', () => {
  const broken = importLayout('{kein json');
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.ok(broken.reason.includes('JSON'));

  const empty = importLayout('{"name":"leer"}');
  assert.equal(empty.ok, false);
});

test('Import verwirft unbekannte Bausteine und gefaehrliches CSS', () => {
  const result = importLayout(JSON.stringify({
    name: 'Fremd',
    body: [
      { id: 'items', type: 'items_table' },
      { id: 'totals', type: 'totals' },
      { id: 'evil', type: 'script' },
    ],
    customCss: '.a { position: fixed; color: #112233; }',
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.layout.body.length, 2);
    assert.equal(result.layout.customCss?.includes('position'), false);
    assert.ok(result.layout.customCss?.includes('#112233'));
  }
});
