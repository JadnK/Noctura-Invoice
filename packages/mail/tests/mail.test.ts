import test from 'node:test';
import assert from 'node:assert/strict';
import { presetById, validateSmtp } from '../src/providers.ts';
import { backoffSeconds, dueItems, isPermanent, MAX_ATTEMPTS, onFailure, onSuccess } from '../src/queue.ts';
import { proposeDunning } from '../src/dunning.ts';
import { allocateBulkPayment, applyPayments } from '../src/payments.ts';

test('Anbietervorgaben sind vollstaendig', () => {
  const gmail = presetById('gmail');
  assert.equal(gmail?.host, 'smtp.gmail.com');
  assert.equal(gmail?.port, 587);
  assert.equal(gmail?.security, 'starttls');
});

test('gueltige SMTP-Konfiguration wird akzeptiert', () => {
  assert.deepEqual(
    validateSmtp({ host: 'smtp.ionos.de', port: 465, security: 'tls', username: 'me', senderEmail: 'a@b.de' }),
    [],
  );
});

test('die haeufigste Fehlkonfiguration wird erkannt', () => {
  const problems = validateSmtp({ host: 'smtp.ionos.de', port: 465, security: 'starttls', username: 'me', senderEmail: 'a@b.de' });
  assert.deepEqual(problems, ['SECURITY_PORT']);
});

test('fehlerhafte Felder werden einzeln gemeldet', () => {
  const problems = validateSmtp({ host: 'localhost', port: 0, security: 'none', username: '  ', senderEmail: 'keine-mail' });
  assert.deepEqual(problems.sort(), ['HOST', 'PORT', 'SENDER', 'USERNAME']);
});

test('dauerhafte Fehler werden nicht wiederholt', () => {
  const item = { id: 'q1', status: 'sending' as const, attempts: 0, nextAttemptAt: '2026-07-26T10:00:00.000Z' };
  const decision = onFailure(item, 'auth', '2026-07-26T10:00:00.000Z');
  assert.equal(decision.status, 'failed');
  assert.equal(decision.nextAttemptAt, null);
});

test('voruebergehende Fehler werden mit wachsendem Abstand wiederholt', () => {
  const item = { id: 'q1', status: 'sending' as const, attempts: 0, nextAttemptAt: '2026-07-26T10:00:00.000Z' };
  const first = onFailure(item, 'timeout', '2026-07-26T10:00:00.000Z');
  assert.equal(first.status, 'queued');
  assert.equal(first.nextAttemptAt, '2026-07-26T10:01:00.000Z');

  const second = onFailure({ ...item, attempts: 1 }, 'timeout', '2026-07-26T10:01:00.000Z');
  assert.equal(second.nextAttemptAt, '2026-07-26T10:06:00.000Z');
  assert.ok(backoffSeconds(2) > backoffSeconds(1));
});

test('nach der letzten Wiederholung wird aufgegeben', () => {
  const item = { id: 'q1', status: 'sending' as const, attempts: MAX_ATTEMPTS - 1, nextAttemptAt: '2026-07-26T10:00:00.000Z' };
  assert.equal(onFailure(item, 'timeout', '2026-07-26T10:00:00.000Z').status, 'failed');
});

test('Erfolg beendet den Eintrag', () => {
  const decision = onSuccess({ id: 'q1', status: 'sending', attempts: 2, nextAttemptAt: '2026-07-26T10:00:00.000Z' });
  assert.equal(decision.status, 'sent');
  assert.equal(decision.attempts, 3);
});

test('Authentifizierungsfehler gilt als dauerhaft, Zeitueberschreitung nicht', () => {
  assert.equal(isPermanent('auth'), true);
  assert.equal(isPermanent('too_large'), true);
  assert.equal(isPermanent('timeout'), false);
});

