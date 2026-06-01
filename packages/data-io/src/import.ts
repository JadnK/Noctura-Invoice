/**
 * Importlauf: Spaltenzuordnung, Validierung, Duplikaterkennung, Fehlerbericht.
 *
 * Ein Import bricht nicht beim ersten Fehler ab. Er sammelt alles ein, meldet
 * zeilenweise und uebernimmt nur, was der Nutzer nach der Vorschau bestaetigt.
 */
import { parseAmountCents, parseDate } from './csv.ts';

export type FieldType = 'text' | 'email' | 'amount' | 'date' | 'percent' | 'integer';

export interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required?: boolean;
  /** Kopfzeilen anderer Programme, die auf dieses Feld passen. */
  readonly aliases?: readonly string[];
}

export const CUSTOMER_FIELDS: readonly FieldSpec[] = [
  { key: 'company', label: 'Firma', type: 'text', aliases: ['firma', 'unternehmen', 'company', 'name'] },
  { key: 'lastName', label: 'Nachname', type: 'text', aliases: ['nachname', 'name2', 'last name'] },
  { key: 'firstName', label: 'Vorname', type: 'text', aliases: ['vorname', 'first name'] },
  { key: 'email', label: 'E-Mail', type: 'email', aliases: ['e-mail', 'email', 'mail'] },
  { key: 'street', label: 'Straße', type: 'text', aliases: ['strasse', 'straße', 'street', 'adresse'] },
  { key: 'postalCode', label: 'PLZ', type: 'text', aliases: ['plz', 'postleitzahl', 'zip'] },
  { key: 'city', label: 'Ort', type: 'text', aliases: ['ort', 'stadt', 'city'] },
  { key: 'vatId', label: 'USt-IdNr.', type: 'text', aliases: ['ustid', 'ust-idnr', 'vat'] },
  { key: 'discountBp', label: 'Rabatt', type: 'percent', aliases: ['rabatt', 'discount'] },
];

export const PRODUCT_FIELDS: readonly FieldSpec[] = [
  { key: 'sku', label: 'Artikelnummer', type: 'text', required: true, aliases: ['sku', 'artikelnummer', 'nummer', 'art-nr'] },
  { key: 'name', label: 'Bezeichnung', type: 'text', required: true, aliases: ['name', 'bezeichnung', 'titel'] },
  { key: 'netPriceCents', label: 'Nettopreis', type: 'amount', required: true, aliases: ['preis', 'nettopreis', 'price', 'einzelpreis'] },
  { key: 'taxRateBp', label: 'Steuersatz', type: 'percent', aliases: ['mwst', 'steuer', 'ust', 'tax'] },
  { key: 'unit', label: 'Einheit', type: 'text', aliases: ['einheit', 'unit'] },
];

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, '').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

/** Schlaegt eine Spaltenzuordnung vor. Der Nutzer kann sie ueberschreiben. */
export function suggestMapping(header: readonly string[], fields: readonly FieldSpec[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalizedHeader = header.map(normalizeHeader);
  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(normalizeHeader);
    const index = normalizedHeader.findIndex((column) => candidates.includes(column));
    if (index >= 0) mapping[field.key] = index;
  }
  return mapping;
}

export interface RowIssue {
  readonly row: number;
  readonly field: string;
  readonly message: string;
}

export interface ImportPreview<T> {
  readonly rows: readonly T[];
  readonly issues: readonly RowIssue[];
  readonly duplicatesInFile: readonly number[];
  readonly duplicatesInDatabase: readonly number[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function buildPreview<T extends Record<string, unknown>>(options: {
  readonly rows: readonly (readonly string[])[];
  readonly mapping: Record<string, number>;
  readonly fields: readonly FieldSpec[];
  readonly decimalStyle: 'de' | 'en';
  /** Feld, das einen Datensatz eindeutig macht, z. B. `sku` oder `email`. */
  readonly identityField: string;
  readonly existingIdentities?: ReadonlySet<string>;
}): ImportPreview<T> {
  const issues: RowIssue[] = [];
  const parsed: T[] = [];
  const seen = new Map<string, number>();
  const duplicatesInFile: number[] = [];
  const duplicatesInDatabase: number[] = [];

  options.rows.forEach((cells, index) => {
    const rowNumber = index + 2; // Zeile 1 ist die Kopfzeile
    const record: Record<string, unknown> = {};

    for (const field of options.fields) {
      const column = options.mapping[field.key];
      const raw = column === undefined ? '' : (cells[column] ?? '').trim();

      if (raw === '') {
        if (field.required) issues.push({ row: rowNumber, field: field.key, message: `${field.label} fehlt.` });
        continue;
      }

      switch (field.type) {
        case 'amount': {
          const cents = parseAmountCents(raw, options.decimalStyle);
          if (cents === null) issues.push({ row: rowNumber, field: field.key, message: `„${raw}“ ist kein gültiger Betrag.` });
          else record[field.key] = cents;
          break;
        }
        case 'percent': {
          const cents = parseAmountCents(raw.replace('%', ''), options.decimalStyle);
          if (cents === null) issues.push({ row: rowNumber, field: field.key, message: `„${raw}“ ist kein gültiger Prozentwert.` });
          else record[field.key] = cents; // Cent einer Prozentzahl entspricht Basispunkten
          break;
        }
        case 'date': {
          const iso = parseDate(raw);
          if (iso === null) issues.push({ row: rowNumber, field: field.key, message: `„${raw}“ ist kein erkennbares Datum.` });
          else record[field.key] = iso;
          break;
        }
        case 'email': {
          if (!EMAIL.test(raw)) issues.push({ row: rowNumber, field: field.key, message: `„${raw}“ ist keine gültige E-Mail-Adresse.` });
          else record[field.key] = raw;
          break;
        }
        case 'integer': {
          if (!/^-?\d+$/.test(raw)) issues.push({ row: rowNumber, field: field.key, message: `„${raw}“ ist keine ganze Zahl.` });
          else record[field.key] = Number(raw);
          break;
        }
        default:
          record[field.key] = raw;
      }
    }

    const identity = String(record[options.identityField] ?? '').toLowerCase();
    if (identity !== '') {
      if (seen.has(identity)) duplicatesInFile.push(rowNumber);
      else seen.set(identity, rowNumber);
      if (options.existingIdentities?.has(identity)) duplicatesInDatabase.push(rowNumber);
    }

    parsed.push(record as T);
  });

  return { rows: parsed, issues, duplicatesInFile, duplicatesInDatabase };
}

export function importableRows<T>(preview: ImportPreview<T>): number {
  const broken = new Set(preview.issues.map((issue) => issue.row));
  const duplicates = new Set([...preview.duplicatesInFile, ...preview.duplicatesInDatabase]);
  return preview.rows.filter((_, index) => !broken.has(index + 2) && !duplicates.has(index + 2)).length;
}
