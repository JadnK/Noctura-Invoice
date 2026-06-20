/**
 * Tastenkürzel. Eine Liste, aus der sowohl die Tastaturbedienung als auch die
 * Übersichtsseite und die Command-Palette gespeist werden — damit die Anzeige
 * nicht von der tatsächlichen Belegung abweichen kann.
 */

export interface Shortcut {
  readonly id: string;
  readonly keys: readonly string[];
  readonly label: string;
  readonly scope: 'global' | 'editor' | 'dialog';
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'invoice.new', keys: ['Control', 'n'], label: 'Neue Rechnung', scope: 'global' },
  { id: 'customer.new', keys: ['Control', 'Shift', 'N'], label: 'Neuer Kunde', scope: 'global' },
  { id: 'save', keys: ['Control', 's'], label: 'Speichern', scope: 'editor' },
  { id: 'pdf', keys: ['Control', 'p'], label: 'PDF-Vorschau und Drucken', scope: 'editor' },
  { id: 'palette', keys: ['Control', 'k'], label: 'Command-Palette', scope: 'global' },
  { id: 'search', keys: ['Control', 'f'], label: 'Suche', scope: 'global' },
  { id: 'settings', keys: ['Control', ','], label: 'Einstellungen', scope: 'global' },
  { id: 'confirm', keys: ['Control', 'Enter'], label: 'Aktion bestätigen', scope: 'dialog' },
  { id: 'close', keys: ['Escape'], label: 'Dialog schließen', scope: 'dialog' },
  { id: 'help', keys: ['F1'], label: 'Tastenkürzel anzeigen', scope: 'global' },
];

export function formatKeys(shortcut: Shortcut): string {
  return shortcut.keys
    .map((key) => (key === 'Control' ? 'Strg' : key === 'Shift' ? 'Umschalt' : key === 'Escape' ? 'Esc' : key.toUpperCase()))
    .join(' + ');
}

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/** Findet das passende Kürzel zu einem Tastendruck im aktuellen Kontext. */
export function matchShortcut(event: KeyEventLike, scope: Shortcut['scope']): Shortcut | undefined {
  return SHORTCUTS.find((shortcut) => {
    if (shortcut.scope !== scope && shortcut.scope !== 'global') return false;
    const needsCtrl = shortcut.keys.includes('Control');
    const needsShift = shortcut.keys.includes('Shift');
    const main = shortcut.keys[shortcut.keys.length - 1];
    if (needsCtrl !== (event.ctrlKey || event.metaKey)) return false;
    if (needsShift !== event.shiftKey) return false;
    if (event.altKey) return false;
    return main.toLowerCase() === event.key.toLowerCase();
  });
}
