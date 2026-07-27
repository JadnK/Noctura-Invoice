/**
 * Sicheres Layoutmodell einer Belegvorlage. Vorlagen enthalten ausschließlich
 * deklarative Daten; Skripte oder ausführbare Ausdrücke sind nicht erlaubt.
 */
export const BLOCK_TYPES = [
  'logo', 'sender_line', 'address', 'document_info', 'items_table',
  'totals', 'tax_summary', 'payment_info', 'qr_code', 'text',
  'signature', 'stamp', 'divider', 'spacer', 'page_numbers',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type Align = 'left' | 'center' | 'right';
export type TemplateVariant = 'modern' | 'classic' | 'compact';

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
  readonly content?: string;
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
  /** Steuert das grundsätzliche Erscheinungsbild in Vorschau und PDF. */
  readonly variant?: TemplateVariant;
  /** Akzentfarbe für Titel, Linien und Tabellenkopf. */
  readonly accentColor?: string;
  readonly logoWidthMm?: number;
  /** Fixiert das PDF auf ein DIN-5008-orientiertes Form-B-Raster. */
  readonly din5008?: boolean;
}

export interface TemplateLayout {
  readonly name: string;
  readonly version: number;
  readonly page: PageSetup;
  readonly header: readonly Block[];
  readonly body: readonly Block[];
  readonly footer: readonly Block[];
  readonly customCss?: string;
  readonly watermark?: 'none' | 'draft' | 'paid';
}

const COMMON_BODY: readonly Block[] = [
  { id: 'address', type: 'address' },
  { id: 'info', type: 'document_info' },
  { id: 'intro', type: 'text', content: '{{beleg.einleitung}}', style: { marginTopMm: 7, marginBottomMm: 6 } },
  {
    id: 'items', type: 'items_table',
    columns: ['position', 'description', 'quantity', 'unit', 'unit_price', 'tax_rate', 'line_total'],
  },
  { id: 'totals', type: 'totals', style: { marginTopMm: 7 } },
  { id: 'tax', type: 'tax_summary', style: { marginTopMm: 4 } },
  { id: 'outro', type: 'text', content: '{{beleg.schlusstext}}', style: { marginTopMm: 8 } },
  { id: 'payment', type: 'payment_info', content: 'Zahlbar bis {{beleg.faelligAm}}. Bitte geben Sie {{beleg.nummer}} als Verwendungszweck an.', style: { marginTopMm: 5 } },
  { id: 'qr', type: 'qr_code', style: { align: 'left', marginTopMm: 5 } },
];

export const MODERN_LAYOUT: TemplateLayout = {
  name: 'Modern',
  version: 3,
  page: {
    format: 'A4', marginTopMm: 16, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 25,
    fontFamily: 'Inter', baseFontSizePt: 9.5,
    primaryColor: '#182230', secondaryColor: '#64748B', accentColor: '#4F46E5',
    variant: 'modern', logoWidthMm: 38, din5008: true,
  },
  header: [
    { id: 'logo', type: 'logo', style: { align: 'right' } },
    { id: 'sender', type: 'sender_line', content: '{{firma.name}} · {{firma.strasse}} · {{firma.plz}} {{firma.ort}}', style: { fontSizePt: 7 } },
  ],
  body: COMMON_BODY,
  footer: [
    { id: 'divider', type: 'divider' },
    { id: 'foot', type: 'text', content: '{{firma.fusszeile}}', style: { fontSizePt: 7, align: 'center' } },
    { id: 'pages', type: 'page_numbers', style: { fontSizePt: 7, align: 'center' } },
  ],
  watermark: 'none',
};

export const CLASSIC_LAYOUT: TemplateLayout = {
  ...MODERN_LAYOUT,
  name: 'Klassisch',
  page: {
    ...MODERN_LAYOUT.page,
    marginTopMm: 16, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 25,
    fontFamily: 'Source Serif 4', baseFontSizePt: 10,
    primaryColor: '#1F2937', secondaryColor: '#6B7280', accentColor: '#1F2937',
    variant: 'classic', logoWidthMm: 34,
  },
  body: COMMON_BODY.map((block) => block.id === 'items'
    ? { ...block, columns: ['position', 'description', 'quantity', 'unit_price', 'line_total'] }
    : block),
};

export const COMPACT_LAYOUT: TemplateLayout = {
  ...MODERN_LAYOUT,
  name: 'Kompakt',
  page: {
    ...MODERN_LAYOUT.page,
    marginTopMm: 16, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 25,
    fontFamily: 'Inter', baseFontSizePt: 8.5,
    primaryColor: '#111827', secondaryColor: '#6B7280', accentColor: '#0F766E',
    variant: 'compact', logoWidthMm: 30,
  },
  body: COMMON_BODY.map((block) => block.id === 'items'
    ? { ...block, columns: ['position', 'description', 'quantity', 'unit_price', 'tax_rate', 'line_total'] }
    : block),
};

export const DEFAULT_LAYOUT = MODERN_LAYOUT;

export const TEMPLATE_PRESETS: readonly {
  id: TemplateVariant;
  name: string;
  description: string;
  layout: TemplateLayout;
}[] = [
  { id: 'modern', name: 'Modern', description: 'Klare Akzentfarbe, großzügige Abstände und markante Summenbox.', layout: MODERN_LAYOUT },
  { id: 'classic', name: 'Klassisch', description: 'Ruhige Serifenschrift und traditionelle Geschäftskorrespondenz.', layout: CLASSIC_LAYOUT },
  { id: 'compact', name: 'Kompakt', description: 'Mehr Positionen pro Seite, ideal für umfangreiche Leistungslisten.', layout: COMPACT_LAYOUT },
];
