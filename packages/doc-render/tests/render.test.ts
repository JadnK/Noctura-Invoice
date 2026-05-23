import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT } from '../src/model.ts';
import { escapeHtml, sanitizeCss } from '../src/sanitize.ts';
import { resolvePlaceholders, unknownPlaceholders } from '../src/placeholders.ts';
import { renderHtml } from '../src/html.ts';
import { escapeTypst, renderTypst } from '../src/typst.ts';
import type { RenderDocument } from '../src/document.ts';

const doc: RenderDocument = {
  title: 'Rechnung RE-2026-00001',
  addressLines: ['Steinbach Elektrotechnik GmbH', 'Hauptstraße 5', '10115 Berlin'],
  infoRows: [
    { label: 'Rechnungsnummer', value: 'RE-2026-00001' },
    { label: 'Datum', value: '26.07.2026' },
  ],
  items: [
    { position: 1, kind: 'item', description: 'Beratung', quantity: '2', unit: 'Stunde', unitPrice: '95,00 €', lineTotal: '190,00 €' },
    { position: 2, kind: 'item', description: 'Material <Kabel>', quantity: '1', unit: 'Pauschale', unitPrice: '40,00 €', lineTotal: '40,00 €' },
  ],
  totals: [
    { label: 'Nettosumme', value: '230,00 €' },
    { label: 'Bruttobetrag', value: '273,70 €', emphasis: true },
  ],
  taxRows: [{ label: '19 % MwSt.', net: '230,00 €', tax: '43,70 €' }],
  context: { 'firma.name': 'Musterfirma', 'firma.strasse': 'Weg 1', 'firma.plz': '10115', 'firma.ort': 'Berlin', 'beleg.faelligAm': '09.08.2026' },
};

test('HTML-Ausgabe enthaelt Positionen und Summen', () => {
  const { html } = renderHtml(DEFAULT_LAYOUT, doc);
  assert.ok(html.includes('Beratung'));
  assert.ok(html.includes('273,70'));
  assert.ok(html.includes('19 % MwSt.'));
});

test('Kundendaten werden HTML-escaped', () => {
  const { html } = renderHtml(DEFAULT_LAYOUT, doc);
  assert.ok(html.includes('Material &lt;Kabel&gt;'));
  assert.equal(html.includes('<Kabel>'), false);
});

test('Ein Skript im Kundennamen landet nicht im Dokument', () => {
  const evil: RenderDocument = { ...doc, addressLines: ['<script>alert(1)</script>'] };
  const { html } = renderHtml(DEFAULT_LAYOUT, evil);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('escapeHtml deckt alle relevanten Zeichen ab', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('CSS ausserhalb der Positivliste wird entfernt', () => {
  const result = sanitizeCss(`
    .x { color: #ff0000; position: fixed; }
    @import url("evil.css");
    .y { background-image: url(javascript:alert(1)); font-size: 9pt; }
  `);
  assert.ok(result.css.includes('color: #ff0000'));
  assert.ok(result.css.includes('font-size: 9pt'));
  assert.equal(result.css.includes('position'), false);
  assert.equal(result.css.includes('@import'), false);
  assert.equal(result.css.includes('javascript:'), false);
  assert.ok(result.removed.length >= 3);
});

test('entferntes CSS wird gemeldet, nicht stillschweigend geschluckt', () => {
  const { removedCss } = renderHtml({ ...DEFAULT_LAYOUT, customCss: '.a { position: absolute; }' }, doc);
  assert.equal(removedCss.length, 1);
});

test('Platzhalter werden aufgeloest', () => {
  const result = resolvePlaceholders('{{firma.name}}, {{firma.ort}}', doc.context);
  assert.equal(result.text, 'Musterfirma, Berlin');
  assert.equal(result.unknown.length, 0);
});

test('unbekannte Platzhalter erscheinen nicht im Dokument', () => {
  const result = resolvePlaceholders('Hallo {{kunde.geheim}}!', doc.context);
  assert.equal(result.text, 'Hallo !');
  assert.deepEqual(result.unknown, ['kunde.geheim']);
});

test('der Editor kann unbekannte Platzhalter melden', () => {
  assert.deepEqual(unknownPlaceholders('{{firma.name}} {{quatsch.feld}}'), ['quatsch.feld']);
});

test('Entwurfswasserzeichen erscheint nur bei Entwuerfen', () => {
  const layout = { ...DEFAULT_LAYOUT, watermark: 'draft' as const };
  assert.ok(renderHtml(layout, { ...doc, isDraft: true }).html.includes('ENTWURF'));
  assert.equal(renderHtml(layout, { ...doc, isDraft: false }).html.includes('ENTWURF'), false);
});

test('Kleinunternehmerhinweis wird ausgegeben', () => {
  const kleinunternehmer: RenderDocument = {
    ...doc, taxRows: [], taxNote: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  };
  const { html } = renderHtml(DEFAULT_LAYOUT, kleinunternehmer);
  assert.ok(html.includes('§ 19 UStG'));
  assert.equal(html.includes('MwSt.'), false);
});

test('Typst-Ausgabe enthaelt Seitenformat und Inhalte', () => {
  const typst = renderTypst(DEFAULT_LAYOUT, doc);
  assert.ok(typst.includes('paper: "a4"'));
  assert.ok(typst.includes('Beratung'));
  assert.ok(typst.includes('counter(page)'));
});

test('Typst-Sonderzeichen werden entschaerft', () => {
  assert.equal(escapeTypst('#set page(x) [a]'), '\\#set page(x) \\[a\\]');
  const typst = renderTypst(DEFAULT_LAYOUT, { ...doc, addressLines: ['#set text(fill: red)'] });
  assert.equal(typst.includes('\n#set text(fill: red)'), false);
});

test('beide Renderer zeigen dieselben Positionen', () => {
  const html = renderHtml(DEFAULT_LAYOUT, doc).html;
  const typst = renderTypst(DEFAULT_LAYOUT, doc);
  for (const item of doc.items) {
    const plain = item.description.replace(/[<>]/g, '');
    assert.ok(html.includes(plain.split(' ')[0]));
    assert.ok(typst.includes(plain.split(' ')[0]));
  }
});
