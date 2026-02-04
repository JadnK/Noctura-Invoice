import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDocument, derivePaymentState } from '../src/calculate.ts';
import type { DocumentInput, LineInput } from '../src/types.ts';

function item(id: string, qtyMilli: number, priceCents: number, taxBp = 1900, extra: Partial<LineInput> = {}): LineInput {
  return { id, kind: 'item', quantityMilli: qtyMilli, unitPriceCents: priceCents, taxRateBp: taxBp, ...extra };
}

const base: Omit<DocumentInput, 'lines'> = { pricesIncludeTax: false, taxScheme: 'standard' };

test('einfache Nettorechnung mit 19 Prozent', () => {
  const r = calculateDocument({ ...base, lines: [item('a', 2000, 5000)] });
  assert.equal(r.netTotalCents, 10_000);
  assert.equal(r.taxTotalCents, 1900);
  assert.equal(r.grossTotalCents, 11_900);
  assert.equal(r.taxGroups.length, 1);
});

test('mehrere Steuersaetze werden getrennt ausgewiesen', () => {
  const r = calculateDocument({
    ...base,
    lines: [item('a', 1000, 10_000, 1900), item('b', 1000, 10_000, 700)],
  });
  assert.deepEqual(r.taxGroups.map((g) => g.taxRateBp), [700, 1900]);
  assert.equal(r.taxGroups[0].taxCents, 700);
  assert.equal(r.taxGroups[1].taxCents, 1900);
  assert.equal(r.taxTotalCents, 2600);
  assert.equal(r.grossTotalCents, 22_600);
});

test('Steuer wird je Gruppe berechnet, nicht als Summe gerundeter Positionssteuern', () => {
  // Drei Positionen zu 0,03 EUR: je 0,0057 Steuer. Positionsweise gerundet
  // ergaebe 3 x 1 Cent = 3 Cent, korrekt sind 2 Cent auf 0,09 EUR.
  const lines = ['a', 'b', 'c'].map((id) => item(id, 1000, 3));
  const r = calculateDocument({ ...base, lines });
  assert.equal(r.netTotalCents, 9);
  assert.equal(r.taxTotalCents, 2);
  assert.equal(r.lines.reduce((s, l) => s + l.taxCents, 0), r.taxTotalCents);
});

test('Positionssummen ergeben immer die Belegsumme', () => {
  const lines = Array.from({ length: 17 }, (_, i) => item(`l${i}`, 1000 + i * 137, 999 + i * 7, i % 2 ? 700 : 1900));
  const r = calculateDocument({ ...base, lines, documentDiscount: { kind: 'percent', valueBp: 1337 } });
  assert.equal(r.lines.reduce((s, l) => s + l.netCents, 0), r.netTotalCents);
  assert.equal(r.lines.reduce((s, l) => s + l.taxCents, 0), r.taxTotalCents);
  assert.equal(r.lines.reduce((s, l) => s + l.totalCents, 0), r.grossTotalCents);
});

test('Bruttopreise werden korrekt herausgerechnet', () => {
  const r = calculateDocument({
    ...base,
    pricesIncludeTax: true,
    lines: [item('a', 1000, 11_900)],
  });
  assert.equal(r.netTotalCents, 10_000);
  assert.equal(r.taxTotalCents, 1900);
  assert.equal(r.grossTotalCents, 11_900);
});

test('Kleinunternehmerregelung erzeugt keine Umsatzsteuer', () => {
  const r = calculateDocument({
    ...base,
    taxScheme: 'small_business',
    lines: [item('a', 1000, 10_000, 1900), item('b', 2000, 5000, 700)],
  });
  assert.equal(r.taxTotalCents, 0);
  assert.equal(r.netTotalCents, 20_000);
  assert.equal(r.grossTotalCents, 20_000);
  assert.equal(r.taxGroups.length, 1);
  assert.equal(r.taxGroups[0].taxRateBp, 0);
  assert.equal(r.taxExempt, true);
});

