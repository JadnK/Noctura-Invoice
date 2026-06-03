import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDecimalStyle, detectDelimiter, parseAmountCents, parseCsv, parseDate, toCsv } from '../src/csv.ts';
import { buildPreview, CUSTOMER_FIELDS, importableRows, PRODUCT_FIELDS, suggestMapping } from '../src/import.ts';

test('Trennzeichen wird erkannt', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
});

test('Anfuehrungszeichen und eingebettete Trennzeichen werden korrekt gelesen', () => {
  const rows = parseCsv('name;ort\n"Meier; Sohn";Berlin\n"Er sagte ""hallo""";Köln');
  assert.deepEqual(rows[1], ['Meier; Sohn', 'Berlin']);
  assert.deepEqual(rows[2], ['Er sagte "hallo"', 'Köln']);
});

test('Zeilenumbruch im Feld beendet die Zeile nicht', () => {
  const rows = parseCsv('a;b\n"Zeile1\nZeile2";x');
  assert.equal(rows[1][0], 'Zeile1\nZeile2');
  assert.equal(rows.length, 2);
});

test('BOM und Windows-Zeilenenden stoeren nicht', () => {
  const rows = parseCsv('\ufeffa;b\r\n1;2\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('Export maskiert und schreibt BOM fuer Excel', () => {
  const csv = toCsv([['Name', 'Betrag'], ['Meier; Sohn', '1.234,56']]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"Meier; Sohn"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('Zahlenformat wird erkannt', () => {
  assert.equal(detectDecimalStyle(['1.234,56', '99,00']), 'de');
  assert.equal(detectDecimalStyle(['1,234.56', '99.00']), 'en');
});

test('Betraege werden je Format zu Cent', () => {
  assert.equal(parseAmountCents('1.234,56', 'de'), 123_456);
  assert.equal(parseAmountCents('1,234.56', 'en'), 123_456);
  assert.equal(parseAmountCents('99 €', 'de'), 9900);
  assert.equal(parseAmountCents('-12,50', 'de'), -1250);
  assert.equal(parseAmountCents('abc', 'de'), null);
});

test('Datumsangaben werden nach ISO normalisiert', () => {
  assert.equal(parseDate('26.07.2026'), '2026-07-26');
  assert.equal(parseDate('1.7.26'), '2026-07-01');
  assert.equal(parseDate('2026-07-26'), '2026-07-26');
  assert.equal(parseDate('07/26/2026'), '2026-07-26');
  assert.equal(parseDate('Juli'), null);
});

test('Spaltenzuordnung wird aus der Kopfzeile vorgeschlagen', () => {
  const mapping = suggestMapping(['Art-Nr.', 'Bezeichnung', 'Preis', 'MwSt'], PRODUCT_FIELDS);
  assert.equal(mapping.sku, 0);
  assert.equal(mapping.name, 1);
  assert.equal(mapping.netPriceCents, 2);
  assert.equal(mapping.taxRateBp, 3);
});

test('Zuordnung erkennt englische und deutsche Kopfzeilen', () => {
  const mapping = suggestMapping(['company', 'E-Mail', 'PLZ'], CUSTOMER_FIELDS);
  assert.equal(mapping.company, 0);
  assert.equal(mapping.email, 1);
  assert.equal(mapping.postalCode, 2);
});

const productRows = [
  ['A-1', 'Kabel', '12,50', '19'],
  ['A-2', 'Stecker', 'x,xx', '19'],
  ['A-1', 'Kabel doppelt', '12,50', '19'],
  ['', 'Ohne Nummer', '5,00', '19'],
];
const mapping = { sku: 0, name: 1, netPriceCents: 2, taxRateBp: 3 };

test('fehlerhafte Zeilen brechen den Import nicht ab', () => {
  const preview = buildPreview({
    rows: productRows, mapping, fields: PRODUCT_FIELDS, decimalStyle: 'de', identityField: 'sku',
  });
  assert.equal(preview.rows.length, 4);
  assert.equal(preview.issues.length, 2, 'ungueltiger Betrag und fehlende Artikelnummer');
});

test('Fehler nennen Zeile, Feld und Grund', () => {
  const preview = buildPreview({
    rows: productRows, mapping, fields: PRODUCT_FIELDS, decimalStyle: 'de', identityField: 'sku',
  });
  const amountIssue = preview.issues.find((i) => i.field === 'netPriceCents');
  assert.equal(amountIssue?.row, 3);
  assert.ok(amountIssue?.message.includes('Betrag'));
});

test('Duplikate in der Datei und in der Datenbank werden getrennt gemeldet', () => {
  const preview = buildPreview({
    rows: productRows, mapping, fields: PRODUCT_FIELDS, decimalStyle: 'de',
    identityField: 'sku', existingIdentities: new Set(['a-2']),
  });
  assert.deepEqual(preview.duplicatesInFile, [4]);
  assert.deepEqual(preview.duplicatesInDatabase, [3]);
});

test('uebernommen wird nur, was fehlerfrei und eindeutig ist', () => {
  const preview = buildPreview({
    rows: productRows, mapping, fields: PRODUCT_FIELDS, decimalStyle: 'de', identityField: 'sku',
  });
  assert.equal(importableRows(preview), 1);
});

test('Prozentwerte landen als Basispunkte im Datensatz', () => {
  const preview = buildPreview<{ taxRateBp: number }>({
    rows: [['A-9', 'Ware', '10,00', '7']], mapping, fields: PRODUCT_FIELDS,
    decimalStyle: 'de', identityField: 'sku',
  });
  assert.equal(preview.rows[0].taxRateBp, 700);
});
