import type { KeyboardEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  ITEM_COLUMNS,
  addBlock,
  DEFAULT_LAYOUT,
  isSavable,
  moveBlock,
  removeBlock,
  renderHtml,
  toggleVisibility,
  updateBlock,
  updateStyle,
  validateLayout,
} from '@noctura/doc-render';
import type {
  Align,
  Block,
  BlockType,
  ItemColumn,
  RenderDocument,
  Section,
  TemplateLayout,
  TemplateVariant,
} from '@noctura/doc-render';

const PALETTE: readonly { type: BlockType; label: string }[] = [
  { type: 'text', label: 'Textblock' },
  { type: 'divider', label: 'Trennlinie' },
  { type: 'spacer', label: 'Abstand' },
  { type: 'qr_code', label: 'Zahlungs-QR-Code' },
  { type: 'signature', label: 'Unterschrift' },
  { type: 'stamp', label: 'Firmenstempel' },
  { type: 'payment_info', label: 'Zahlungshinweis' },
  { type: 'tax_summary', label: 'Steuerübersicht' },
];
const SECTION_LABELS: Record<Section, string> = { header: 'Kopfbereich', body: 'Inhalt', footer: 'Fußbereich' };
const BLOCK_LABELS: Record<BlockType, string> = {
  logo: 'Logo', sender_line: 'Absenderzeile', address: 'Empfängeradresse', document_info: 'Belegkopf',
  items_table: 'Positionstabelle', totals: 'Summen', tax_summary: 'Steuerübersicht', payment_info: 'Zahlungshinweis',
  qr_code: 'Zahlungs-QR', text: 'Text', signature: 'Unterschrift', stamp: 'Stempel', divider: 'Trennlinie',
  spacer: 'Abstand', page_numbers: 'Seitenzahlen',
};
const COLUMN_LABELS: Record<ItemColumn, string> = {
  position: 'Position', description: 'Beschreibung', quantity: 'Menge', unit: 'Einheit', unit_price: 'Einzelpreis',
  discount: 'Rabatt', tax_rate: 'MwSt.', line_total: 'Gesamt',
};

