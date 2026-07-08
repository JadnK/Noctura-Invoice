import { formatKeys, SHORTCUTS } from '../lib/shortcuts';

const SCOPE_LABEL = { global: 'Überall', editor: 'Im Editor', dialog: 'In Dialogen' } as const;

export function Help() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Hilfe</h1>

      <section>
        <h2 className="mb-2 text-sm font-medium">Tastenkürzel</h2>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.id}>
                <td className="border-b border-divider py-1.5">{shortcut.label}</td>
                <td className="border-b border-divider py-1.5 text-xs text-subtle">{SCOPE_LABEL[shortcut.scope]}</td>
                <td className="border-b border-divider py-1.5 text-right">
                  <kbd className="rounded border border-border px-1.5 py-0.5 text-xs">{formatKeys(shortcut)}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 className="font-medium">Wo liegen meine Daten?</h2>
        <p className="mt-1 text-muted">
          Alle Rechnungen, Kunden und Anhänge liegen lokal auf diesem Rechner. Der Lizenzserver
          erhält nur Lizenzschlüssel, Geräte-ID und Programmversion — keine Belege, keine Beträge,
          keine Kundendaten.
        </p>
        <p className="mt-2 text-muted">
          Sicherungen erstellen Sie unter Einstellungen → Sicherung. Ohne Sicherung ist ein
          Festplattenausfall ein Datenverlust.
        </p>
      </section>
    </div>
  );
}
