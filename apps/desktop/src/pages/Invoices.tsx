import { useEffect, useState } from 'react';
import { Amount } from '../components/Amount';
import { StatusBadge, stateRailColor } from '../components/StatusBadge';
import { formatDate } from '../lib/format';
import { api } from '../lib/api';
import type { ApiError, InvoiceSummary } from '../lib/api';
import { InvoiceEditor } from './InvoiceEditor';
import {
  EmptyState,
  Loading,
  PageError,
  STATUS_LABEL,
  buttonPrimary,
  inputClass,
  toApiError,
} from './pageUtils';

export function Invoices({ initialQuery = '', initialId }: { initialQuery?: string; initialId?: string | null }) {
  const [rows, setRows] = useState<InvoiceSummary[] | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null | undefined>(initialId);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setError(null);
    try {
      setRows(await api.invoices(query, status));
    } catch (err) {
      setError(toApiError(err));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  if (editingId !== undefined) {
    return (
      <InvoiceEditor
        invoiceId={editingId}
        onDone={() => {
          setEditingId(undefined);
          void load();
        }}
        onCancel={() => setEditingId(undefined)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rechnungen</h1>
          <p className="mt-1 text-sm text-muted">Entwürfe, Zahlungen, PDFs und Versand an einem Ort.</p>
        </div>
        <button type="button" onClick={() => setEditingId(null)} className={buttonPrimary}>
          Neue Rechnung
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nummer oder Kunde suchen"
          className={inputClass}
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
          <option value="">Alle Status</option>
          {['draft', 'finalized', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((value) => (
            <option key={value} value={value}>{STATUS_LABEL[value]}</option>
          ))}
        </select>
      </div>

      {error && <PageError error={error} retry={() => void load()} />}
      {!error && rows === null && <Loading />}
      {!error && rows !== null && rows.length === 0 && (
        <EmptyState
          title={query || status ? 'Keine passenden Rechnungen' : 'Noch keine Rechnung'}
          action={!query && !status ? (
            <button type="button" onClick={() => setEditingId(null)} className={buttonPrimary}>
              Erste Rechnung erstellen
            </button>
          ) : undefined}
        >
          {query || status ? 'Ändern Sie Suche oder Filter.' : 'Neue Rechnungen werden als Entwurf in SQLite gespeichert.'}
        </EmptyState>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-elev1">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-subtle">
                <th className="border-b border-border py-2 pl-4 font-medium">Nummer</th>
                <th className="border-b border-border py-2 font-medium">Kunde</th>
                <th className="border-b border-border py-2 font-medium">Datum</th>
                <th className="border-b border-border py-2 font-medium">Fällig</th>
                <th className="border-b border-border py-2 font-medium">Status</th>
                <th className="border-b border-border py-2 text-right font-medium">Offen</th>
                <th className="border-b border-border py-2 pr-3 text-right font-medium">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="n-state-rail cursor-pointer hover:bg-canvas"
                  style={{ ['--rail' as string]: stateRailColor(row.status as never) }}
                  onClick={() => setEditingId(row.id)}
                >
                  <td className="border-b border-divider py-2 pl-4 font-mono text-xs">{row.number ?? 'Entwurf'}</td>
                  <td className="border-b border-divider py-2">{row.customerName}</td>
                  <td className="border-b border-divider py-2 text-muted">{formatDate(row.issueDate)}</td>
                  <td className="border-b border-divider py-2 text-muted">{formatDate(row.dueDate)}</td>
                  <td className="border-b border-divider py-2"><StatusBadge state={row.status as never} /></td>
                  <td className="border-b border-divider py-2 text-right"><Amount cents={row.openCents} /></td>
                  <td className="border-b border-divider py-2 pr-3 text-right"><Amount cents={row.grossTotalCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