export function TemplateEditor({ initial = DEFAULT_LAYOUT, previewDocument, onSave }: {
  initial?: TemplateLayout;
  previewDocument: RenderDocument;
  onSave?: (layout: TemplateLayout) => void;
}) {
  const [history, setHistory] = useState<TemplateLayout[]>([initial]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<{ section: Section; id: string } | null>(null);
  const layout = history[cursor] ?? initial;
  const problems = useMemo(() => validateLayout(layout), [layout]);
  const preview = useMemo(() => renderHtml(layout, previewDocument), [layout, previewDocument]);
  const savable = isSavable(layout);

  function commit(next: TemplateLayout) {
    const trimmed = history.slice(0, cursor + 1);
    setHistory([...trimmed, next]);
    setCursor(trimmed.length);
  }
  function updatePage(patch: Partial<TemplateLayout['page']>) {
    commit({ ...layout, page: { ...layout.page, ...patch } });
  }
  const selectedBlock: Block | undefined = selected
    ? layout[selected.section].find((block) => block.id === selected.id)
    : undefined;
  function onBlockKeyDown(event: KeyboardEvent, section: Section, id: string) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') { event.preventDefault(); commit(moveBlock(layout, section, id, -1)); }
    if (event.key === 'ArrowDown') { event.preventDefault(); commit(moveBlock(layout, section, id, 1)); }
  }
  function toggleColumn(column: ItemColumn) {
    if (!selected || !selectedBlock || selectedBlock.type !== 'items_table') return;
    const current = selectedBlock.columns ?? ITEM_COLUMNS;
    const columns = current.includes(column) ? current.filter((entry) => entry !== column) : [...current, column];
    if (!columns.includes('description') || !columns.includes('line_total')) return;
    commit(updateBlock(layout, selected.section, selected.id, { columns }));
  }

  return <div className="grid h-full min-h-[720px] grid-cols-[230px_minmax(480px,1fr)_300px] gap-4">
    <section aria-label="Vorlagenaufbau" className="overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-elev1">
      <h2 className="mb-2 text-xs font-semibold uppercase text-subtle">Bausteine hinzufügen</h2>
      <div className="grid grid-cols-2 gap-1.5">{PALETTE.map((entry) => <button key={entry.type} type="button" onClick={() => commit(addBlock(layout, selected?.section ?? 'body', entry.type))} className="rounded border border-border px-2 py-1.5 text-left text-xs hover:bg-input">{entry.label}</button>)}</div>
      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase text-subtle">Dokumentaufbau</h2>
      {(['header', 'body', 'footer'] as Section[]).map((section) => <div key={section} className="mb-4">
        <div className="mb-1 text-xs font-medium text-muted">{SECTION_LABELS[section]}</div>
        <ul className="space-y-1">{layout[section].map((block) => <li key={block.id}><button type="button" onClick={() => setSelected({ section, id: block.id })} onKeyDown={(event) => onBlockKeyDown(event, section, block.id)} className={['w-full rounded px-2 py-1.5 text-left text-xs', selected?.id === block.id ? 'bg-primary-soft font-medium' : 'hover:bg-input', block.visible === false ? 'text-subtle line-through' : ''].join(' ')}>{BLOCK_LABELS[block.type]}</button></li>)}</ul>
      </div>)}
    </section>

    <section aria-label="Dokumentvorschau" className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" disabled={cursor === 0} onClick={() => setCursor((value) => value - 1)} className="rounded border border-border px-2 py-1 text-sm disabled:opacity-40">Rückgängig</button>
        <button type="button" disabled={cursor === history.length - 1} onClick={() => setCursor((value) => value + 1)} className="rounded border border-border px-2 py-1 text-sm disabled:opacity-40">Wiederholen</button>
        <span className="ml-auto text-xs text-subtle">Vorschau mit echten Firmendaten und neutralem Empfänger</span>
        <button type="button" disabled={!savable} onClick={() => onSave?.(layout)} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Vorlage speichern</button>
      </div>
      <iframe title="Vorschau der Vorlage" sandbox="" srcDoc={preview.html} className="min-h-0 flex-1 rounded-lg border border-border bg-white shadow-elev1" />
      {problems.length > 0 && <ul className="mt-2 space-y-1 text-xs">{problems.map((problem, index) => <li key={`${problem.message}-${index}`} role={problem.severity === 'error' ? 'alert' : undefined} style={{ color: problem.severity === 'error' ? 'var(--n-danger)' : 'var(--n-warning)' }}>{problem.message}</li>)}</ul>}
    </section>

    <section aria-label="Vorlageneigenschaften" className="space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <div><h2 className="font-semibold">Dokumentdesign</h2><p className="mt-1 text-xs text-muted">Farben, Schrift, Ränder, Spalten und zentrale Bereiche werden in den PDF-Export übernommen.</p></div>
      <Property label="Stil"><select value={layout.page.variant ?? 'modern'} onChange={(event) => updatePage({ variant: event.target.value as TemplateVariant })} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"><option value="modern">Modern</option><option value="classic">Klassisch</option><option value="compact">Kompakt</option></select></Property>
      <Property label="Schrift"><select value={layout.page.fontFamily} onChange={(event) => updatePage({ fontFamily: event.target.value as TemplateLayout['page']['fontFamily'] })} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"><option>Inter</option><option>Source Sans 3</option><option>Source Serif 4</option><option>IBM Plex Mono</option></select></Property>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Akzent" value={layout.page.accentColor ?? layout.page.primaryColor} onChange={(accentColor) => updatePage({ accentColor })} />
        <ColorField label="Text" value={layout.page.primaryColor} onChange={(primaryColor) => updatePage({ primaryColor })} />
        <ColorField label="Sekundär" value={layout.page.secondaryColor} onChange={(secondaryColor) => updatePage({ secondaryColor })} />
        <Property label="Grundgröße"><input type="number" min={7} max={13} step={0.5} value={layout.page.baseFontSizePt} onChange={(event) => updatePage({ baseFontSizePt: Number(event.target.value) })} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" /></Property>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Property label="Rand oben"><NumberInput disabled={layout.page.din5008 !== false} value={layout.page.din5008 !== false ? 16 : layout.page.marginTopMm} onChange={(marginTopMm) => updatePage({ marginTopMm })} /></Property>
        <Property label="Rand rechts"><NumberInput disabled={layout.page.din5008 !== false} value={layout.page.din5008 !== false ? 20 : layout.page.marginRightMm} onChange={(marginRightMm) => updatePage({ marginRightMm })} /></Property>
        <Property label="Rand unten"><NumberInput disabled={layout.page.din5008 !== false} value={layout.page.din5008 !== false ? 20 : layout.page.marginBottomMm} onChange={(marginBottomMm) => updatePage({ marginBottomMm })} /></Property>
        <Property label="Rand links"><NumberInput disabled={layout.page.din5008 !== false} value={layout.page.din5008 !== false ? 25 : layout.page.marginLeftMm} onChange={(marginLeftMm) => updatePage({ marginLeftMm })} /></Property>
      </div>
      <div className="rounded-lg border border-border bg-canvas p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={layout.page.din5008 !== false} onChange={(event) => updatePage({ din5008: event.target.checked })} className="mt-0.5" />
          <span><strong className="block">DIN-5008-orientiertes Form-B-Raster</strong><span className="mt-0.5 block text-xs text-muted">Fixiert Seitenränder, Anschriftfeld und Informationsblock für eine konsistente Geschäftsbrief-Geometrie.</span></span>
        </label>
      </div>
      <Property label="Logobreite"><div className="flex items-center gap-2"><NumberInput value={layout.page.logoWidthMm ?? 38} onChange={(logoWidthMm) => updatePage({ logoWidthMm })} /><span className="text-xs text-subtle">mm</span></div></Property>
      <Property label="Wasserzeichen"><select value={layout.watermark ?? 'none'} onChange={(event) => commit({ ...layout, watermark: event.target.value as TemplateLayout['watermark'] })} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"><option value="none">Keines</option><option value="draft">ENTWURF bei Entwürfen</option><option value="paid">BEZAHLT bei bezahlten Rechnungen</option></select></Property>

      <div className="border-t border-divider pt-4"><h2 className="mb-3 font-semibold">Ausgewählter Baustein</h2>
        {!selectedBlock || !selected ? <p className="text-sm text-subtle">Links einen Baustein auswählen.</p> : <div className="space-y-3 text-sm">
          <div className="rounded bg-input px-2 py-1.5 text-xs font-medium">{BLOCK_LABELS[selectedBlock.type]}</div>
          {'content' in selectedBlock && selectedBlock.content !== undefined && <Property label="Text und Platzhalter"><textarea rows={5} value={selectedBlock.content} onChange={(event) => commit(updateBlock(layout, selected.section, selected.id, { content: event.target.value }))} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" /></Property>}
          {selectedBlock.type === 'items_table' && <Property label="Tabellenspalten"><div className="grid grid-cols-2 gap-1.5">{ITEM_COLUMNS.map((column) => <label key={column} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={(selectedBlock.columns ?? ITEM_COLUMNS).includes(column)} disabled={column === 'description' || column === 'line_total'} onChange={() => toggleColumn(column)} />{COLUMN_LABELS[column]}</label>)}</div></Property>}
          <Property label="Schriftgröße"><input type="number" min={6} max={28} value={selectedBlock.style?.fontSizePt ?? layout.page.baseFontSizePt} onChange={(event) => commit(updateStyle(layout, selected.section, selected.id, { fontSizePt: Number(event.target.value) }))} className="w-full rounded border border-border bg-input px-2 py-1.5" /></Property>
          <Property label="Ausrichtung"><select value={selectedBlock.style?.align ?? 'left'} onChange={(event) => commit(updateStyle(layout, selected.section, selected.id, { align: event.target.value as Align }))} className="w-full rounded border border-border bg-input px-2 py-1.5"><option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option></select></Property>
          <div className="flex gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={selectedBlock.style?.bold ?? false} onChange={() => commit(updateStyle(layout, selected.section, selected.id, { bold: !selectedBlock.style?.bold }))} />Fett</label><label className="flex items-center gap-2"><input type="checkbox" checked={selectedBlock.style?.italic ?? false} onChange={() => commit(updateStyle(layout, selected.section, selected.id, { italic: !selectedBlock.style?.italic }))} />Kursiv</label></div>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => commit(moveBlock(layout, selected.section, selected.id, -1))} className="rounded border border-border px-2 py-1.5 text-xs">Nach oben</button><button type="button" onClick={() => commit(moveBlock(layout, selected.section, selected.id, 1))} className="rounded border border-border px-2 py-1.5 text-xs">Nach unten</button><button type="button" onClick={() => commit(toggleVisibility(layout, selected.section, selected.id))} className="rounded border border-border px-2 py-1.5 text-xs">{selectedBlock.visible === false ? 'Einblenden' : 'Ausblenden'}</button><button type="button" onClick={() => { commit(removeBlock(layout, selected.section, selected.id)); setSelected(null); }} className="rounded border border-border px-2 py-1.5 text-xs" style={{ color: 'var(--n-danger)' }}>Entfernen</button></div>
        </div>}
      </div>
    </section>
  </div>;
}

function Property({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Property label={label}><div className="flex gap-1.5"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 rounded border border-border bg-input p-1" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-input px-2 text-xs" /></div></Property>; }
function NumberInput({ value, onChange, disabled = false }: { value: number; onChange: (value: number) => void; disabled?: boolean }) { return <input disabled={disabled} type="number" min={0} max={65} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60" />; }
