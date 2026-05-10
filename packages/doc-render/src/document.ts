/** Daten, die ein Beleg dem Renderer liefert. Bereits formatiert, keine Rechenlogik. */

export interface RenderItem {
  readonly position: number;
  readonly kind: 'item' | 'heading' | 'text' | 'subtotal' | 'page_break';
  readonly description: string;
  readonly descriptionExtra?: string;
  readonly quantity?: string;
  readonly unit?: string;
  readonly unitPrice?: string;
  readonly discount?: string;
  readonly taxRate?: string;
  readonly lineTotal?: string;
}

export interface RenderTaxRow {
  readonly label: string;
  readonly net: string;
  readonly tax: string;
}

export interface RenderTotal {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}

export interface RenderDocument {
  readonly title: string;
  readonly items: readonly RenderItem[];
  readonly totals: readonly RenderTotal[];
  readonly taxRows: readonly RenderTaxRow[];
  readonly taxNote?: string;
  readonly addressLines: readonly string[];
  readonly infoRows: readonly { label: string; value: string }[];
  readonly context: Readonly<Record<string, string>>;
  readonly giroCode?: string;
  readonly logoPath?: string;
  readonly isDraft?: boolean;
  readonly isPaid?: boolean;
}
