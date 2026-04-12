/** Hauptnavigation. Reihenfolge entspricht dem Arbeitsablauf, nicht dem Alphabet. */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly group: 'belege' | 'stammdaten' | 'system';
}

export const NAVIGATION: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'belege' },
  { id: 'invoices', label: 'Rechnungen', shortcut: 'Strg + N', group: 'belege' },
  { id: 'quotes', label: 'Angebote', group: 'belege' },
  { id: 'credit-notes', label: 'Gutschriften', group: 'belege' },
  { id: 'customers', label: 'Kunden', shortcut: 'Strg + Umschalt + N', group: 'stammdaten' },
  { id: 'products', label: 'Produkte', group: 'stammdaten' },
  { id: 'discounts', label: 'Rabatte', group: 'stammdaten' },
  { id: 'templates', label: 'Vorlagen', group: 'stammdaten' },
  { id: 'outbox', label: 'E-Mail-Ausgang', group: 'system' },
  { id: 'reports', label: 'Auswertungen', group: 'system' },
  { id: 'settings', label: 'Einstellungen', shortcut: 'Strg + ,', group: 'system' },
  { id: 'license', label: 'Lizenz', group: 'system' },
  { id: 'help', label: 'Hilfe', group: 'system' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  belege: 'Belege',
  stammdaten: 'Stammdaten',
  system: 'Verwaltung',
};
