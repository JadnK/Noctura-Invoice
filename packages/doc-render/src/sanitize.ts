/**
 * Absicherung von Vorlageninhalten.
 *
 * Grundsatz: Vorlagen sind Daten. Alles, was wie Code aussieht, wird nicht
 * bereinigt, sondern entfernt. Eine halb entschaerfte Vorlage ist ein Risiko,
 * eine leere ist nur ein Aergernis.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Eigenschaften, die sich zuverlaessig nach Typst uebersetzen lassen. */
export const ALLOWED_CSS_PROPERTIES = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-transform', 'letter-spacing', 'line-height',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-color', 'border-width',
  'width', 'max-width',
]);

export interface CssResult {
  readonly css: string;
  readonly removed: readonly string[];
}

/**
 * Filtert CSS auf die Positivliste. Entfernt werden ausserdem At-Regeln,
 * `url(...)`, `expression(...)` und alles mit `javascript:`.
 */
export function sanitizeCss(input: string): CssResult {
  const removed: string[] = [];
  const withoutComments = input.replace(/\/\*[\s\S]*?\*\//g, '');

  // Freistehende At-Regeln wie @import oder @charset zuerst entfernen, sonst
  // wuerden sie als Teil des naechsten Selektors gelesen und wuerden dessen
  // gueltige Deklarationen mitreissen.
  const withoutAtStatements = withoutComments.replace(/@[^;{}]*;/g, (match) => {
    removed.push(match.trim());
    return '';
  });
  const rules: string[] = [];

  for (const match of withoutAtStatements.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) {
      removed.push(selector);
      continue;
    }
    const declarations: string[] = [];
    for (const declaration of match[2].split(';')) {
      const [rawProperty, ...rest] = declaration.split(':');
      const property = rawProperty.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (property === '' || value === '') continue;
      const dangerous = /url\s*\(|expression\s*\(|javascript:|@import|<|>/i.test(value);
      if (!ALLOWED_CSS_PROPERTIES.has(property) || dangerous) {
        removed.push(`${selector} { ${property} }`);
        continue;
      }
      declarations.push(`${property}: ${value}`);
    }
    if (declarations.length > 0) rules.push(`${selector} { ${declarations.join('; ')} }`);
  }

  return { css: rules.join('\n'), removed };
}

/** Farbangaben nur als Hex; alles andere faellt auf den Standard zurueck. */
export function safeColor(value: string | undefined, fallback: string): string {
  return value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
