/**
 * Layoutmodell einer Belegvorlage.
 *
 * Eine Vorlage ist Daten, kein Code. Das Modell kennt keine Skripte, keine
 * Ausdruecke und keine Schleifen ausser der Positionstabelle. Siehe ADR-0004.
 */

export const BLOCK_TYPES = [
  'logo', 'sender_line', 'address', 'document_info', 'items_table',
  'totals', 'tax_summary', 'payment_info', 'qr_code', 'text',
  'signature', 'stamp', 'divider', 'spacer', 'page_numbers',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type Align = 'left' | 'center' | 'right';

export interface BlockStyle {
  readonly fontSizePt?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: string;
  readonly align?: Align;
  readonly marginTopMm?: number;
  readonly marginBottomMm?: number;
  readonly border?: 'none' | 'top' | 'bottom' | 'box';
}

export interface Block {
  readonly id: string;
  readonly type: BlockType;
  readonly visible?: boolean;
  readonly style?: BlockStyle;
  /** Freitext mit Platzhaltern, nur fuer `text`, `sender_line`, `payment_info`. */
  readonly content?: string;
  /** Spaltenauswahl der Positionstabelle. */
  readonly columns?: readonly ItemColumn[];
}

export const ITEM_COLUMNS = [
  'position', 'description', 'quantity', 'unit', 'unit_price',
  'discount', 'tax_rate', 'line_total',
] as const;
export type ItemColumn = (typeof ITEM_COLUMNS)[number];

export interface PageSetup {
  readonly format: 'A4';
  readonly marginTopMm: number;
  readonly marginRightMm: number;
  readonly marginBottomMm: number;
  readonly marginLeftMm: number;
  readonly fontFamily: 'Inter' | 'Source Sans 3' | 'Source Serif 4' | 'IBM Plex Mono';
  readonly baseFontSizePt: number;
  readonly primaryColor: string;
  readonly secondaryColor: string;
}

export interface TemplateLayout {
  readonly name: string;
  readonly version: number;
  readonly page: PageSetup;
  readonly header: readonly Block[];
  readonly body: readonly Block[];
  readonly footer: readonly Block[];
  /** Nur die Positivliste aus ADR-0004, geprueft von `sanitizeCss`. */
  readonly customCss?: string;
  readonly watermark?: 'none' | 'draft' | 'paid';
}

export const DEFAULT_LAYOUT: TemplateLayout = {
  name: 'Standard',
  version: 1,
  page: {
    format: 'A4',
    marginTopMm: 20, marginRightMm: 20, marginBottomMm: 25, marginLeftMm: 25,
    fontFamily: 'Inter', baseFontSizePt: 10,
    primaryColor: '#1F2430', secondaryColor: '#6F7C93',
  },
  header: [
    { id: 'logo', type: 'logo', style: { align: 'right' } },
    { id: 'sender', type: 'sender_line', content: '{{firma.name}} · {{firma.strasse}} · {{firma.plz}} {{firma.ort}}', style: { fontSizePt: 7 } },
  ],
  body: [
    { id: 'address', type: 'address' },
    { id: 'info', type: 'document_info' },
    { id: 'intro', type: 'text', content: '{{beleg.einleitung}}' },
    {
      id: 'items', type: 'items_table',
      columns: ['position', 'description', 'quantity', 'unit', 'unit_price', 'line_total'],
    },
    { id: 'totals', type: 'totals' },
    { id: 'tax', type: 'tax_summary' },
    { id: 'outro', type: 'text', content: '{{beleg.schlusstext}}' },
    { id: 'payment', type: 'payment_info', content: 'Zahlbar bis {{beleg.faelligAm}} auf das folgende Konto:' },
    { id: 'qr', type: 'qr_code', style: { align: 'left' } },
  ],
  footer: [
    { id: 'divider', type: 'divider' },
    { id: 'foot', type: 'text', content: '{{firma.fusszeile}}', style: { fontSizePt: 7, align: 'center' } },
    { id: 'pages', type: 'page_numbers', style: { fontSizePt: 7, align: 'center' } },
  ],
  watermark: 'none',
};
