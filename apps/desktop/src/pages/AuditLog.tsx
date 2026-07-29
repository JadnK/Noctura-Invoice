import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ApiError, AuditIntegrityResult, AuditLogEntry } from '../lib/api';
import { formatDateLong } from '../lib/format';
import { EmptyState, Loading, PageError, buttonPrimary, toApiError } from './pageUtils';

const ACTION_LABEL: Record<string, string> = {
  create: 'Angelegt',
  finalize: 'Finalisiert',
  cancel: 'Storniert',
};

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuditIntegrityResult | null>(null);

  async function load() {
    setError(null);
    try { setEntries(await api.listAuditLog(200)); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function verify() {
    setBusy(true); setError(null);
    try { setResult(await api.verifyAuditLog()); }
    catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Prüfprotokoll</h1>
        <p className="mt-1 text-sm text-muted">
          Verkettetes Protokoll aller finalisierten und stornierten Belege. Jeder Eintrag hängt am Hash seines
          Vorgängers — eine nachträgliche Änderung würde die Kette erkennbar brechen (GoBD-Nachweis).
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => void verify()} className={buttonPrimary}>Kette prüfen</button>
    </div>
    {error && <PageError error={error} retry={() => void load()} />}
    {result && (
      <div className={`rounded border px-3 py-2 text-sm ${result.ok ? 'border-border bg-surface' : 'border-danger'}`} style={!result.ok ? { color: 'var(--n-danger)' } : undefined}>
        {result.ok
          ? `Kette intakt — ${result.checked} Einträge geprüft, keine Auffälligkeiten.`
          : `Kette gebrochen bei Eintrag "${result.brokenAt?.action ?? '?'}" (${result.brokenAt?.objectType ?? '?'} ${result.brokenAt?.objectId ?? ''}, ${result.brokenAt ? formatDateLong(result.brokenAt.at) : ''}). Dieser oder ein späterer Eintrag wurde nachträglich verändert.`}
      </div>
    )}
    {entries === null && !error && <Loading />}
    {entries !== null && entries.length === 0 && !error && <EmptyState title="Noch keine Einträge">Sobald ein Beleg finalisiert oder storniert wird, erscheint hier ein Protokolleintrag.</EmptyState>}
    {entries !== null && entries.length > 0 && (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-subtle">
            <th scope="col" className="border-b border-border py-2">Zeitpunkt</th>
            <th scope="col" className="border-b border-border py-2">Aktion</th>
            <th scope="col" className="border-b border-border py-2">Beleg</th>
            <th scope="col" className="border-b border-border py-2">Quelle</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={index}>
              <td className="border-b border-divider py-1.5 text-muted">{formatDateLong(entry.at)}</td>
              <td className="border-b border-divider">{ACTION_LABEL[entry.action] ?? entry.action}</td>
              <td className="border-b border-divider text-muted">{entry.objectType} {entry.objectId.slice(0, 8)}…</td>
              <td className="border-b border-divider text-subtle">{entry.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>;
}
