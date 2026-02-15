/**
 * Geldarithmetik. Siehe ADR-0001.
 *
 * Grundregeln dieses Moduls:
 *  - Betraege sind ganzzahlige Cent (kleinste Waehrungseinheit).
 *  - Prozentwerte sind Basispunkte: 1900 = 19,00 %.
 *  - Mengen sind Milli-Einheiten: 1500 = 1,5.
 *  - Es gibt genau eine Rundungsfunktion. Kein Modul rundet selbst.
 *
 * Fliesskommazahlen kommen hier nicht vor.
 */

export const BP_SCALE = 10_000;
export const QTY_SCALE = 1_000;

/** Groesster Betrag, der zusammen mit Zwischenskalierung sicher bleibt. */
export const MAX_SAFE_CENTS = 9_007_199_254_740; // ~90 Mrd. EUR

export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

function assertSafeInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError('E_NOT_INTEGER', `${label} muss ganzzahlig sein, war ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError('E_OVERFLOW', `${label} verlaesst den sicheren Ganzzahlbereich`);
  }
}

/**
 * Kaufmaennische Rundung einer Division: halbe Werte werden von der Null
 * weggerundet. -2,5 wird zu -3, 2,5 wird zu 3.
 */
export function divRound(numerator: number, denominator: number): number {
  assertSafeInt(numerator, 'Zaehler');
  assertSafeInt(denominator, 'Nenner');
  if (denominator === 0) {
    throw new MoneyError('E_DIV_ZERO', 'Division durch null');
  }
  const negative = numerator < 0 !== denominator < 0;
  const absNum = Math.abs(numerator);
  const absDen = Math.abs(denominator);
  const quotient = Math.floor(absNum / absDen);
  const remainder = absNum - quotient * absDen;
  const rounded = remainder * 2 >= absDen ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

/** (a * b) / d mit kaufmaennischer Rundung, ohne Zwischenrundung. */
export function mulDivRound(a: number, b: number, d: number): number {
  assertSafeInt(a, 'Faktor a');
  assertSafeInt(b, 'Faktor b');
  const product = a * b;
  assertSafeInt(product, 'Produkt');
  return divRound(product, d);
}

/** Anteil eines Betrags in Basispunkten, gerundet. */
export function applyBp(amountCents: number, bp: number): number {
  return mulDivRound(amountCents, bp, BP_SCALE);
}

/** Betrag nach Abzug eines Prozentrabatts in Basispunkten. */
export function reduceByBp(amountCents: number, bp: number): number {
  if (bp < 0 || bp > BP_SCALE) {
    throw new MoneyError('E_BP_RANGE', `Rabatt ausserhalb 0..100 %: ${bp} bp`);
  }
  return mulDivRound(amountCents, BP_SCALE - bp, BP_SCALE);
}

/** Nettobetrag aus einem Bruttobetrag bei gegebenem Steuersatz. */
export function netFromGross(grossCents: number, taxRateBp: number): number {
  return mulDivRound(grossCents, BP_SCALE, BP_SCALE + taxRateBp);
}

/** Steuerbetrag auf einen Nettobetrag. */
export function taxOnNet(netCents: number, taxRateBp: number): number {
  return applyBp(netCents, taxRateBp);
}

/**
 * Verteilt einen Betrag gewichtet auf n Empfaenger, ohne Centverlust.
 * Groesster-Rest-Verfahren: die Summe der Rueckgabe ist exakt `totalCents`.
 * Bei Gewichtssumme 0 wird gleichmaessig verteilt.
 */
export function allocate(totalCents: number, weights: readonly number[]): number[] {
  assertSafeInt(totalCents, 'Verteilbetrag');
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum === 0) {
    const even = Math.trunc(totalCents / weights.length);
    const parts = weights.map(() => even);
    let rest = totalCents - even * weights.length;
    const step = rest < 0 ? -1 : 1;
    for (let i = 0; rest !== 0; i = (i + 1) % parts.length) {
      parts[i] += step;
      rest -= step;
    }
    return parts;
  }

  const floors: number[] = [];
  const remainders: Array<{ index: number; rest: number }> = [];
  let assigned = 0;
  for (let i = 0; i < weights.length; i++) {
    const exact = totalCents * weights[i];
    const share = Math.trunc(exact / weightSum);
    floors.push(share);
    assigned += share;
    remainders.push({ index: i, rest: Math.abs(exact - share * weightSum) });
  }
  let leftover = totalCents - assigned;
  const step = leftover < 0 ? -1 : 1;
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  let cursor = 0;
  while (leftover !== 0) {
    floors[remainders[cursor % remainders.length].index] += step;
    leftover -= step;
    cursor++;
  }
  return floors;
}

/** Menge (Milli-Einheiten) mal Einzelpreis, gerundet auf Cent. */
export function lineAmount(quantityMilli: number, unitPriceCents: number): number {
  return mulDivRound(quantityMilli, unitPriceCents, QTY_SCALE);
}

/** Deutsche Darstellung, z. B. 123456 -> "1.234,56 €". */
export function formatCents(cents: number, currency = 'EUR', locale = 'de-DE'): string {
  assertSafeInt(cents, 'Betrag');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Basispunkte lesbar machen: 1900 -> "19 %", 750 -> "7,5 %". */
export function formatBp(bp: number, locale = 'de-DE'): string {
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100);
  return `${value} %`;
}

/**
 * Parst eine deutsche Betragseingabe zu Cent. Akzeptiert "1.234,56",
 * "1234,5", "1234.56", " 12 ". Wirft bei allem anderen.
 */
export function parseCents(input: string): number {
  const trimmed = input.trim().replace(/\s|\u00a0/g, '');
  if (trimmed === '') throw new MoneyError('E_PARSE', 'Leere Betragseingabe');
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new MoneyError('E_PARSE', `Betrag nicht lesbar: ${input}`);
  }
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}
