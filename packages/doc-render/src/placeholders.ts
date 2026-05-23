/**
 * Platzhalter in Vorlagentexten: {{gruppe.feld}}.
 *
 * Aufgeloest wird ausschliesslich gegen ein flaches Verzeichnis bekannter
 * Werte. Unbekannte Platzhalter werden entfernt und gemeldet, nicht roh
 * ausgegeben — im PDF eines Kunden hat {{firma.iban}} nichts verloren.
 */

export type PlaceholderContext = Readonly<Record<string, string>>;

const PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export interface ResolveResult {
  readonly text: string;
  readonly unknown: readonly string[];
}

export function resolvePlaceholders(template: string, context: PlaceholderContext): ResolveResult {
  const unknown: string[] = [];
  const text = template.replace(PATTERN, (_match, key: string) => {
    const value = context[key];
    if (value === undefined) {
      unknown.push(key);
      return '';
    }
    return value;
  });
  return { text: text.replace(/[ \t]{2,}/g, ' ').trimEnd(), unknown };
}

/** Alle im Text verwendeten Platzhalter, fuer die Pruefung im Editor. */
export function usedPlaceholders(template: string): string[] {
  return [...template.matchAll(PATTERN)].map((m) => m[1]);
}

export const KNOWN_PLACEHOLDERS = [
  'firma.name', 'firma.strasse', 'firma.plz', 'firma.ort', 'firma.land',
  'firma.telefon', 'firma.email', 'firma.website', 'firma.ustId',
  'firma.steuernummer', 'firma.iban', 'firma.bic', 'firma.bank',
  'firma.fusszeile', 'firma.geschaeftsfuehrer', 'firma.registergericht',
  'kunde.name', 'kunde.firma', 'kunde.anrede', 'kunde.strasse', 'kunde.plz',
  'kunde.ort', 'kunde.land', 'kunde.nummer', 'kunde.ustId', 'kunde.ansprechpartner',
  'beleg.nummer', 'beleg.datum', 'beleg.leistungsdatum', 'beleg.faelligAm',
  'beleg.einleitung', 'beleg.schlusstext', 'beleg.referenz', 'beleg.projekt',
  'beleg.netto', 'beleg.steuer', 'beleg.brutto', 'beleg.offen', 'beleg.waehrung',
  'beleg.steuerhinweis', 'beleg.zahlungsziel',
] as const;

export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(KNOWN_PLACEHOLDERS);
  return [...new Set(usedPlaceholders(template).filter((key) => !known.has(key)))];
}
