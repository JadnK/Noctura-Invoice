import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ApiError, InvoiceSummary, RecurringInvoiceSummary } from '../lib/api';
import { EmptyState, Field, Loading, PageError, buttonPrimary, buttonSecondary, inputClass, toApiError } from './pageUtils';

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich',
};

export function RecurringInvoices() {
  const [rules, setRules] = useState<RecurringInvoiceSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateResults, setTemplateResults] = useState<InvoiceSummary[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [intervalCount, setIntervalCount] = useState(1);
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [autoFinalize, setAutoFinalize] = useState(false);
  const [autoSend, setAutoSend] = useState(false);

  async function load() {
    setError(null);
    try { setRules(await api.listRecurringInvoices()); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function searchTemplates(query: string) {
    setTemplateQuery(query);
    if (query.trim().length < 2) { setTemplateResults([]); return; }
    try { setTemplateResults(await api.invoices(query.trim())); } catch { /* still typing */ }
  }

  async function create() {
    if (!templateId || !nextRunDate) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.createRecurringInvoice(templateId, frequency, intervalCount, nextRunDate, endDate || undefined, autoFinalize, autoSend);
      setShowForm(false);
      setTemplateId(''); setTemplateQuery(''); setTemplateResults([]);
      setNotice('Wiederkehrende Rechnung eingerichtet.');
      await load();
    } catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function toggleActive(rule: RecurringInvoiceSummary) {
    setBusy(true); setError(null);
    try { await api.setRecurringInvoiceActive(rule.id, !rule.active); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm('Diese wiederkehrende Rechnung löschen?')) return;
    setBusy(true); setError(null);
    try { await api.deleteRecurringInvoice(id); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function runNow() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.runRecurringInvoices();
      setNotice(`${result.created} Rechnung(en) erzeugt.`);
      await load();
    } catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Wiederkehrende Rechnungen</h1>
        <p className="mt-1 text-sm text-muted">
          Erzeugt in festem Turnus einen neuen Entwurf mit den Positionen einer Vorlagenrechnung. Kein
          Hintergrunddienst — "Jetzt ausführen" erzeugt alle fälligen Rechnungen.
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void runNow()} className={buttonSecondary}>Jetzt ausführen</button>
        <button type="button" onClick={() => setShowForm((value) => !value)} className={buttonPrimary}>{showForm ? 'Abbrechen' : 'Neu einrichten'}</button>
      </div>
    </div>
    {error && <PageError error={error} retry={() => void load()} />}
    {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}

    {showForm && (
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
        <Field label="Vorlagenrechnung (Nummer oder Kunde suchen)">
          <input value={templateQuery} onChange={(event) => void searchTemplates(event.target.value)} placeholder="z. B. RE-2026 oder Kundenname" className={inputClass} />
        </Field>
        {templateResults.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-border bg-canvas p-1 text-sm">
            {templateResults.map((invoice) => (
              <li key={invoice.id}>
                <button type="button" onClick={() => { setTemplateId(invoice.id); setTemplateQuery(`${invoice.number ?? 'Entwurf'} · ${invoice.customerName}`); setTemplateResults([]); }}
                        className={`w-full rounded px-2 py-1 text-left hover:bg-surface ${templateId === invoice.id ? 'bg-primary-soft' : ''}`}>
                  {invoice.number ?? 'Entwurf'} · {invoice.customerName}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Turnus">
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} className={inputClass}>
              <option value="monthly">monatlich</option>
              <option value="quarterly">vierteljährlich</option>
              <option value="yearly">jährlich</option>
            </select>
          </Field>
          <Field label="Intervall"><input type="number" min={1} value={intervalCount} onChange={(event) => setIntervalCount(Number(event.target.value))} className={inputClass} /></Field>
          <Field label="Nächster Lauf"><input type="date" value={nextRunDate} onChange={(event) => setNextRunDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Ende (optional)"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoFinalize} onChange={(event) => setAutoFinalize(event.target.checked)} /> Automatisch finalisieren (sonst nur Entwurf zur Kontrolle)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoSend} onChange={(event) => setAutoSend(event.target.checked)} disabled={!autoFinalize} /> Automatisch per E-Mail versenden</label>
        <div className="flex justify-end"><button type="button" disabled={busy || !templateId} onClick={() => void create()} className={buttonPrimary}>Einrichten</button></div>
      </div>
    )}

    {rules === null && !error && <Loading />}
    {rules !== null && rules.length === 0 && !error && <EmptyState title="Noch keine wiederkehrenden Rechnungen">Über "Neu einrichten" aus einer bestehenden Rechnung eine Vorlage erstellen.</EmptyState>}
    {rules !== null && rules.length > 0 && (
      <div className="space-y-3">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">{rule.customerName} · Vorlage {rule.templateInvoiceNumber || 'Entwurf'}</h2>
                <p className="mt-1 text-sm text-muted">
                  {FREQUENCY_LABEL[rule.frequency] ?? rule.frequency}, alle {rule.intervalCount} · nächster Lauf {rule.nextRunDate}
                  {rule.endDate && <> · bis {rule.endDate}</>}
                </p>
                <p className="mt-1 text-xs text-subtle">
                  {rule.autoFinalize ? 'Finalisiert automatisch' : 'Erzeugt nur Entwürfe'}{rule.autoSend && ' · versendet automatisch'}
                  {!rule.active && ' · pausiert'}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" disabled={busy} onClick={() => void toggleActive(rule)} className="text-primary">{rule.active ? 'Pausieren' : 'Fortsetzen'}</button>
                <button type="button" disabled={busy} onClick={() => void remove(rule.id)} className="text-danger">Löschen</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </div>;
}
