/**
 * IBAN-Pruefung nach ISO 13616 (Mod-97-10) und Anzeigeformatierung.
 * Die Laengen stammen aus dem IBAN-Registry; unbekannte Laender werden
 * strukturell geprueft, aber nicht auf Laenge.
 */

const LENGTHS: Record<string, number> = {
  DE: 22, AT: 20, CH: 21, LI: 21, LU: 20, NL: 18, BE: 16, FR: 27, IT: 27,
  ES: 24, PT: 25, PL: 28, CZ: 24, DK: 18, SE: 24, NO: 15, FI: 18, GB: 22,
  IE: 22, HU: 28, SK: 24, SI: 19, HR: 21, RO: 24, BG: 22, GR: 27, EE: 20,
  LV: 21, LT: 20, MT: 31, CY: 28,
};

export type IbanProblem =
  | 'EMPTY' | 'CHARSET' | 'TOO_SHORT' | 'COUNTRY_LENGTH' | 'CHECKSUM';

export interface IbanResult {
  readonly valid: boolean;
  readonly problem?: IbanProblem;
  readonly normalized: string;
  readonly country?: string;
}

export function normalizeIban(input: string): string {
  return input.replace(/[\s\u00a0-]/g, '').toUpperCase();
}

function mod97(iban: string): number {
  // Die ersten vier Zeichen wandern ans Ende, Buchstaben werden zu Zahlen.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

export function validateIban(input: string): IbanResult {
  const normalized = normalizeIban(input);
  if (normalized === '') return { valid: false, problem: 'EMPTY', normalized };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, problem: 'CHARSET', normalized };
  }
  if (normalized.length < 15) return { valid: false, problem: 'TOO_SHORT', normalized };

  const country = normalized.slice(0, 2);
  const expected = LENGTHS[country];
  if (expected !== undefined && normalized.length !== expected) {
    return { valid: false, problem: 'COUNTRY_LENGTH', normalized, country };
  }
  if (mod97(normalized) !== 1) {
    return { valid: false, problem: 'CHECKSUM', normalized, country };
  }
  return { valid: true, normalized, country };
}

/** Anzeige in Vierergruppen: DE89 3704 0044 0532 0130 00 */
export function formatIban(input: string): string {
  return normalizeIban(input).replace(/(.{4})/g, '$1 ').trim();
}

export const IBAN_PROBLEM_TEXT: Record<IbanProblem, string> = {
  EMPTY: 'Bitte eine IBAN eingeben.',
  CHARSET: 'Die IBAN enthält unzulässige Zeichen.',
  TOO_SHORT: 'Die IBAN ist zu kurz.',
  COUNTRY_LENGTH: 'Die Länge passt nicht zum Länderkürzel.',
  CHECKSUM: 'Die Prüfziffer stimmt nicht. Bitte Eingabe kontrollieren.',
};
