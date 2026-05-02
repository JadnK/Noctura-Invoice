import test from 'node:test';
import assert from 'node:assert/strict';
import { formatIban, validateIban } from '../src/iban.ts';
import { suggestTaxScheme, validateVatId } from '../src/vat-id.ts';
import { addDays, daysBetween, defaultInterest, dueDate, earlyPaymentDiscount, overdueInfo } from '../src/payment-terms.ts';
import { buildGiroCode, GiroCodeError, remittanceFor } from '../src/sepa-qr.ts';

test('gueltige IBANs werden erkannt', () => {
  for (const iban of ['DE89370400440532013000', 'AT611904300234573201', 'CH9300762011623852957', 'NL91ABNA0417164300']) {
    assert.equal(validateIban(iban).valid, true, iban);
  }
});

test('Eingabe mit Leerzeichen und Kleinbuchstaben funktioniert', () => {
  assert.equal(validateIban('de89 3704 0044 0532 0130 00').valid, true);
});

test('falsche Pruefziffer wird abgelehnt', () => {
  const result = validateIban('DE89370400440532013001');
  assert.equal(result.valid, false);
  assert.equal(result.problem, 'CHECKSUM');
});

test('falsche Laenge fuer das Land wird abgelehnt', () => {
  assert.equal(validateIban('DE8937040044053201300').problem, 'COUNTRY_LENGTH');
});

test('unzulaessige Zeichen werden gemeldet', () => {
  assert.equal(validateIban('DE89-3704#0044').problem, 'CHARSET');
});

test('IBAN wird in Vierergruppen angezeigt', () => {
  assert.equal(formatIban('DE89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
});

test('USt-IdNr. wird je Land nach Form geprueft', () => {
  assert.equal(validateVatId('DE123456789').valid, true);
  assert.equal(validateVatId('DE12345678').valid, false);
  assert.equal(validateVatId('ATU12345678').valid, true);
  assert.equal(validateVatId('NL123456789B01').valid, true);
});

test('unbekannte Laender werden nicht faelschlich abgelehnt', () => {
  const result = validateVatId('XX123456789');
  assert.equal(result.known, false);
  assert.equal(result.valid, true);
});

test('Steuerschema-Vorschlag folgt Sitz und USt-IdNr.', () => {
  const seller = { sellerCountry: 'DE', sellerIsSmallBusiness: false };
  assert.equal(suggestTaxScheme({ ...seller, buyerCountry: 'DE', buyerHasVatId: true }).scheme, 'standard');
  assert.equal(suggestTaxScheme({ ...seller, buyerCountry: 'AT', buyerHasVatId: true }).scheme, 'reverse_charge');
  assert.equal(suggestTaxScheme({ ...seller, buyerCountry: 'AT', buyerHasVatId: false }).scheme, 'standard');
  assert.equal(suggestTaxScheme({ ...seller, buyerCountry: 'US', buyerHasVatId: false }).scheme, 'tax_exempt');
});

test('Kleinunternehmerregelung schlaegt alle anderen Vorschlaege', () => {
  const result = suggestTaxScheme({ sellerCountry: 'DE', buyerCountry: 'AT', buyerHasVatId: true, sellerIsSmallBusiness: true });
  assert.equal(result.scheme, 'small_business');
});

test('Faelligkeit rechnet ueber Monatsgrenzen', () => {
  assert.equal(dueDate('2026-07-26', 14), '2026-08-09');
  assert.equal(addDays('2026-12-20', 30), '2027-01-19');
  assert.equal(daysBetween('2026-07-01', '2026-07-26'), 25);
});

test('Schaltjahr wird korrekt behandelt', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('Skonto rundet kaufmaennisch', () => {
  assert.equal(earlyPaymentDiscount(11_900, 200), 238);
  assert.equal(earlyPaymentDiscount(333, 300), 10);
});

test('Ueberfaelligkeit beachtet Karenztage', () => {
  const info = overdueInfo('2026-07-20', '2026-07-22', 3);
  assert.equal(info.overdue, true);
  assert.equal(info.daysOverdue, 2);
  assert.equal(info.dunnable, false, 'innerhalb der Karenz wird nicht gemahnt');
  assert.equal(overdueInfo('2026-07-20', '2026-07-26', 3).dunnable, true);
});

test('vor Faelligkeit gibt es keinen Verzug', () => {
  const info = overdueInfo('2026-08-01', '2026-07-26');
  assert.equal(info.overdue, false);
  assert.equal(info.daysOverdue, 0);
});

test('Verzugszinsen taggenau', () => {
  // 1.000,00 EUR, 12,12 % p. a., 30 Tage
  assert.equal(defaultInterest({ openCents: 100_000, daysOverdue: 30, annualRateBp: 1212 }), 996);
  assert.equal(defaultInterest({ openCents: 100_000, daysOverdue: 0, annualRateBp: 1212 }), 0);
});

test('GiroCode entspricht dem EPC-Format', () => {
  const code = buildGiroCode({
    beneficiary: 'Musterfirma GmbH',
    iban: 'DE89 3704 0044 0532 0130 00',
    bic: 'COBADEFFXXX',
    amountCents: 119_000,
    remittance: remittanceFor('RE-2026-00001', 'KD-0042'),
  });
  const lines = code.split('\n');
  assert.equal(lines[0], 'BCD');
  assert.equal(lines[3], 'SCT');
  assert.equal(lines[6], 'DE89370400440532013000');
  assert.equal(lines[7], 'EUR1190.00');
  assert.equal(lines[10], 'Rechnung RE-2026-00001, Kd. KD-0042');
  assert.equal(lines.length, 12);
});

test('GiroCode lehnt ungueltige IBAN und Nullbetrag ab', () => {
  assert.throws(() => buildGiroCode({ beneficiary: 'X', iban: 'DE00', amountCents: 100, remittance: '' }), GiroCodeError);
  assert.throws(() => buildGiroCode({ beneficiary: 'X', iban: 'DE89370400440532013000', amountCents: 0, remittance: '' }), GiroCodeError);
});

test('zu lange Angaben werden auf die Standardgrenzen gekuerzt', () => {
  const code = buildGiroCode({
    beneficiary: 'A'.repeat(120),
    iban: 'DE89370400440532013000',
    amountCents: 100,
    remittance: 'B'.repeat(200),
  });
  const lines = code.split('\n');
  assert.equal(lines[5].length, 70);
  assert.equal(lines[10].length, 140);
});
