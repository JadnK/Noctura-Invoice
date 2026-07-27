import { useEffect, useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../lib/format';
import { api } from '../lib/api';
import type { ApiError, CreditNoteSummary, InvoiceSummary } from '../lib/api';
import {
  EmptyState,
  Field,
  Loading,
  PageError,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  toApiError,
} from './pageUtils';

export function CreditNotes() {
  const [rows, setRows] = useState<CreditNoteSummary[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [originId, setOriginId] = useState('');
  const [reason, setReason] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [creditRows, invoiceRows] = await Promise.all([api.creditNotes(), api.invoices()]);
      setRows(creditRows);
      setInvoices(invoiceRows.filter((invoice) =>
        !['draft', 'cancelled', 'archived'].includes(invoice.status) && invoice.number,
      ));
    } catch (err) {
      setError(toApiError(err));
    }
  }
  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => invoices.find((invoice) => invoice.id === originId), [invoices, originId]);

  async function create() {
    if (!originId || !reason.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const id = await api.createCreditNoteFromInvoice(originId, reason.trim());
      setShowForm(false);
      setOriginId('');
      setReason('');
      setNotice(`Gutschrift-Entwurf erstellt (${id}).`);
      await load();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function finalize(id: string) {
    setBusy(true);
    setError(null);
    try {
      const number = await api.finalizeCreditNote(id);
      setNotice(`Gutschrift ${number} wurde finalisiert.`);
      await load();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function createPdf(id: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.generateDocumentPdf('credit_note', id);
      setNotice(`PDF gespeichert: ${result.path}`);
      await load();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gutschriften</h1>
          <p className="mt-1 text-sm text-muted">Rechtssichere Vollgutschriften werden aus einer finalisierten Ursprungsrechnung erzeugt.</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} className={buttonPrimary}>
          Neue Gutschrift
        </button>
      </div>

      {error && <PageError error={error} retry={() => void load()} />}
      {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}

      {showForm && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <h2 className="font-semibold">Vollgutschrift erstellen</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted">Es gibt noch keine finalisierte Rechnung, die gutgeschrieben werden kann.</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Ursprungsrechnung" required>
                  <select value={originId} onChange={(event) => setOriginId(event.target.value)} className={inputClass}>
                    <option value="">Bitte wählen</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.number} · {invoice.customerName} · {(invoice.grossTotalCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Grund" required>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="z. B. Rückabwicklung des Auftrags" className={inputClass} />
                </Field>
              </div>
              {selected && (
                <div className="rounded border border-divider bg-canvas p-3 text-sm">
                  Die Gutschrift übernimmt sämtliche Positionen und Steuerbeträge aus Rechnung <strong>{selected.number}</strong>.
                  Teilgutschriften werden bewusst nicht automatisch berechnet.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className={buttonSecondary}>Abbrechen</button>
                <button type="button" disabled={busy || !originId || !reason.trim()} onClick={() => void create()} className={buttonPrimary}>Entwurf erstellen</button>
              </div>
            </>
          )}
        </section>
      )}

      {rows === null && !error && <Loading />}
      {rows !== null && rows.length === 0 && !error && (
        <EmptyState title="Noch keine Gutschriften">Gutschriften bleiben immer mit ihrer Ursprungsrechnung verknüpft.</EmptyState>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-elev1">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-subtle">
              <th className="border-b border-border py-2 pl-4">Nummer</th><th className="border-b border-border py-2">Ursprung</th>
              <th className="border-b border-border py-2">Kunde</th><th className="border-b border-border py-2">Datum</th>
              <th className="border-b border-border py-2">Status</th><th className="border-b border-border py-2 text-right">Brutto</th>
              <th className="border-b border-border py-2 pr-3 text-right">Aktion</th>
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="border-b border-divider py-2 pl-4 font-mono text-xs">{row.number ?? 'Entwurf'}</td>
                  <td className="border-b border-divider py-2">{row.originInvoiceNumber ?? row.originInvoiceId}</td>
                  <td className="border-b border-divider py-2">{row.customerName}</td>
                  <td className="border-b border-divider py-2 text-muted">{formatDate(row.issueDate)}</td>
                  <td className="border-b border-divider py-2"><StatusBadge state={row.status as never} /></td>
                  <td className="border-b border-divider py-2 text-right"><Amount cents={row.grossTotalCents} /></td>
                  <td className="border-b border-divider py-2 pr-3 text-right">
                    {row.status === 'draft' ? (
                      <button type="button" disabled={busy} onClick={() => void finalize(row.id)} className="text-primary">Finalisieren</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void createPdf(row.id)} className="text-primary">PDF erzeugen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
