import {
  allocate,
  applyBp,
  lineAmount,
  netFromGross,
  reduceByBp,
  MoneyError,
} from './money.ts';
import { ZERO_TAX_SCHEMES } from './types.ts';
import type {
  CalculatedLine,
  CalculationResult,
  Discount,
  DocumentInput,
  LineInput,
  TaxGroup,
} from './types.ts';

function isCountingLine(line: LineInput): boolean {
  return line.kind === 'item' && line.hidden !== true;
}

function discountAmount(baseCents: number, discount: Discount | undefined): number {
  if (!discount) return 0;
  if (discount.kind === 'percent') {
    return baseCents - reduceByBp(baseCents, discount.valueBp);
  }
  // Ein fester Rabatt kann den Positionswert nicht ins Negative druecken.
  if (baseCents >= 0) return Math.min(discount.valueCents, baseCents);
  return Math.max(-discount.valueCents, baseCents);
}

/**
 * Berechnet einen Beleg vollstaendig.
 *
 * Reihenfolge, bewusst festgelegt und getestet:
 *   1. Positionsbetrag  = Menge x Einzelpreis, auf Cent gerundet
 *   2. Positionsrabatt   abziehen
 *   3. Belegrabatt       gewichtet auf die Positionen verteilen (kein Centverlust)
 *   4. Netto ermitteln   (bei Bruttopreisen herausrechnen, je Steuergruppe)
 *   5. Steuer je Steuersatz auf die Gruppensumme, nicht je Position
 *
 * Schritt 5 ist der Grund, warum die Steuersumme einer Rechnung nie von der
 * Summe gerundeter Positionssteuern abweicht.
 */
export function calculateDocument(input: DocumentInput): CalculationResult {
  const taxExempt = ZERO_TAX_SCHEMES.includes(input.taxScheme);
  const counting = input.lines.filter(isCountingLine);

  // Schritt 1 und 2
  const base = counting.map((line) => {
    const quantityMilli = line.quantityMilli ?? 0;
    const unitPriceCents = line.unitPriceCents ?? 0;
    const rawCents = lineAmount(quantityMilli, unitPriceCents);
    const lineDiscountCents = discountAmount(rawCents, line.discount);
    const taxRateBp = taxExempt ? 0 : (line.taxRateBp ?? 0);
    if (taxRateBp < 0) {
      throw new MoneyError('E_TAX_RATE', `Negativer Steuersatz in Position ${line.id}`);
    }
    return {
      line,
      rawCents,
      lineDiscountCents,
      afterLineDiscountCents: rawCents - lineDiscountCents,
      taxRateBp,
    };
  });

  const afterLineDiscountTotal = base.reduce((sum, b) => sum + b.afterLineDiscountCents, 0);

  // Schritt 3: Belegrabatt gewichtet verteilen
  const documentDiscountCents = discountAmount(afterLineDiscountTotal, input.documentDiscount);
  const shares = allocate(
    documentDiscountCents,
    base.map((b) => b.afterLineDiscountCents),
  );

  const priced = base.map((b, i) => ({
    ...b,
    documentDiscountShareCents: shares[i] ?? 0,
    effectiveCents: b.afterLineDiscountCents - (shares[i] ?? 0),
  }));

  // Schritt 4 und 5: nach Steuersatz gruppieren
  const byRate = new Map<number, typeof priced>();
  for (const entry of priced) {
    const bucket = byRate.get(entry.taxRateBp);
    if (bucket) bucket.push(entry);
    else byRate.set(entry.taxRateBp, [entry]);
  }

  const taxGroups: TaxGroup[] = [];
  const lineNet = new Map<string, number>();
  const lineTax = new Map<string, number>();

  for (const [taxRateBp, entries] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const groupAmount = entries.reduce((sum, e) => sum + e.effectiveCents, 0);
    let groupNet: number;
    let groupTax: number;

    if (input.pricesIncludeTax && !taxExempt) {
      groupNet = netFromGross(groupAmount, taxRateBp);
      groupTax = groupAmount - groupNet;
    } else {
      groupNet = groupAmount;
      groupTax = taxExempt ? 0 : applyBp(groupNet, taxRateBp);
    }

    // Gruppenwerte zurueck auf die Positionen verteilen, damit die
    // Positionsanzeige zur Summe passt.
    const weights = entries.map((e) => e.effectiveCents);
    const netParts = allocate(groupNet, weights);
    const taxParts = allocate(groupTax, weights);
    entries.forEach((entry, i) => {
      lineNet.set(entry.line.id, netParts[i]);
      lineTax.set(entry.line.id, taxParts[i]);
    });

    taxGroups.push({
      taxRateBp,
      netCents: groupNet,
      taxCents: groupTax,
      grossCents: groupNet + groupTax,
    });
  }

  const lines: CalculatedLine[] = priced.map((entry) => {
    const netCents = lineNet.get(entry.line.id) ?? 0;
    const taxCents = lineTax.get(entry.line.id) ?? 0;
    return {
      id: entry.line.id,
      kind: entry.line.kind,
      grossOfDiscountCents: entry.rawCents,
      lineDiscountCents: entry.lineDiscountCents,
      documentDiscountShareCents: entry.documentDiscountShareCents,
      netCents,
      taxCents,
      totalCents: netCents + taxCents,
      taxRateBp: entry.taxRateBp,
    };
  });

  const netTotalCents = taxGroups.reduce((sum, g) => sum + g.netCents, 0);
  const taxTotalCents = taxGroups.reduce((sum, g) => sum + g.taxCents, 0);
  const grossTotalCents = netTotalCents + taxTotalCents;
  const paidCents = input.paidCents ?? 0;

  // Zwischensumme wird im Preismodus des Belegs ausgewiesen, damit sie zu den
  // angezeigten Einzelpreisen passt.
  const subtotalCents = base.reduce((sum, b) => sum + b.rawCents, 0);
  const lineDiscountTotalCents = base.reduce((sum, b) => sum + b.lineDiscountCents, 0);

  return {
    lines,
    subtotalCents,
    lineDiscountTotalCents,
    documentDiscountCents,
    netTotalCents,
    taxGroups,
    taxTotalCents,
    grossTotalCents,
    paidCents,
    openCents: grossTotalCents - paidCents,
    taxScheme: input.taxScheme,
    taxExempt,
  };
}

/** Zahlungsstatus aus Berechnung und Faelligkeit ableiten. */
export function derivePaymentState(
  result: CalculationResult,
  dueDateIso: string,
  todayIso: string,
): 'open' | 'partially_paid' | 'paid' | 'overdue' {
  if (result.paidCents >= result.grossTotalCents && result.grossTotalCents !== 0) return 'paid';
  const overdue = todayIso > dueDateIso;
  if (result.paidCents > 0) return overdue ? 'overdue' : 'partially_paid';
  return overdue ? 'overdue' : 'open';
}
