/**
 * Formatpruefung der Umsatzsteuer-Identifikationsnummer.
 *
 * Geprueft wird ausschliesslich die Form, nicht die Existenz. Die inhaltliche
 * Bestaetigung leistet nur eine Abfrage beim Bundeszentralamt fuer Steuern
 * bzw. VIES; sie ist optional und muss vom Nutzer ausgeloest werden.
 */

const PATTERNS: Record<string, RegExp> = {
  DE: /^DE\d{9}$/,
  AT: /^ATU\d{8}$/,
  CH: /^CHE\d{9}(MWST|TVA|IVA)?$/,
  BE: /^BE0\d{9}$/,
  DK: /^DK\d{8}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  IT: /^IT\d{11}$/,
  LU: /^LU\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  CZ: /^CZ\d{8,10}$/,
  SE: /^SE\d{12}$/,
  IE: /^IE\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/,
};

export const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
] as const;

export function normalizeVatId(input: string): string {
  return input.replace(/[\s\u00a0.-]/g, '').toUpperCase();
}

export interface VatIdResult {
  readonly valid: boolean;
  readonly normalized: string;
  readonly country?: string;
  readonly known: boolean;
}

export function validateVatId(input: string): VatIdResult {
  const normalized = normalizeVatId(input);
  const country = normalized.slice(0, 2);
  const pattern = PATTERNS[country];
  if (!pattern) {
    // Unbekanntes Land: grobe Plausibilitaet statt falscher Ablehnung.
    return {
      valid: /^[A-Z]{2}[A-Z0-9]{6,14}$/.test(normalized),
      normalized, country, known: false,
    };
  }
  return { valid: pattern.test(normalized), normalized, country, known: true };
}

export function isEuCountry(code: string): boolean {
  return (EU_COUNTRIES as readonly string[]).includes(code.toUpperCase());
}

/**
 * Vorschlag fuer das Steuerschema eines Kunden. Nur ein Vorschlag: die
 * Entscheidung trifft der Nutzer, die Anwendung leistet keine Steuerberatung.
 */
export function suggestTaxScheme(options: {
  readonly sellerCountry: string;
  readonly buyerCountry: string;
  readonly buyerHasVatId: boolean;
  readonly sellerIsSmallBusiness: boolean;
}): { scheme: string; reason: string } {
  if (options.sellerIsSmallBusiness) {
    return { scheme: 'small_business', reason: 'Kleinunternehmerregelung ist aktiviert.' };
  }
  const same = options.sellerCountry.toUpperCase() === options.buyerCountry.toUpperCase();
  if (same) return { scheme: 'standard', reason: 'Leistung im Inland.' };

  if (isEuCountry(options.buyerCountry) && options.buyerHasVatId) {
    return {
      scheme: 'reverse_charge',
      reason: 'Kunde im EU-Ausland mit Umsatzsteuer-Identifikationsnummer.',
    };
  }
  if (isEuCountry(options.buyerCountry)) {
    return { scheme: 'standard', reason: 'Privatkunde im EU-Ausland.' };
  }
  return { scheme: 'tax_exempt', reason: 'Kunde im Drittland.' };
}