test('faellige Eintraege kommen in Reihenfolge ihrer Faelligkeit', () => {
  const items = [
    { id: 'a', status: 'queued' as const, attempts: 1, nextAttemptAt: '2026-07-26T10:05:00.000Z' },
    { id: 'b', status: 'queued' as const, attempts: 1, nextAttemptAt: '2026-07-26T09:00:00.000Z' },
    { id: 'c', status: 'queued' as const, attempts: 1, nextAttemptAt: '2026-07-26T12:00:00.000Z' },
    { id: 'd', status: 'sent' as const, attempts: 1, nextAttemptAt: '2026-07-26T08:00:00.000Z' },
  ];
  assert.deepEqual(dueItems(items, '2026-07-26T10:10:00.000Z').map((i) => i.id), ['b', 'a']);
});

const candidate = {
  invoiceId: 'inv-1', dueDate: '2026-07-01', openCents: 100_000, status: 'sent', lastStepSent: null,
};

test('vor Ablauf der Karenz wird nichts vorgeschlagen', () => {
  assert.deepEqual(proposeDunning([candidate], '2026-07-02'), []);
});

test('nach drei Tagen folgt die Zahlungserinnerung', () => {
  const [proposal] = proposeDunning([candidate], '2026-07-05');
  assert.equal(proposal.level.step, 0);
  assert.equal(proposal.daysOverdue, 4);
});

test('es wird immer nur die naechste Stufe vorgeschlagen', () => {
  const alt = { ...candidate, lastStepSent: 0 };
  const [proposal] = proposeDunning([alt], '2026-09-01');
  assert.equal(proposal.level.step, 1, 'kein Sprung zur letzten Mahnung');
});

test('Mahngebuehr und Gesamtforderung werden ausgewiesen', () => {
  const alt = { ...candidate, lastStepSent: 1 };
  const [proposal] = proposeDunning([alt], '2026-07-25');
  assert.equal(proposal.level.step, 2);
  assert.equal(proposal.feeCents, 500);
  assert.equal(proposal.totalCents, 100_500);
});

test('bezahlte und stornierte Rechnungen werden nie gemahnt', () => {
  const cases = [
    { ...candidate, status: 'paid' },
    { ...candidate, status: 'cancelled' },
    { ...candidate, status: 'draft' },
    { ...candidate, openCents: 0 },
  ];
  assert.deepEqual(proposeDunning(cases, '2026-12-01'), []);
});

test('Teilzahlung ergibt Restbetrag und Status', () => {
  const state = applyPayments(11_900, [{ id: 'p1', amountCents: 5000, paidOn: '2026-07-20' }], '2026-08-01', '2026-07-26');
  assert.equal(state.openCents, 6900);
  assert.equal(state.status, 'partially_paid');
  assert.equal(state.fullyPaidOn, null);
});

test('vollstaendige Zahlung merkt sich das Datum der letzten Rate', () => {
  const state = applyPayments(10_000, [
    { id: 'p1', amountCents: 4000, paidOn: '2026-07-10' },
    { id: 'p2', amountCents: 6000, paidOn: '2026-07-18' },
  ], '2026-08-01', '2026-07-26');
  assert.equal(state.status, 'paid');
  assert.equal(state.openCents, 0);
  assert.equal(state.fullyPaidOn, '2026-07-18');
});

test('Ueberzahlung wird ausgewiesen statt verschluckt', () => {
  const state = applyPayments(10_000, [{ id: 'p1', amountCents: 12_000, paidOn: '2026-07-10' }], '2026-08-01', '2026-07-26');
  assert.equal(state.overpaidCents, 2000);
  assert.equal(state.openCents, 0);
});

test('Sammelzahlung wird auf die aeltesten Rechnungen verteilt', () => {
  const result = allocateBulkPayment(15_000, [
    { id: 'b', openCents: 10_000, dueDate: '2026-07-01' },
    { id: 'a', openCents: 8_000, dueDate: '2026-06-01' },
  ]);
  assert.deepEqual(result.allocations, [
    { invoiceId: 'a', amountCents: 8_000 },
    { invoiceId: 'b', amountCents: 7_000 },
  ]);
  assert.equal(result.remainingCents, 0);
});

test('ein Rest der Sammelzahlung bleibt sichtbar', () => {
  const result = allocateBulkPayment(20_000, [{ id: 'a', openCents: 8_000, dueDate: '2026-06-01' }]);
  assert.equal(result.remainingCents, 12_000);
});
