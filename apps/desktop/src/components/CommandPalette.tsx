import { useEffect, useMemo, useState } from 'react';
import { formatKeys, SHORTCUTS } from '../lib/shortcuts';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly run: () => void;
}

/**
 * Command-Palette (Strg + K). Sucht über Befehle, Seiten und zuletzt geöffnete
 * Belege. Die Tastaturbedienung ist der Hauptweg, nicht die Ausnahme.
 */
export function CommandPalette({
  open, commands, onClose,
}: { open: boolean; commands: readonly Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle === ''
      ? commands
      : commands.filter((command) => command.label.toLowerCase().includes(needle));
    return matches.slice(0, 12);
  }, [commands, query]);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    if (event.key === 'Enter') { event.preventDefault(); results[index]?.run(); onClose(); }
    if (event.key === 'Escape') { onClose(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: 'var(--n-overlay)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Befehle"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-raised shadow-elev2"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Befehl oder Seite suchen"
          aria-label="Befehl suchen"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />

        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-subtle">
              Nichts gefunden. Andere Schreibweise versuchen.
            </li>
          )}
          {results.map((command, position) => (
            <li key={command.id}>
              <button
                type="button"
                onMouseEnter={() => setIndex(position)}
                onClick={() => { command.run(); onClose(); }}
                aria-selected={position === index}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  position === index ? 'bg-primary-soft' : ''
                }`}
              >
                <span>{command.label}</span>
                <span className="text-xs text-subtle">{command.group}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="border-t border-border px-4 py-2 text-xs text-subtle">
          {formatKeys(SHORTCUTS.find((s) => s.id === 'palette')!)} öffnet diese Liste · Pfeiltasten · Enter
        </p>
      </div>
    </div>
  );
}
