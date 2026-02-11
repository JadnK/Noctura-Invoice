/** Belegstatus und erlaubte Uebergaenge. */

export const INVOICE_STATES = [
  'draft', 'finalized', 'sent', 'delivered', 'partially_paid', 'paid',
  'overdue', 'cancelled', 'uncollectible', 'archived',
] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

const TRANSITIONS: Record<InvoiceState, readonly InvoiceState[]> = {
  draft: ['finalized'],
  finalized: ['sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'archived'],
  sent: ['delivered', 'partially_paid', 'paid', 'overdue', 'cancelled', 'archived'],
  delivered: ['partially_paid', 'paid', 'overdue', 'cancelled', 'archived'],
  partially_paid: ['paid', 'overdue', 'cancelled', 'uncollectible', 'archived'],
  paid: ['archived', 'cancelled'],
  overdue: ['partially_paid', 'paid', 'cancelled', 'uncollectible', 'archived'],
  cancelled: ['archived'],
  uncollectible: ['paid', 'archived'],
  archived: [],
};

/** Ab hier ist der Beleg unveraenderlich; Korrekturen nur ueber Storno/Gutschrift. */
export const IMMUTABLE_STATES: readonly InvoiceState[] = INVOICE_STATES.filter(
  (s) => s !== 'draft',
);

export function canTransition(from: InvoiceState, to: InvoiceState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isEditable(state: InvoiceState): boolean {
  return state === 'draft';
}

export class StateError extends Error {
  readonly code = 'E_INVALID_TRANSITION';
  constructor(from: InvoiceState, to: InvoiceState) {
    super(`Statuswechsel von "${from}" nach "${to}" ist nicht vorgesehen.`);
    this.name = 'StateError';
  }
}

export function assertTransition(from: InvoiceState, to: InvoiceState): void {
  if (!canTransition(from, to)) throw new StateError(from, to);
}
