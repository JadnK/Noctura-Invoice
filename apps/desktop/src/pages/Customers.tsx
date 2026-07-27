import { useMemo, useState } from 'react';
import { validateIban } from '@noctura/domain';

export interface CustomerRow {
  id: string;
  number: string;
  company: string | null;
  lastName: string | null;
  email: string | null;
  city: string | null;
  openCents: number;
  archivedAt: string | null;
}

/**
 * Kundenliste mit Suche und Filter. Archivierte Kunden sind ausgeblendet, aber
 * nicht gelöscht: an einem Beleg hängt immer ein Empfänger, und der muss
 * erhalten bleiben.
 */
export function Customers({ rows, onOpen, onCreate }: {
  rows: readonly CustomerRow[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showArchived && row.archivedAt) return false;
      if (needle === '') return true;
      return [row.company, row.lastName, row.email, row.number, row.city]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [rows, query, showArchived]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Kunden</h1>
        <button type="button" onClick={onCreate}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
          Neuer Kunde
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Firma, Name, E-Mail oder Kundennummer"
          aria-label="Kunden durchsuchen"
          className="w-full max-w-md rounded border border-border bg-input px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          Archivierte anzeigen
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-elev1">
          <p className="font-medium">{query ? 'Kein Treffer' : 'Noch kein Kunde angelegt'}</p>
          <p className="mt-1 text-sm text-muted">
            {query ? 'Andere Schreibweise versuchen oder Archivierte einblenden.' : 'Legen Sie den ersten Kunden an, um eine Rechnung schreiben zu können.'}
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2">Nummer</th>
              <th scope="col" className="border-b border-border py-2">Kunde</th>
              <th scope="col" className="border-b border-border py-2">Ort</th>
              <th scope="col" className="border-b border-border py-2">E-Mail</th>
              <th scope="col" className="border-b border-border py-2 text-right">Offen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-surface" onClick={() => onOpen(row.id)}>
                <td className="border-b border-divider py-2 font-mono text-xs">{row.number}</td>
                <td className="border-b border-divider">
                  {row.company ?? row.lastName}
                  {row.archivedAt && <span className="ml-2 text-xs text-subtle">archiviert</span>}
                </td>
                <td className="border-b border-divider text-muted">{row.city ?? '—'}</td>
                <td className="border-b border-divider text-muted">{row.email ?? '—'}</td>
                <td className="border-b border-divider n-amount">
                  {(row.openCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Formular für einen neuen Kunden, mit sofortiger IBAN- und Pflichtfeldprüfung. */
export function CustomerForm({ onSave, onCancel }: {
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({ type: 'business' });
  const hasName = Boolean(values.company?.trim() || values.lastName?.trim());
  const ibanOk = !values.iban || validateIban(values.iban).valid;

  function field(key: string, label: string, type = 'text') {
    return (
      <label className="block">
        <span className="mb-1 block text-sm">{label}</span>
        <input
          type={type}
          value={values[key] ?? ''}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })}
          className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
        />
      </label>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Neuer Kunde</h1>

      <label className="block">
        <span className="mb-1 block text-sm">Art</span>
        <select
          value={values.type}
          onChange={(event) => setValues({ ...values, type: event.target.value })}
          className="rounded border border-border bg-input px-2 py-1.5 text-sm"
        >
          <option value="business">Geschäftskunde</option>
          <option value="private">Privatkunde</option>
          <option value="association">Verein</option>
          <option value="public">Öffentliche Einrichtung</option>
          <option value="other">Sonstige Organisation</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        {field('company', 'Firma')}
        {field('lastName', 'Nachname')}
        {field('firstName', 'Vorname')}
        {field('email', 'E-Mail', 'email')}
        {field('street', 'Straße und Hausnummer')}
        {field('postalCode', 'PLZ')}
        {field('city', 'Ort')}
        {field('vatId', 'USt-IdNr.')}
      </div>

      {!hasName && (
        <p className="text-sm" style={{ color: 'var(--n-warning)' }}>
          Bitte Firma oder Nachname angeben — ohne Namen lässt sich keine Rechnung adressieren.
        </p>
      )}
      {!ibanOk && <p className="text-sm" style={{ color: 'var(--n-danger)' }}>Die IBAN ist nicht gültig.</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasName || !ibanOk}
          onClick={() => onSave(values)}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Kunde speichern
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
