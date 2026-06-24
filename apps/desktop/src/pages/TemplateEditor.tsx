import { useMemo, useState } from 'react';
import {
  addBlock, DEFAULT_LAYOUT, isSavable, moveBlock, removeBlock, renderHtml,
  toggleVisibility, updateBlock, updateStyle, validateLayout,
} from '@noctura/doc-render';
import type { Block, BlockType, Section, TemplateLayout } from '@noctura/doc-render';
import { SAMPLE_DOCUMENT } from '../lib/sample-document';

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

const SECTION_LABELS: Record<Section, string> = {
  header: 'Kopfbereich',
  body: 'Rumpf',
  footer: 'Fußbereich',
};

/**
 * Visueller Vorlageneditor.
 *
 * Drei Spalten: Bausteine links, Vorschau in der Mitte, Eigenschaften rechts.
 * Die Vorschau ist derselbe Renderer, der auch das PDF speist — was hier steht,
 * steht später im Dokument.
 *
 * Umsortiert wird per Ziehen *und* per Tastatur (Alt + Pfeil). Ein Editor, der
 * nur mit der Maus bedienbar ist, schließt Menschen aus.
 */
export function TemplateEditor({
  initial = DEFAULT_LAYOUT,
  onSave,
}: {
  initial?: TemplateLayout;
  onSave?: (layout: TemplateLayout) => void;
}) {
  const [history, setHistory] = useState<TemplateLayout[]>([initial]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<{ section: Section; id: string } | null>(null);

  const layout = history[cursor];
  const problems = useMemo(() => validateLayout(layout), [layout]);
  const preview = useMemo(() => renderHtml(layout, SAMPLE_DOCUMENT), [layout]);
  const savable = isSavable(layout);

  function commit(next: TemplateLayout) {
    const trimmed = history.slice(0, cursor + 1);
    setHistory([...trimmed, next]);
    setCursor(trimmed.length);
  }

  const selectedBlock: Block | undefined = selected
    ? layout[selected.section].find((block) => block.id === selected.id)
    : undefined;

  function onBlockKeyDown(event: React.KeyboardEvent, section: Section, id: string) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') { event.preventDefault(); commit(moveBlock(layout, section, id, -1)); }
    if (event.key === 'ArrowDown') { event.preventDefault(); commit(moveBlock(layout, section, id, 1)); }
  }

  return (
    <div className="grid h-full grid-cols-[240px_1fr_280px] gap-4">
      <section aria-label="Bausteine" className="overflow-y-auto">
        <h2 className="mb-2 text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
          Bausteine hinzufügen
        </h2>
        <ul className="space-y-1">
          {PALETTE.map((entry) => (
            <li key={entry.type}>
              <button
                type="button"
                onClick={() => commit(addBlock(layout, selected?.section ?? 'body', entry.type))}
                className="w-full rounded border border-border px-2 py-1.5 text-left text-sm hover:bg-surface"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mb-2 mt-6 text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
          Aufbau
        </h2>
        {(['header', 'body', 'footer'] as Section[]).map((section) => (
          <div key={section} className="mb-3">
            <p className="mb-1 text-xs text-subtle">{SECTION_LABELS[section]}</p>
            <ul className="space-y-0.5">
              {layout[section].map((block) => (
                <li key={block.id}>
                  <button
                    type="button"
                    onClick={() => setSelected({ section, id: block.id })}
                    onKeyDown={(event) => onBlockKeyDown(event, section, block.id)}
                    aria-current={selected?.id === block.id ? 'true' : undefined}
                    className={[
                      'w-full rounded px-2 py-1 text-left text-sm',
                      selected?.id === block.id ? 'bg-primary-soft' : 'hover:bg-surface',
                      block.visible === false ? 'text-subtle line-through' : '',
                    ].join(' ')}
                  >
                    {block.type}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Vorschau" className="flex min-w-0 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <button type="button" disabled={cursor === 0} onClick={() => setCursor((c) => c - 1)}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-40">
            Rückgängig
          </button>
          <button type="button" disabled={cursor === history.length - 1} onClick={() => setCursor((c) => c + 1)}
                  className="rounded border border-border px-2 py-1 text-sm disabled:opacity-40">
            Wiederholen
          </button>
          <span className="ml-auto text-xs text-subtle">Vorschau mit Beispieldaten</span>
          <button
            type="button"
            disabled={!savable}
            onClick={() => onSave?.(layout)}
            className="rounded bg-primary px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
          >
            Vorlage speichern
          </button>
        </div>

        {/* Die Vorschau läuft in einem eigenen Dokument ohne Skriptrechte. */}
        <iframe
          title="Vorschau der Vorlage"
          sandbox=""
          srcDoc={preview.html}
          className="min-h-0 flex-1 rounded-lg border border-border bg-white"
        />

        {problems.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {problems.map((problem, index) => (
              <li
                key={index}
                role={problem.severity === 'error' ? 'alert' : undefined}
                style={{ color: problem.severity === 'error' ? 'var(--n-danger)' : 'var(--n-warning)' }}
              >
                {problem.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Eigenschaften" className="overflow-y-auto">
        <h2 className="mb-2 text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
          Eigenschaften
        </h2>

        {!selectedBlock || !selected ? (
          <p className="text-sm text-subtle">Einen Baustein auswählen, um ihn zu bearbeiten.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="font-mono text-xs text-subtle">{selectedBlock.type}</p>

            {'content' in selectedBlock && selectedBlock.content !== undefined && (
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Text (Platzhalter in {'{{ }}'})</span>
                <textarea
                  rows={4}
                  value={selectedBlock.content}
                  onChange={(event) => commit(updateBlock(layout, selected.section, selected.id, { content: event.target.value }))}
                  className="w-full rounded border border-border bg-input px-2 py-1"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-xs text-muted">Schriftgröße (pt)</span>
              <input
                type="number" min={6} max={24}
                value={selectedBlock.style?.fontSizePt ?? layout.page.baseFontSizePt}
                onChange={(event) => commit(updateStyle(layout, selected.section, selected.id, { fontSizePt: Number(event.target.value) }))}
                className="w-24 rounded border border-border bg-input px-2 py-1"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-muted">Ausrichtung</span>
              <select
                value={selectedBlock.style?.align ?? 'left'}
                onChange={(event) => commit(updateStyle(layout, selected.section, selected.id, { align: event.target.value as 'left' }))}
                className="rounded border border-border bg-input px-2 py-1"
              >
                <option value="left">links</option>
                <option value="center">zentriert</option>
                <option value="right">rechts</option>
              </select>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedBlock.style?.bold ?? false}
                onChange={() => commit(updateStyle(layout, selected.section, selected.id, { bold: !selectedBlock.style?.bold }))}
              />
              Fett
            </label>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => commit(moveBlock(layout, selected.section, selected.id, -1))}
                      className="rounded border border-border px-2 py-1 text-xs">Nach oben</button>
              <button type="button" onClick={() => commit(moveBlock(layout, selected.section, selected.id, 1))}
                      className="rounded border border-border px-2 py-1 text-xs">Nach unten</button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => commit(toggleVisibility(layout, selected.section, selected.id))}
                      className="rounded border border-border px-2 py-1 text-xs">
                {selectedBlock.visible === false ? 'Einblenden' : 'Ausblenden'}
              </button>
              <button
                type="button"
                onClick={() => { commit(removeBlock(layout, selected.section, selected.id)); setSelected(null); }}
                className="rounded border border-border px-2 py-1 text-xs"
                style={{ color: 'var(--n-danger)' }}
              >
                Entfernen
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
