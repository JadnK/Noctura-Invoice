import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ApiError, OutboxEntry } from '../lib/api';
import { formatDateLong } from '../lib/format';
import { EmptyState, Loading, PageError, STATUS_LABEL, buttonPrimary, buttonSecondary, toApiError } from './pageUtils';

export function Outbox() {
  const [entries, setEntries] = useState<OutboxEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setEntries(await api.outbox()); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function process() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.processOutbox();
      setNotice(`${result.sent} E-Mail(s) versendet, ${result.failed} fehlgeschlagen.`);
      await load();
    } catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }
  async function retry(id: string) {
    setBusy(true); setError(null);
    try { await api.retryOutbox(id); await process(); }
    catch (err) { setError(toApiError(err)); setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true); setError(null);
    try { await api.cancelOutbox(id); await load(); }
    catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }
  async function dunning() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.runDunning();
      setNotice(`${result.remindersSent} Mahnung(en)/Erinnerung(en) verschickt, ${result.skipped} übersprungen (nicht fällig oder bereits verschickt).`);
      await load();
    } catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight">E-Mail-Ausgang</h1><p className="mt-1 text-sm text-muted">Persistente SMTP-Warteschlange mit Fehlerdetails und kontrollierten Wiederholungen.</p></div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void dunning()} className={buttonSecondary}>Mahnlauf starten</button>
        <button type="button" disabled={busy} onClick={() => void process()} className={buttonPrimary}>Fällige E-Mails senden</button>
      </div>
    </div>
    {error && <PageError error={error} retry={() => void load()} />}
    {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}
    {entries === null && !error && <Loading />}
    {entries !== null && entries.length === 0 && !error && <EmptyState title="E-Mail-Ausgang ist leer">Versandaufträge aus Rechnungen und Angeboten erscheinen hier.</EmptyState>}
    {entries !== null && entries.length > 0 && <div className="space-y-3">{entries.map((entry) => <article key={entry.id} className="rounded-lg border border-border bg-surface p-4 shadow-elev1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">{entry.subject}</h2><p className="mt-1 text-sm text-muted">An: {entry.toAddr}</p><p className="mt-1 text-xs text-subtle">Erstellt: {formatDateLong(entry.createdAt)} · Status: {STATUS_LABEL[entry.status] ?? entry.status} · Versuche: {entry.attempts}</p></div><div className="flex gap-3 text-sm">{['failed', 'cancelled'].includes(entry.status) && <button type="button" disabled={busy} onClick={() => void retry(entry.id)} className="text-primary">Erneut senden</button>}{['queued', 'failed'].includes(entry.status) && <button type="button" disabled={busy} onClick={() => void cancel(entry.id)} className="text-danger">Abbrechen</button>}</div></div>{entry.lastErrorDetail && <details className="mt-3 rounded border border-divider bg-canvas p-2 text-xs"><summary className="cursor-pointer font-medium">Fehlerdetails ({entry.lastErrorCode ?? 'unbekannt'})</summary><pre className="mt-2 whitespace-pre-wrap break-words text-subtle">{entry.lastErrorDetail}</pre></details>}{entry.sentAt && <p className="mt-2 text-xs text-subtle">Versendet: {formatDateLong(entry.sentAt)}</p>}</article>)}</div>}
  </div>;
}
