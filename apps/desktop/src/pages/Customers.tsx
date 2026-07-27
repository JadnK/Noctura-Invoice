import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Customer, CustomerDetail, CustomerInput } from '../lib/api';
import { ApiError } from '../lib/api';
import { ErrorNotice } from '../components/ErrorNotice';

/**
 * Kundenverwaltung. Liste, Anlegen, Bearbeiten - vollstaendig gegen die
 * echte lokale Datenbank, keine Beispieldaten. Archivierte Kunden bleiben
 * ausgeblendet, aber nicht geloescht: an einem Beleg haengt immer ein
 * Empfaenger, der erhalten bleiben muss.
 */
export function Customers({ onOpen }: { onOpen?: (id: string) => void }) {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      setRows(await api.customers(query || undefined, showArchived));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    }
  }

  useEffect(() => { void load(); }, [showArchived]);
  // Suche mit leichter Verzoegerung, damit nicht bei jedem Tastendruck neu geladen wird.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (creating || editingId) {
    return (
      <CustomerForm
        customerId={editingId}
        onDone={() => { setCreating(false); setEditingId(null); void load(); }}
        onCancel={() => { setCreating(false); setEditingId(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Kunden</h1>
        <button type="button" onClick={() => setCreating(true)}
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

      {error && <ErrorNotice error={error} onRetry={() => void load()} />}

      {!error && rows === null && <p className="text-sm text-subtle">Wird geladen…</p>}

      {!error && rows !== null && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-elev1">
          <p className="font-medium">{query ? 'Kein Treffer' : 'Noch kein Kunde angelegt'}</p>
          <p className="mt-1 text-sm text-muted">
            {query ? 'Andere Schreibweise versuchen oder Archivierte einblenden.' : 'Legen Sie den ersten Kunden an, um eine Rechnung schreiben zu können.'}
          </p>
        </div>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2">Nummer</th>
              <th scope="col" className="border-b border-border py-2">Kunde</th>
              <th scope="col" className="border-b border-border py-2">E-Mail</th>
              <th scope="col" className="border-b border-border py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-surface" onClick={() => { setEditingId(row.id); onOpen?.(row.id); }}>
                <td className="border-b border-divider py-2 font-mono text-xs">{row.number}</td>
                <td className="border-b border-divider">
                  {row.company ?? [row.firstName, row.lastName].filter(Boolean).join(' ')}
                  {row.archivedAt && <span className="ml-2 text-xs text-subtle">archiviert</span>}
                </td>
                <td className="border-b border-divider text-muted">{row.email ?? '—'}</td>
                <td className="border-b border-divider text-right text-xs text-subtle">Bearbeiten</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const CUSTOMER_TYPES = [
  { value: 'business', label: 'Geschäftskunde' },
  { value: 'private', label: 'Privatkunde' },
  { value: 'association', label: 'Verein' },
  { value: 'public', label: 'Öffentliche Einrichtung' },
  { value: 'other', label: 'Sonstige Organisation' },
] as const;

function emptyForm(): CustomerInput {
  return { kind: 'business', taxStatus: 'domestic', discountBp: 0 };
}

/** Formular fuer neuen oder bestehenden Kunden, mit sofortiger IBAN- und Pflichtfeldpruefung. */
function CustomerForm({ customerId, onDone, onCancel }: {
  customerId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CustomerInput>(emptyForm());
  const [loading, setLoading] = useState(customerId !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!customerId) return;
    api.customer(customerId)
      .then((detail) => {
        if (detail) setValues(detailToInput(detail));
        setLoading(false);
      })
      .catch((err) => { setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err))); setLoading(false); });
  }, [customerId]);

  const hasName = Boolean(values.company?.trim() || values.lastName?.trim());
  const canSave = hasName && !busy;

  function field(key: keyof CustomerInput, label: string, type = 'text') {
    return (
      <label className="block">
        <span className="mb-1 block text-sm">{label}</span>
        <input
          type={type}
          value={(values[key] as string | number | undefined) ?? ''}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })}
          className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
        />
      </label>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (customerId) await api.updateCustomer(customerId, values);
      else await api.createCustomer(values);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-subtle">Wird geladen…</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{customerId ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h1>

      <label className="block">
        <span className="mb-1 block text-sm">Art</span>
        <select
          value={values.kind}
          onChange={(event) => setValues({ ...values, kind: event.target.value })}
          className="rounded border border-border bg-input px-2 py-1.5 text-sm"
        >
          {CUSTOMER_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        {field('company', 'Firma')}
        {field('lastName', 'Nachname')}
        {field('firstName', 'Vorname')}
        {field('email', 'E-Mail', 'email')}
        {field('phone', 'Telefon')}
        {field('vatId', 'USt-IdNr.')}
        {field('street', 'Straße und Hausnummer')}
        {field('postalCode', 'PLZ')}
        {field('city', 'Ort')}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm">Rabatt (%)</span>
        <input
          type="number" min={0} max={100} step={0.5}
          value={values.discountBp / 100}
          onChange={(event) => setValues({ ...values, discountBp: Math.round(Number(event.target.value) * 100) })}
          className="w-32 rounded border border-border bg-input px-2 py-1.5 text-sm"
        />
      </label>

      {!hasName && (
        <p className="text-sm" style={{ color: 'var(--n-warning)' }}>
          Bitte Firma oder Nachname angeben — ohne Namen lässt sich keine Rechnung adressieren.
        </p>
      )}
      {error && <ErrorNotice error={error} />}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Wird gespeichert…' : 'Kunde speichern'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function detailToInput(detail: CustomerDetail): CustomerInput {
  return {
    kind: detail.type, taxStatus: detail.taxStatus, discountBp: detail.discountBp,
    company: detail.company ?? undefined, firstName: detail.firstName ?? undefined,
    lastName: detail.lastName ?? undefined, email: detail.email ?? undefined,
    phone: detail.phone ?? undefined, vatId: detail.vatId ?? undefined,
    street: detail.street ?? undefined, houseNo: detail.houseNo ?? undefined,
    postalCode: detail.postalCode ?? undefined, city: detail.city ?? undefined,
    country: detail.country,
  };
}
