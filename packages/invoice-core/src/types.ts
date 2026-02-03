/** Gemeinsame Typen der Berechnungskerns. Keine Laufzeitwerte ausser Konstanten. */

export const TAX_SCHEMES = [
  'standard',
  'small_business',
  'reverse_charge',
  'intra_community',
  'tax_exempt',
] as const;
export type TaxScheme = (typeof TAX_SCHEMES)[number];

/** Schemata, in denen keine Umsatzsteuer ausgewiesen wird. */
export const ZERO_TAX_SCHEMES: readonly TaxScheme[] = [
  'small_business',
  'reverse_charge',
  'intra_community',
  'tax_exempt',
];

export const LINE_KINDS = [
  'item',
  'heading',
  'text',
  'subtotal',
  'page_break',
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type Discount =
  | { readonly kind: 'percent'; readonly valueBp: number }
  | { readonly kind: 'fixed'; readonly valueCents: number };

export interface LineInput {
  readonly id: string;
  readonly kind: LineKind;
  /** Menge in Milli-Einheiten. 1,5 h = 1500. */
  readonly quantityMilli?: number;
  /** Einzelpreis im Preismodus des Belegs (netto oder brutto). */
  readonly unitPriceCents?: number;
  readonly taxRateBp?: number;
  readonly discount?: Discount;
  /** Positionen mit `hidden` erscheinen im PDF nicht und zaehlen nicht mit. */
  readonly hidden?: boolean;
}

export interface DocumentInput {
  /** true: Einzelpreise sind Bruttopreise. */
  readonly pricesIncludeTax: boolean;
  readonly taxScheme: TaxScheme;
  readonly lines: readonly LineInput[];
  /** Rabatt auf den gesamten Beleg, nach Positionsrabatten. */
  readonly documentDiscount?: Discount;
  /** Bereits verbuchte Zahlungen. */
  readonly paidCents?: number;
  readonly currency?: string;
}

export interface CalculatedLine {
  readonly id: string;
  readonly kind: LineKind;
  /** Menge mal Einzelpreis, vor jedem Rabatt, im Preismodus. */
  readonly grossOfDiscountCents: number;
  readonly lineDiscountCents: number;
  /** Anteil des Belegrabatts, der auf diese Position entfaellt. */
  readonly documentDiscountShareCents: number;
  readonly netCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly taxRateBp: number;
}

export interface TaxGroup {
  readonly taxRateBp: number;
  readonly netCents: number;
  readonly taxCents: number;
  readonly grossCents: number;
}

export interface CalculationResult {
  readonly lines: readonly CalculatedLine[];
  /** Summe der Positionen vor allen Rabatten, netto gerechnet. */
  readonly subtotalCents: number;
  readonly lineDiscountTotalCents: number;
  readonly documentDiscountCents: number;
  readonly netTotalCents: number;
  readonly taxGroups: readonly TaxGroup[];
  readonly taxTotalCents: number;
  readonly grossTotalCents: number;
  readonly paidCents: number;
  readonly openCents: number;
  readonly taxScheme: TaxScheme;
  readonly taxExempt: boolean;
}
