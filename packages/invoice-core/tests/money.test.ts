import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocate, applyBp, divRound, formatBp, formatCents, lineAmount,
  MoneyError, netFromGross, parseCents, reduceByBp,
} from '../src/money.ts';

test('divRound rundet halbe Werte von der Null weg', () => {
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(-5, 2), -3);
  assert.equal(divRound(4, 2), 2);
  assert.equal(divRound(1, 3), 0);
  assert.equal(divRound(2, 3), 1);
});

test('divRound weist Division durch null zurueck', () => {
  assert.throws(() => divRound(1, 0), (e: unknown) => e instanceof MoneyError && e.code === 'E_DIV_ZERO');
});

test('19 Prozent auf 100,00 EUR ergibt 19,00 EUR', () => {
  assert.equal(applyBp(10_000, 1900), 1900);
});

test('Bruttoherausrechnung ist die Umkehrung des Aufschlags', () => {
  const net = netFromGross(11_900, 1900);
  assert.equal(net, 10_000);
  assert.equal(net + applyBp(net, 1900), 11_900);
});

test('Prozentrabatt ausserhalb 0..100 Prozent wird abgelehnt', () => {
  assert.throws(() => reduceByBp(1000, 10_001), MoneyError);
  assert.throws(() => reduceByBp(1000, -1), MoneyError);
});

test('allocate verliert keinen Cent', () => {
  const parts = allocate(100, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(parts, [34, 33, 33]);
});

test('allocate verteilt gewichtet und exakt', () => {
  const parts = allocate(1000, [700, 200, 100]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(parts, [700, 200, 100]);
});

test('allocate kommt mit negativen Betraegen zurecht', () => {
  const parts = allocate(-100, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), -100);
});

test('allocate verteilt bei Gewichtssumme null gleichmaessig', () => {
  const parts = allocate(10, [0, 0, 0]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10);
});

test('Menge mal Einzelpreis rundet erst am Ende', () => {
  // 1,5 Stunden zu 33,33 EUR = 49,995 -> 50,00
  assert.equal(lineAmount(1500, 3333), 5000);
  // 0,333 kg zu 10,00 EUR = 3,33
  assert.equal(lineAmount(333, 1000), 333);
});

test('parseCents liest deutsche und englische Schreibweise', () => {
  assert.equal(parseCents('1.234,56'), 123_456);
  assert.equal(parseCents('1234.56'), 123_456);
  assert.equal(parseCents('12'), 1200);
  assert.equal(parseCents(' -0,05 '), -5);
  assert.equal(parseCents('1234,5'), 123_450);
});

test('parseCents lehnt Unsinn ab', () => {
  for (const bad of ['', 'abc', '1,234', '1.2.3', '5 EUR']) {
    assert.throws(() => parseCents(bad), MoneyError, `akzeptierte "${bad}"`);
  }
});

test('Formatierung folgt deutscher Konvention', () => {
  assert.match(formatCents(123_456), /1\.234,56/);
  assert.equal(formatBp(1900), '19 %');
  assert.equal(formatBp(750), '7,5 %');
});