test('Reverse Charge weist ebenfalls keine Steuer aus', () => {
  const r = calculateDocument({ ...base, taxScheme: 'reverse_charge', lines: [item('a', 1000, 50_000)] });
  assert.equal(r.taxTotalCents, 0);
  assert.equal(r.grossTotalCents, 50_000);
});

test('Positionsrabatt prozentual', () => {
  const r = calculateDocument({
    ...base,
    lines: [item('a', 1000, 10_000, 1900, { discount: { kind: 'percent', valueBp: 1000 } })],
  });
  assert.equal(r.lines[0].lineDiscountCents, 1000);
  assert.equal(r.netTotalCents, 9000);
  assert.equal(r.taxTotalCents, 1710);
});

test('fester Positionsrabatt kann den Wert nicht ins Negative druecken', () => {
  const r = calculateDocument({
    ...base,
    lines: [item('a', 1000, 500, 1900, { discount: { kind: 'fixed', valueCents: 900 } })],
  });
  assert.equal(r.netTotalCents, 0);
  assert.equal(r.taxTotalCents, 0);
});

test('Belegrabatt wird verlustfrei auf die Positionen verteilt', () => {
  const r = calculateDocument({
    ...base,
    lines: [item('a', 1000, 3333), item('b', 1000, 3333), item('c', 1000, 3334)],
    documentDiscount: { kind: 'percent', valueBp: 3333 },
  });
  const shares = r.lines.reduce((s, l) => s + l.documentDiscountShareCents, 0);
  assert.equal(shares, r.documentDiscountCents);
  assert.equal(r.netTotalCents, 10_000 - r.documentDiscountCents);
});

test('Belegrabatt trifft mehrere Steuersaetze anteilig', () => {
  const r = calculateDocument({
    ...base,
    lines: [item('a', 1000, 10_000, 1900), item('b', 1000, 10_000, 700)],
    documentDiscount: { kind: 'fixed', valueCents: 5000 },
  });
  assert.equal(r.netTotalCents, 15_000);
  assert.equal(r.taxGroups.find((g) => g.taxRateBp === 1900)?.netCents, 7500);
  assert.equal(r.taxGroups.find((g) => g.taxRateBp === 700)?.netCents, 7500);
  assert.equal(r.taxTotalCents, 1425 + 525);
});

test('ausgeblendete Positionen und Textzeilen zaehlen nicht mit', () => {
  const r = calculateDocument({
    ...base,
    lines: [
      { id: 'h', kind: 'heading' },
      item('a', 1000, 10_000),
      item('b', 1000, 99_999, 1900, { hidden: true }),
      { id: 't', kind: 'text' },
    ],
  });
  assert.equal(r.netTotalCents, 10_000);
  assert.equal(r.lines.length, 1);
});

test('negative Positionen sind zulaessig, etwa als Anzahlungsabzug', () => {
  const r = calculateDocument({ ...base, lines: [item('a', 1000, 10_000), item('b', 1000, -3000)] });
  assert.equal(r.netTotalCents, 7000);
  assert.equal(r.taxTotalCents, 1330);
});

test('Teilzahlung ergibt den offenen Betrag', () => {
  const r = calculateDocument({ ...base, lines: [item('a', 1000, 10_000)], paidCents: 5000 });
  assert.equal(r.openCents, 6900);
  assert.equal(derivePaymentState(r, '2026-08-01', '2026-07-26'), 'partially_paid');
  assert.equal(derivePaymentState(r, '2026-07-01', '2026-07-26'), 'overdue');
});

test('vollstaendige Zahlung ergibt bezahlt, auch nach Faelligkeit', () => {
  const r = calculateDocument({ ...base, lines: [item('a', 1000, 10_000)], paidCents: 11_900 });
  assert.equal(r.openCents, 0);
  assert.equal(derivePaymentState(r, '2026-01-01', '2026-07-26'), 'paid');
});

test('leerer Beleg ergibt Nullwerte statt Fehler', () => {
  const r = calculateDocument({ ...base, lines: [] });
  assert.equal(r.grossTotalCents, 0);
  assert.equal(r.taxGroups.length, 0);
});
