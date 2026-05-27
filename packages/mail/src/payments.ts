/** Zahlungen: Verbuchung, Restbetrag, Statusableitung, Ueberzahlung. */

export interface Payment {
  readonly id: string;
  readonly amountCents: number;
  readonly paidOn: string;
}

export interface PaymentState {
  readonly paidCents: number;
  readonly openCents: number;
  readonly overpaidCents: number;
  readonly status: 'open' | 'partially_paid' | 'paid' | 'overdue';
  readonly fullyPaidOn: string | null;
}

export function applyPayments(
  grossTotalCents: number,
  payments: readonly Payment[],
  dueDateIso: string,
  todayIso: string,
): PaymentState {
  const sorted = [...payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const paidCents = sorted.reduce((sum, payment) => sum + payment.amountCents, 0);
  const open = grossTotalCents - paidCents;

  let fullyPaidOn: string | null = null;
  let running = 0;
  for (const payment of sorted) {
    running += payment.amountCents;
    if (running >= grossTotalCents && grossTotalCents > 0) {
      fullyPaidOn = payment.paidOn;
      break;
    }
  }

  const overdue = todayIso.slice(0, 10) > dueDateIso.slice(0, 10);
  const status: PaymentState['status'] =
    open <= 0 && grossTotalCents > 0 ? 'paid'
    : paidCents > 0 ? (overdue ? 'overdue' : 'partially_paid')
    : (overdue ? 'overdue' : 'open');

  return {
    paidCents,
    openCents: Math.max(0, open),
    overpaidCents: Math.max(0, -open),
    status,
    fullyPaidOn,
  };
}

/**
 * Verteilt eine Sammelzahlung auf offene Rechnungen, aelteste zuerst.
 * Ein Rest bleibt uebrig statt still zu verschwinden.
 */
export function allocateBulkPayment(
  amountCents: number,
  invoices: readonly { id: string; openCents: number; dueDate: string }[],
): { allocations: { invoiceId: string; amountCents: number }[]; remainingCents: number } {
  const sorted = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allocations: { invoiceId: string; amountCents: number }[] = [];
  let rest = amountCents;

  for (const invoice of sorted) {
    if (rest <= 0) break;
    const amount = Math.min(rest, invoice.openCents);
    if (amount > 0) {
      allocations.push({ invoiceId: invoice.id, amountCents: amount });
      rest -= amount;
    }
  }
  return { allocations, remainingCents: rest };
}
