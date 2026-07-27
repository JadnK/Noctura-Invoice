/** HTML-Vorschau. Gleiches Layoutmodell wie der PDF-Renderer. */
import { escapeHtml, safeColor, sanitizeCss } from './sanitize.ts';
import { resolvePlaceholders } from './placeholders.ts';
import type { Block, TemplateLayout, TemplateVariant } from './model.ts';
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
  if (style.bold) parts.push('font-weight:650');
  if (style.italic) parts.push('font-style:italic');
  if (style.color) parts.push(`color:${safeColor(style.color, '#000000')}`);
  if (style.align) parts.push(`text-align:${style.align}`);
  if (style.marginTopMm) parts.push(`margin-top:${style.marginTopMm}mm`);
  if (style.marginBottomMm) parts.push(`margin-bottom:${style.marginBottomMm}mm`);
  if (style.border === 'top') parts.push('border-top:0.5pt solid currentColor');
  if (style.border === 'bottom') parts.push('border-bottom:0.5pt solid currentColor');
  if (style.border === 'box') parts.push('border:0.5pt solid currentColor;padding:3mm');
  return parts.length > 0 ? ` style="${parts.join(';')}"` : '';
}

function renderBlock(block: Block, doc: RenderDocument): string {
  if (block.visible === false) return '';
  const attr = styleAttribute(block);
  switch (block.type) {
    case 'logo':
      return doc.logoPath ? `<div class="logo"${attr}><img src="${escapeHtml(doc.logoPath)}" alt="Firmenlogo"></div>` : '';
    case 'sender_line':
    case 'text':
    case 'payment_info': {
      const { text } = resolvePlaceholders(block.content ?? '', doc.context);
      if (text.trim() === '') return '';
      return `<p class="block-${block.type}"${attr}>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    }
    case 'address':
      return `<section class="recipient"><div class="recipient-label">Empfänger</div><address${attr}>${doc.addressLines.map((line) => escapeHtml(line)).join('<br>')}</address></section>`;
    case 'document_info':
      return `<section class="document-info"${attr}><h1>${escapeHtml(doc.title)}</h1><table class="info"><tbody>${doc.infoRows
        .map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
        .join('')}</tbody></table></section>`;
    case 'items_table': {
      const columns = block.columns ?? ['position', 'description', 'quantity', 'unit_price', 'line_total'];
      const head = columns
        .map((column) => `<th class="${NUMERIC_COLUMNS.has(column) ? 'num' : 'txt'}">${escapeHtml(COLUMN_LABELS[column] ?? column)}</th>`)
        .join('');
      const body = doc.items.map((item) => {
        if (item.kind === 'page_break') return '<tr class="page-break"><td colspan="99"></td></tr>';
        if (item.kind === 'heading') return `<tr class="heading"><td colspan="${columns.length}">${escapeHtml(item.description)}</td></tr>`;
        const cells = columns.map((column) => {
          const raw: Record<string, string | undefined> = {
            position: String(item.position), description: item.description,
            quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice,
            discount: item.discount, tax_rate: item.taxRate, line_total: item.lineTotal,
          };
          const value = escapeHtml(raw[column] ?? '');
          const extra = column === 'description' && item.descriptionExtra
            ? `<span class="extra">${escapeHtml(item.descriptionExtra)}</span>` : '';
          return `<td class="${NUMERIC_COLUMNS.has(column) ? 'num' : 'txt'}">${value}${extra}</td>`;
        });
        return `<tr>${cells.join('')}</tr>`;
      }).join('');
      return `<div class="items-wrap"${attr}><table class="items"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case 'totals':
      return `<div class="totals-card"${attr}><table class="totals"><tbody>${doc.totals
        .map((total) => `<tr class="${total.emphasis ? 'emphasis' : ''}"><th scope="row">${escapeHtml(total.label)}</th><td class="num">${escapeHtml(total.value)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    case 'tax_summary': {
      if (doc.taxRows.length === 0 && !doc.taxNote) return '';
      const rows = doc.taxRows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td class="num">${escapeHtml(row.net)}</td><td class="num">${escapeHtml(row.tax)}</td></tr>`).join('');
      const note = doc.taxNote ? `<p class="tax-note">${escapeHtml(doc.taxNote)}</p>` : '';
      return `<section class="tax-block"${attr}>${rows ? `<table class="tax"><tbody>${rows}</tbody></table>` : ''}${note}</section>`;
    }
    case 'qr_code':
      return doc.giroCode ? `<div class="qr"${attr} data-payload="${escapeHtml(doc.giroCode)}"><span>Zahlungs-QR</span></div>` : '';
    case 'divider': return `<hr${attr}>`;
    case 'spacer': return `<div class="spacer"${attr}></div>`;
    case 'page_numbers': return `<p class="pages"${attr}>Seite <span class="page"></span> von <span class="pages-total"></span></p>`;
    case 'signature':
    case 'stamp': return `<div class="${block.type}"${attr}></div>`;
    default: return '';
  }
}

export interface HtmlResult { readonly html: string; readonly removedCss: readonly string[]; }

function variantCss(variant: TemplateVariant, accent: string, secondary: string): string {
  if (variant === 'classic') return `
    body { border-top: 0; }
    header { border-bottom: 1pt solid ${accent}; padding-bottom: 5mm; }
    .document-info h1 { font-family: "Source Serif 4", serif; font-size: 25pt; font-weight: 500; letter-spacing: .01em; }
    .items th { background: transparent; color: inherit; border-top: 1pt solid ${accent}; border-bottom: 1pt solid ${accent}; }
    .totals-card { background: transparent; border: 1pt solid ${secondary}; border-radius: 0; }
    .recipient-label { color: ${accent}; }
  `;
  if (variant === 'compact') return `
    body { border-top-width: 2.5mm; }
    header { min-height: 13mm; margin-bottom: 7mm; }
    .document-info { margin-top: -2mm; }
    .document-info h1 { font-size: 18pt; }
    .recipient { min-height: 28mm; }
    .items th, .items td { padding-top: 1.1mm; padding-bottom: 1.1mm; }
    .totals-card { padding: 2.5mm 3.5mm; }
    footer { font-size: 6.5pt; }
  `;
  return `
    body { border-top: 4mm solid ${accent}; }
    .document-info h1 { color: ${accent}; }
    .items th { background: ${accent}; color: white; border-bottom-color: ${accent}; }
    .totals-card { border-left: 3mm solid ${accent}; }
    .recipient-label { color: ${accent}; }
  `;
}

export function renderHtml(layout: TemplateLayout, doc: RenderDocument): HtmlResult {
  const custom = layout.customCss ? sanitizeCss(layout.customCss) : { css: '', removed: [] };
  const page = layout.page;
  const variant = page.variant ?? 'modern';
  const primary = safeColor(page.primaryColor, '#182230');
  const secondary = safeColor(page.secondaryColor, '#64748B');
  const accent = safeColor(page.accentColor ?? page.primaryColor, '#4F46E5');
  const din5008 = page.din5008 !== false;
  const marginTop = din5008 ? 16 : page.marginTopMm;
  const marginRight = din5008 ? 20 : page.marginRightMm;
  const marginBottom = din5008 ? 20 : page.marginBottomMm;
  const marginLeft = din5008 ? 25 : page.marginLeftMm;
  const watermark = layout.watermark === 'draft' && doc.isDraft ? 'ENTWURF'
    : layout.watermark === 'paid' && doc.isPaid ? 'BEZAHLT' : '';
  const section = (blocks: readonly Block[]) => blocks.map((block) => renderBlock(block, doc)).join('\n');
  const base = `
@page { size: A4; margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; }
* { box-sizing: border-box; }
html { background: #e5e7eb; }
body { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; background: white; font-family: "${page.fontFamily}", sans-serif; font-size: ${page.baseFontSizePt}pt; line-height: 1.42; color: ${primary}; }
table { width: 100%; border-collapse: collapse; }
header { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 8mm; min-height: 20mm; margin-bottom: ${din5008 ? 9 : 10}mm; }
.logo { grid-column: 2; grid-row: 1 / span 2; text-align: right; }
.logo img { display: inline-block; max-width: ${page.logoWidthMm ?? 38}mm; max-height: 22mm; object-fit: contain; }
.block-sender_line { grid-column: 1; margin: 0; color: ${secondary}; }
main { display: grid; grid-template-columns: 1fr 62mm; column-gap: 12mm; align-items: start; }
.recipient { grid-column: 1; min-height: ${din5008 ? 42 : 38}mm; padding-top: 0; }
.recipient-label { margin-bottom: 2mm; font-size: 7pt; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; }
address { font-style: normal; line-height: 1.5; }
.document-info { grid-column: 2; padding: 3mm; border-radius: 2mm; background: #f8fafc; }
.document-info h1 { margin: 0 0 5mm; font-size: 22pt; line-height: 1.05; font-weight: 700; letter-spacing: -.025em; }
.info th, .info td { padding: 1mm 0; border: 0; font-size: 8pt; vertical-align: top; }
.info th { color: ${secondary}; font-weight: 500; text-align: left; }
.info td { text-align: right; font-weight: 600; }
main > .block-text, main > .block-payment_info, main > .items-wrap, main > .totals-card, main > .tax-block, main > .qr, main > hr, main > .spacer { grid-column: 1 / -1; }
.items-wrap { margin-top: 5mm; }
.items { font-size: .95em; }
.items th { padding: 2.1mm 1.5mm; border-bottom: .75pt solid ${primary}; color: ${primary}; font-size: 7.2pt; font-weight: 700; letter-spacing: .045em; text-transform: uppercase; }
.items td { padding: 2.3mm 1.5mm; border-bottom: .35pt solid #dbe1e8; vertical-align: top; }
.items tbody tr:nth-child(even) { background: rgba(100,116,139,.045); }
.items .heading td { padding-top: 4mm; font-weight: 700; background: transparent; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.txt { text-align: left; }
.extra { display: block; margin-top: .5mm; color: ${secondary}; font-size: .84em; line-height: 1.35; }
.totals-card { grid-column: 2 !important; margin-top: 7mm; padding: 3.5mm 4.5mm; border: .5pt solid #dbe1e8; border-radius: 2.5mm; background: #f8fafc; }
.totals th, .totals td { padding: 1.1mm 0; }
.totals th { text-align: left; font-weight: 500; color: ${secondary}; }
.totals .emphasis th, .totals .emphasis td { padding-top: 2.5mm; border-top: .75pt solid ${primary}; color: ${primary}; font-size: 1.12em; font-weight: 750; }
.tax-block { margin-top: 4mm; color: ${secondary}; font-size: 7.5pt; }
.tax th, .tax td { padding: .7mm 0; }
.tax th { text-align: left; font-weight: 500; }
.tax-note { margin: 2mm 0 0; }
.block-text, .block-payment_info { margin: 0; white-space: pre-wrap; }
.block-payment_info { padding: 3mm 4mm; border-radius: 2mm; background: #f8fafc; color: ${secondary}; font-size: 8pt; }
.qr { width: 30mm; height: 30mm; display: grid; place-items: center; border: .5pt dashed ${secondary}; color: ${secondary}; font-size: 7pt; }
hr { width: 100%; border: 0; border-top: .5pt solid #dbe1e8; }
footer { position: absolute; left: ${marginLeft}mm; right: ${marginRight}mm; bottom: 8mm; color: ${secondary}; font-size: 7pt; text-align: center; }
footer p { margin: 1mm 0; }
.page-break { break-after: page; }
.watermark { position: fixed; inset: 0; display: grid; place-items: center; font-size: 60pt; opacity: .07; transform: rotate(-30deg); pointer-events: none; }
${variantCss(variant, accent, secondary)}
`.trim();

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>${base}\n${custom.css}</style></head><body class="template-${variant} ${din5008 ? 'din-form-b' : 'free-layout'}">${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ''}<header>${section(layout.header)}</header><main>${section(layout.body)}</main><footer>${section(layout.footer)}</footer></body></html>`;
  return { html, removedCss: custom.removed };
}
