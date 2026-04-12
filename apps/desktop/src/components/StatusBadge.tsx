import type { InvoiceState } from '@noctura/invoice-core';

const LABELS: Record<InvoiceState, string> = {
  draft: 'Entwurf',
  finalized: 'Finalisiert',
  sent: 'Versendet',
  delivered: 'Zugestellt',
  partially_paid: 'Teilbezahlt',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
  uncollectible: 'Uneinbringlich',
  archived: 'Archiviert',
};

const RAIL: Record<InvoiceState, string> = {
  draft: 'var(--n-state-draft)',
  finalized: 'var(--n-state-finalized)',
  sent: 'var(--n-state-sent)',
  delivered: 'var(--n-state-sent)',
  partially_paid: 'var(--n-state-partially)',
  paid: 'var(--n-state-paid)',
  overdue: 'var(--n-state-overdue)',
  cancelled: 'var(--n-state-cancelled)',
  uncollectible: 'var(--n-state-uncollectible)',
  archived: 'var(--n-state-cancelled)',
};

/** Farbe allein traegt nie die Information: der Text steht immer daneben. */
export function StatusBadge({ state }: { state: InvoiceState }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs"
      style={{ background: 'var(--n-neutral-soft)' }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: RAIL[state] }} />
      {LABELS[state]}
    </span>
  );
}

export function stateRailColor(state: InvoiceState): string {
  return RAIL[state];
}
