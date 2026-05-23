/** HTML-Vorschau. Gleiches Modell wie das PDF, nur ein anderer Ausgabekanal. */
import { escapeHtml, safeColor, sanitizeCss } from './sanitize.ts';
import { resolvePlaceholders } from './placeholders.ts';
import type { Block, TemplateLayout } from './model.ts';
import type { RenderDocument } from './document.ts';

const COLUMN_LABELS: Record<string, string> = {
  position: 'Pos.', description: 'Beschreibung', quantity: 'Menge', unit: 'Einheit',
  unit_price: 'Einzelpreis', discount: 'Rabatt', tax_rate: 'MwSt.', line_total: 'Gesamt',
};

const NUMERIC_COLUMNS = new Set(['position', 'quantity', 'unit_price', 'discount', 'tax_rate', 'line_total']);

function styleAttribute(block: Block): string {
  const style = block.style ?? {};
  const parts: string[] = [];
  if (style.fontSizePt) parts.push(`font-size:${style.fontSizePt}pt`);
  if (style.bold) parts.push('font-weight:600');
  if (style.italic) parts.push('font-style:italic');
  if (style.color) parts.push(`color:${safeColor(style.color, '#000000')}`);
  if (style.align) parts.push(`text-align:${style.align}`);
  if (style.marginTopMm) parts.push(`margin-top:${style.marginTopMm}mm`);
  if (style.marginBottomMm) parts.push(`margin-bottom:${style.marginBottomMm}mm`);
  if (style.border === 'top') parts.push('border-top:0.5pt solid currentColor');
  if (style.border === 'bottom') parts.push('border-bottom:0.5pt solid currentColor');
  if (style.border === 'box') parts.push('border:0.5pt solid currentColor');
  return parts.length > 0 ? ` style="${parts.join(';')}"` : '';
}

function renderBlock(block: Block, doc: RenderDocument, layout: TemplateLayout): string {
  if (block.visible === false) return '';
  const attr = styleAttribute(block);

  switch (block.type) {
    case 'logo':
      return doc.logoPath ? `<div class="logo"${attr}><img src="${escapeHtml(doc.logoPath)}" alt=""></div>` : '';
    case 'sender_line':
    case 'text':
    case 'payment_info': {
      const { text } = resolvePlaceholders(block.content ?? '', doc.context);
      if (text.trim() === '') return '';
      return `<p class="block-${block.type}"${attr}>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    }
    case 'address':
      return `<address${attr}>${doc.addressLines.map((l) => escapeHtml(l)).join('<br>')}</address>`;
    case 'document_info':
      return `<table class="info"${attr}>${doc.infoRows
        .map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`)
        .join('')}</table>`;
    case 'items_table': {
      const columns = block.columns ?? ['position', 'description', 'quantity', 'unit_price', 'line_total'];
      const head = columns
        .map((c) => `<th class="${NUMERIC_COLUMNS.has(c) ? 'num' : 'txt'}">${escapeHtml(COLUMN_LABELS[c] ?? c)}</th>`)
        .join('');
      const body = doc.items
        .map((item) => {
          if (item.kind === 'page_break') return '<tr class="page-break"><td colspan="99"></td></tr>';
          if (item.kind === 'heading') {
            return `<tr class="heading"><td colspan="${columns.length}">${escapeHtml(item.description)}</td></tr>`;
          }
          const cells = columns.map((column) => {
            const raw: Record<string, string | undefined> = {
              position: String(item.position), description: item.description,
              quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice,
              discount: item.discount, tax_rate: item.taxRate, line_total: item.lineTotal,
            };
            const value = escapeHtml(raw[column] ?? '');
            const extra = column === 'description' && item.descriptionExtra
              ? `<span class="extra">${escapeHtml(item.descriptionExtra)}</span>`
              : '';
            return `<td class="${NUMERIC_COLUMNS.has(column) ? 'num' : 'txt'}">${value}${extra}</td>`;
          });
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('');
      return `<table class="items"${attr}><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case 'totals':
      return `<table class="totals"${attr}>${doc.totals
        .map((t) => `<tr class="${t.emphasis ? 'emphasis' : ''}"><th scope="row">${escapeHtml(t.label)}</th><td class="num">${escapeHtml(t.value)}</td></tr>`)
        .join('')}</table>`;
    case 'tax_summary': {
      if (doc.taxRows.length === 0 && !doc.taxNote) return '';
      const rows = doc.taxRows
        .map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th><td class="num">${escapeHtml(r.net)}</td><td class="num">${escapeHtml(r.tax)}</td></tr>`)
        .join('');
      const note = doc.taxNote ? `<p class="tax-note">${escapeHtml(doc.taxNote)}</p>` : '';
      return `${rows ? `<table class="tax"${attr}>${rows}</table>` : ''}${note}`;
    }
    case 'qr_code':
      return doc.giroCode ? `<div class="qr"${attr} data-payload="${escapeHtml(doc.giroCode)}"></div>` : '';
    case 'divider':
      return `<hr${attr}>`;
    case 'spacer':
      return `<div class="spacer"${attr}></div>`;
    case 'page_numbers':
      return `<p class="pages"${attr}>Seite <span class="page"></span> von <span class="pages-total"></span></p>`;
    case 'signature':
    case 'stamp':
      return `<div class="${block.type}"${attr}></div>`;
    default:
      return '';
  }
}

export interface HtmlResult {
  readonly html: string;
  readonly removedCss: readonly string[];
}

export function renderHtml(layout: TemplateLayout, doc: RenderDocument): HtmlResult {
  const custom = layout.customCss ? sanitizeCss(layout.customCss) : { css: '', removed: [] };
  const page = layout.page;
  const watermark =
    layout.watermark === 'draft' && doc.isDraft ? 'ENTWURF'
    : layout.watermark === 'paid' && doc.isPaid ? 'BEZAHLT'
    : '';

  const section = (blocks: readonly Block[]) => blocks.map((b) => renderBlock(b, doc, layout)).join('\n');

  const base = `
@page { size: A4; margin: ${page.marginTopMm}mm ${page.marginRightMm}mm ${page.marginBottomMm}mm ${page.marginLeftMm}mm; }
body { font-family: "${page.fontFamily}", sans-serif; font-size: ${page.baseFontSizePt}pt; color: ${safeColor(page.primaryColor, '#1F2430')}; }
table { width: 100%; border-collapse: collapse; }
.items th { border-bottom: 0.75pt solid currentColor; text-align: left; padding: 2mm 1mm; }
.items td { border-bottom: 0.25pt solid ${safeColor(page.secondaryColor, '#6F7C93')}; padding: 1.5mm 1mm; vertical-align: top; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.extra { display: block; font-size: 0.85em; color: ${safeColor(page.secondaryColor, '#6F7C93')}; }
.totals { width: 60%; margin-left: auto; }
.totals .emphasis th, .totals .emphasis td { font-weight: 600; border-top: 0.75pt solid currentColor; }
.page-break { break-after: page; }
.watermark { position: fixed; inset: 0; display: grid; place-items: center;
  font-size: 60pt; opacity: 0.08; transform: rotate(-30deg); pointer-events: none; }
`.trim();

  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<style>${base}
${custom.css}</style></head>
<body>
${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ''}
<header>${section(layout.header)}</header>
<main>${section(layout.body)}</main>
<footer>${section(layout.footer)}</footer>
</body></html>`;

  return { html, removedCss: custom.removed };
}
