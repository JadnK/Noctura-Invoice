/**
 * GiroCode nach EPC069-12 (SEPA Credit Transfer QR).
 *
 * Der erzeugte Text wird unveraendert in einen QR-Code (Fehlerkorrektur M)
 * gerendert. Laengengrenzen sind Vorgabe des Standards, nicht Geschmackssache:
 * Ueberschreitungen fuehren dazu, dass Bank-Apps den Code ablehnen.
 */
import { normalizeIban, validateIban } from './iban.ts';

export interface GiroCodeInput {
  readonly beneficiary: string;
  readonly iban: string;
  readonly bic?: string;
  readonly amountCents: number;
  readonly currency?: 'EUR';
  readonly remittance: string;
  readonly purposeCode?: string;
}

export class GiroCodeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GiroCodeError';
    this.code = code;
  }
}

function amountLine(cents: number): string {
  if (cents <= 0) throw new GiroCodeError('E_AMOUNT', 'Der Betrag muss groesser als null sein.');
  if (cents > 99_999_999_9) throw new GiroCodeError('E_AMOUNT', 'Der Betrag ueberschreitet das Limit des Standards.');
  return `EUR${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function buildGiroCode(input: GiroCodeInput): string {
  const iban = validateIban(input.iban);
  if (!iban.valid) throw new GiroCodeError('E_IBAN', 'Die IBAN ist ungueltig.');

  const beneficiary = input.beneficiary.trim().slice(0, 70);
  if (beneficiary === '') throw new GiroCodeError('E_BENEFICIARY', 'Der Empfaenger fehlt.');

  const remittance = input.remittance.trim().slice(0, 140);

  return [
    'BCD',            // Service-Tag
    '002',            // Version
    '1',              // UTF-8
    'SCT',            // SEPA Credit Transfer
    (input.bic ?? '').trim().toUpperCase(),
    beneficiary,
    normalizeIban(input.iban),
    amountLine(input.amountCents),
    input.purposeCode ?? '',
    '',               // Structured Reference
    remittance,
    '',               // Beneficiary to originator information
  ].join('\n');
}

/** Verwendungszweck aus Rechnungsnummer und Kunde, gekuerzt auf 140 Zeichen. */
export function remittanceFor(invoiceNumber: string, customerNumber?: string): string {
  const parts = [`Rechnung ${invoiceNumber}`];
  if (customerNumber) parts.push(`Kd. ${customerNumber}`);
  return parts.join(', ').slice(0, 140);
}
