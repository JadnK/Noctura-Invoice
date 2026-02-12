import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, canTransition, isEditable, StateError } from '../src/status.ts';

test('Entwurf ist bearbeitbar, alles andere nicht', () => {
  assert.equal(isEditable('draft'), true);
  assert.equal(isEditable('finalized'), false);
  assert.equal(isEditable('paid'), false);
});

test('erlaubte Uebergaenge', () => {
  assert.ok(canTransition('draft', 'finalized'));
  assert.ok(canTransition('finalized', 'sent'));
  assert.ok(canTransition('partially_paid', 'paid'));
});

test('eine finalisierte Rechnung wird nie wieder Entwurf', () => {
  assert.equal(canTransition('finalized', 'draft'), false);
  assert.throws(() => assertTransition('finalized', 'draft'), StateError);
});

test('archivierte Belege sind Endstationen', () => {
  assert.equal(canTransition('archived', 'sent'), false);
});
