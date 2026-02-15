/** Dateinamen, die auf Windows, macOS und Linux gleichermassen funktionieren. */

const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

const UMLAUTS: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss',
};

export function sanitizeFilename(input: string, maxLength = 120): string {
  let name = input.replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c] ?? c);
  name = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Steuerzeichen, Pfadtrenner und auf Windows verbotene Zeichen
  name = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_');
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(/^[.\s]+|[.\s]+$/g, '');
  if (name === '') name = 'dokument';

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const safeStem = RESERVED.has(stem.toUpperCase()) ? `_${stem}` : stem;
  const truncated = safeStem.slice(0, Math.max(1, maxLength - ext.length));
  return `${truncated}${ext}`;
}

export interface FilenameContext {
  readonly number: string;
  readonly customer: string;
  readonly dateIso: string;
  readonly type: string;
}

/** Loest ein Dateinamensschema auf, z. B. "{NUMMER}_{KUNDE}_{DATUM}". */
export function renderFilename(scheme: string, ctx: FilenameContext, ext = '.pdf'): string {
  const replaced = scheme
    .replace(/\{NUMMER\}/g, ctx.number)
    .replace(/\{KUNDE\}/g, ctx.customer)
    .replace(/\{DATUM\}/g, ctx.dateIso.slice(0, 10))
    .replace(/\{TYP\}/g, ctx.type);
  return sanitizeFilename(`${replaced}${ext}`);
}
