/** Faelligkeit, Skonto und Verzug. Alles auf Kalendertagen, ohne Zeitzonenlogik. */

const DAY = 86_400_000;

export function addDays(dateIso: string, days: number): string {
  const base = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  return new Date(base + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY,
  );
}

export function dueDate(issueDateIso: string, termDays: number): string {
  return addDays(issueDateIso, termDays);
}

/** Skontobetrag in Cent, gerundet wie alle Geldwerte kaufmaennisch. */
export function earlyPaymentDiscount(grossCents: number, percentBp: number): number {
  const product = grossCents * percentBp;
  const negative = product < 0;
  const abs = Math.abs(product);
  const quotient = Math.floor(abs / 10_000);
  const remainder = abs - quotient * 10_000;
  const rounded = remainder * 2 >= 10_000 ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

export interface OverdueInfo {
  readonly overdue: boolean;
  readonly daysOverdue: number;
  /** Karenztage sind abgelaufen, eine Mahnung ist vertretbar. */
  readonly dunnable: boolean;
}

export function overdueInfo(dueIso: string, todayIso: string, graceDays = 3): OverdueInfo {
  const days = daysBetween(dueIso, todayIso);
  return {
    overdue: days > 0,
    daysOverdue: Math.max(0, days),
    dunnable: days > graceDays,
  };
}

/**
 * Verzugszinsen. Der Basiszinssatz aendert sich halbjaehrlich und wird deshalb
 * nicht fest verdrahtet, sondern konfiguriert. Berechnung taggenau nach
 * tatsaechlichen Tagen / 365.
 */
export function defaultInterest(options: {
  readonly openCents: number;
  readonly daysOverdue: number;
  /** Gesamtsatz in Basispunkten, z. B. Basiszins + 9 Prozentpunkte bei B2B. */
  readonly annualRateBp: number;
}): number {
  const numerator = options.openCents * options.annualRateBp * options.daysOverdue;
  const denominator = 10_000 * 365;
  const quotient = Math.floor(Math.abs(numerator) / denominator);
  const remainder = Math.abs(numerator) - quotient * denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return numerator < 0 ? -rounded : rounded;
}
