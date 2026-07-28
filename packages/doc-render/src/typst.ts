/**
 * Typst-Ausgabe fuer das PDF. Aus demselben Layoutmodell wie die HTML-Vorschau,
 * damit beide nicht auseinanderlaufen koennen (ADR-0004).
 */
import { safeColor } from './sanitize.ts';
import { resolvePlaceholders } from './placeholders.ts';
import type { Block, TemplateLayout } from './model.ts';
import { effectiveTableColumns } from './document.ts';
import type { RenderDocument } from './document.ts';

/** Typst-Sonderzeichen entschaerfen. */
export function escapeTypst(value: string): string {
  return value.replace(/[\\#$*_`<>@\[\]]/g, (c) => `\\${c}`);
}

function textBlock(content: string, block: Block): string {
  const style = block.style ?? {};
  let out = `[${escapeTypst(content)}]`;
  if (style.bold) out = `strong(${out})`;
  if (style.italic) out = `emph(${out})`;
  if (style.fontSizePt) out = `text(size: ${style.fontSizePt}pt)${out}`;
  if (style.color) out = `text(fill: rgb("${safeColor(style.color, '#000000')}"))${out}`;
  if (style.align) out = `align(${style.align})[${out}]`;
  return out;
}

function renderBlock(block: Block, doc: RenderDocument): string {
  if (block.visible === false) return '';
  switch (block.type) {
    case 'logo':
      return doc.logoPath ? `#align(right)[#image("${doc.logoPath}", width: 40mm)]` : '';
    case 'sender_line':
    case 'text':
    case 'payment_info': {
      const { text } = resolvePlaceholders(block.content ?? '', doc.context);
      return text.trim() === '' ? '' : `#${textBlock(text, block)}`;
    }
    case 'address':
      return `#block[${doc.addressLines.map((l) => escapeTypst(l)).join(' \\\n')}]`;
    case 'document_info':
      return `#table(columns: 2, stroke: none, ${doc.infoRows
        .map((r) => `[${escapeTypst(r.label)}], [${escapeTypst(r.value)}]`)
        .join(', ')})`;
    case 'items_table': {
      const columns = effectiveTableColumns(doc, block.columns);
      const header = columns.map((c) => `[*${escapeTypst(c)}*]`).join(', ');
      const rows = doc.items
        .filter((item) => item.kind === 'item')
        .map((item) => {
          const values: Record<string, string> = {
            position: String(item.position),
            description: item.description,
            quantity: item.quantity ?? '',
            unit: item.unit ?? '',
            unit_price: item.unitPrice ?? '',
            discount: item.discount ?? '',
            tax_rate: item.taxRate ?? '',
            line_total: item.lineTotal ?? '',
          };
          return columns.map((c) => `[${escapeTypst(values[c] ?? '')}]`).join(', ');
        })
        .join(',\n  ');
      return `#table(columns: ${columns.length}, ${header},\n  ${rows}\n)`;
    }
    case 'totals':
      return `#align(right)[#table(columns: 2, stroke: none, ${doc.totals
        .map((t) => `[${escapeTypst(t.label)}], [${escapeTypst(t.value)}]`)
        .join(', ')})]`;
    case 'tax_summary': {
      const note = doc.taxNote ? `\n#text(size: 8pt)[${escapeTypst(doc.taxNote)}]` : '';
      if (doc.taxRows.length === 0) return note;
      return `#table(columns: 3, ${doc.taxRows
        .map((r) => `[${escapeTypst(r.label)}], [${escapeTypst(r.net)}], [${escapeTypst(r.tax)}]`)
        .join(', ')})${note}`;
    }
    case 'qr_code':
      // Der QR-Code wird vom Rust-Kern als Bild erzeugt und hier eingebunden.
      return doc.giroCode ? '#image("girocode.svg", width: 30mm)' : '';
    case 'divider':
      return '#line(length: 100%)';
    case 'spacer':
      return `#v(${block.style?.marginTopMm ?? 5}mm)`;
    case 'page_numbers':
      return '';
    default:
      return '';
  }
}

export function renderTypst(layout: TemplateLayout, doc: RenderDocument): string {
  const page = layout.page;
  const footerBlocks = layout.footer.map((b) => renderBlock(b, doc)).filter(Boolean).join('\n  ');
  const preamble = `#set document(title: "${escapeTypst(doc.title)}")
#set page(
  paper: "a4",
  margin: (top: ${page.marginTopMm}mm, right: ${page.marginRightMm}mm, bottom: ${page.marginBottomMm}mm, left: ${page.marginLeftMm}mm),
  footer: [
  ${footerBlocks}
  #align(center)[#text(size: 7pt)[Seite #counter(page).display() von #counter(page).final().first()]]
  ],
)
#set text(font: "${page.fontFamily}", size: ${page.baseFontSizePt}pt, fill: rgb("${safeColor(page.primaryColor, '#1F2430')}"))`;
  const watermark =
    (layout.watermark === 'draft' && doc.isDraft) || (layout.watermark === 'paid' && doc.isPaid)
      ? `#place(center + horizon, rotate(-30deg, text(size: 60pt, fill: luma(200))[${doc.isDraft ? 'ENTWURF' : 'BEZAHLT'}]))`
      : '';

  const body = [...layout.header, ...layout.body]
    .map((b) => renderBlock(b, doc))
    .filter((s) => s !== '')
    .join('\n\n');

  return `${preamble}\n\n${watermark}\n\n${body}\n`;
}
