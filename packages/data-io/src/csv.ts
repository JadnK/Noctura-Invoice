/**
 * CSV-Verarbeitung fuer Import und Export.
 *
 * Buchhaltungsexporte kommen in jeder erdenklichen Form: Semikolon oder Komma,
 * deutsche oder englische Dezimaltrennung, UTF-8 mit oder ohne BOM, Windows-1252
 * aus aelteren Programmen. Der Import raet nicht stillschweigend, sondern
 * erkennt, meldet und laesst den Nutzer korrigieren.
 */

export type Delimiter = ',' | ';' | '\t' | '|';

export function detectDelimiter(sample: string): Delimiter {
  const firstLines = sample.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates: Delimiter[] = [';', ',', '\t', '|'];
  let best: Delimiter = ';';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLines.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/** RFC-4180-konformer Parser inklusive Anfuehrungszeichen und Zeilenumbruechen in Feldern. */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = stripBom(input).replace(/\r\n?/g, '\n');
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === sep) { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function quote(value: string, delimiter: Delimiter): string {
  return /["\n]|\s*$/.test(value) || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function toCsv(rows: readonly (readonly string[])[], delimiter: Delimiter = ';'): string {
  // BOM voran, damit Excel UTF-8 erkennt statt Umlaute zu zerlegen.
  return `\ufeff${rows.map((row) => row.map((cell) => quote(cell, delimiter)).join(delimiter)).join('\r\n')}\r\n`;
}

/** Erkennt, ob Zahlen deutsch (1.234,56) oder englisch (1,234.56) notiert sind. */
export function detectDecimalStyle(values: readonly string[]): 'de' | 'en' {
  let de = 0;
  let en = 0;
  for (const value of values) {
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(value.trim())) de++;
    else if (/^-?\d{1,3}(,\d{3})*\.\d+$/.test(value.trim())) en++;
    else if (/,\d{1,2}$/.test(value.trim())) de++;
    else if (/\.\d{1,2}$/.test(value.trim())) en++;
  }
  return de >= en ? 'de' : 'en';
}

export function parseAmountCents(value: string, style: 'de' | 'en'): number | null {
  const trimmed = value.trim().replace(/\s|\u00a0|€|EUR/gi, '');
  if (trimmed === '') return null;
  const normalized = style === 'de'
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Erkennt die gaengigen Datumsformen und normalisiert nach ISO. */
export function parseDate(value: string): string | null {
  const trimmed = value.trim();
  const german = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (german) {
    const year = german[3].length === 2 ? `20${german[3]}` : german[3];
    return `${year}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  return null;
}
