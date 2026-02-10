/** Nummernkreise: Muster aufloesen, Zaehler fortschreiben, Zuruecksetzen. */

export const DOC_TYPES = ['invoice', 'quote', 'credit_note', 'cancellation', 'customer', 'product'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const TYPE_SHORT: Record<DocType, string> = {
  invoice: 'RE',
  quote: 'ANG',
  credit_note: 'GS',
  cancellation: 'ST',
  customer: 'KD',
  product: 'PR',
};

export type ResetMode = 'never' | 'yearly' | 'monthly';

export interface NumberSequence {
  readonly docType: DocType;
  /** z. B. "RE-{YYYY}-{COUNTER}" */
  readonly pattern: string;
  readonly nextCounter: number;
  readonly padding: number;
  readonly resetMode: ResetMode;
  /** Zuletzt genutzte Periode, "2026" oder "2026-07". */
  readonly lastResetPeriod?: string;
}

export class NumberingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'NumberingError';
    this.code = code;
  }
}

const PLACEHOLDER = /\{(YYYY|YY|MM|DD|COUNTER|CUSTOMER|TYPE)\}/g;

export function periodOf(dateIso: string, mode: ResetMode): string | undefined {
  if (mode === 'never') return undefined;
  return mode === 'yearly' ? dateIso.slice(0, 4) : dateIso.slice(0, 7);
}

export interface RenderContext {
  readonly dateIso: string;
  readonly counter: number;
  readonly padding: number;
  readonly docType: DocType;
  readonly customerNumber?: string;
}

export function renderPattern(pattern: string, ctx: RenderContext): string {
  if (!pattern.includes('{COUNTER}')) {
    throw new NumberingError('E_NO_COUNTER', 'Das Muster muss {COUNTER} enthalten.');
  }
  const [year, month, day] = ctx.dateIso.slice(0, 10).split('-');
  return pattern.replace(PLACEHOLDER, (_match, token: string) => {
    switch (token) {
      case 'YYYY': return year;
      case 'YY': return year.slice(2);
      case 'MM': return month;
      case 'DD': return day;
      case 'COUNTER': return String(ctx.counter).padStart(ctx.padding, '0');
      case 'TYPE': return TYPE_SHORT[ctx.docType];
      case 'CUSTOMER': return ctx.customerNumber ?? '';
      default: return '';
    }
  });
}

export interface NextNumberResult {
  readonly number: string;
  readonly sequence: NumberSequence;
}

/**
 * Naechste Nummer ziehen. Setzt den Zaehler zurueck, wenn die konfigurierte
 * Periode gewechselt hat. Der Aufrufer muss dies in derselben Transaktion
 * speichern, in der der Beleg finalisiert wird.
 */
export function nextNumber(
  sequence: NumberSequence,
  dateIso: string,
  customerNumber?: string,
): NextNumberResult {
  const period = periodOf(dateIso, sequence.resetMode);
  const resets = period !== undefined && period !== sequence.lastResetPeriod;
  const counter = resets ? 1 : sequence.nextCounter;

  const number = renderPattern(sequence.pattern, {
    dateIso,
    counter,
    padding: sequence.padding,
    docType: sequence.docType,
    customerNumber,
  });

  return {
    number,
    sequence: { ...sequence, nextCounter: counter + 1, lastResetPeriod: period },
  };
}

/** Vorschau der naechsten drei Nummern, ohne den Zaehler zu veraendern. */
export function previewNumbers(
  sequence: NumberSequence,
  dateIso: string,
  count = 3,
): string[] {
  const out: string[] = [];
  let current = sequence;
  for (let i = 0; i < count; i++) {
    const result = nextNumber(current, dateIso);
    out.push(result.number);
    current = result.sequence;
  }
  return out;
}
