/** Daten, die ein Beleg dem Renderer liefert. Bereits formatiert, keine Rechenlogik. */
import type { ItemColumn } from './model.ts';

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

/** Spalten der Positionstabelle ohne ausdrueckliche Vorgabe durch den Block. */
export const DEFAULT_TABLE_COLUMNS: readonly ItemColumn[] = [
  'position', 'description', 'quantity', 'unit_price', 'line_total',
];

/**
 * Spalten der Positionstabelle fuer beide Renderer (HTML und Typst) gleich
 * bestimmt (ADR-0004): ohne Steuerzeilen und ohne Steuerhinweis entfaellt
 * die MwSt.-Spalte, egal was der Block anfordert.
 */
export function effectiveTableColumns(
  doc: RenderDocument,
  requestedColumns: readonly ItemColumn[] | undefined,
): readonly ItemColumn[] {
  const columns = requestedColumns ?? DEFAULT_TABLE_COLUMNS;
  return doc.taxRows.length === 0 && doc.taxNote
    ? columns.filter((column) => column !== 'tax_rate')
    : columns;
}
