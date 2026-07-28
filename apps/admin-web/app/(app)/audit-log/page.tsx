'use client';

import { useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  objectType: string;
  objectId: string | null;
  diffJson: unknown;
  ipHash: string | null;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  nextCursor: string | null;
}

const LIMIT = 50;

const ACTION_LABEL: Record<string, string> = {
  'license.create': 'Lizenz erstellt',
  'license.block': 'Lizenz gesperrt',
  'license.unblock': 'Lizenz entsperrt',
  'license.extend': 'Ablaufdatum geändert',
  'license.reset-devices': 'Geräte zurückgesetzt',
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch {
    return iso;
  }
}

/**
 * Audit-Log mit Cursor-Pagination gegen GET /admin/audit-log. Rein
 * lesender Endpunkt, deshalb kein CSRF-Header noetig — nur das
 * Session-Cookie wird mitgeschickt (credentials: 'same-origin'), analog
 * zum SSR-Fetch der Lizenzliste, hier clientseitig wegen "Weitere laden".
 */
export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(nextCursor: string | null) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (nextCursor) params.set('cursor', nextCursor);

      const response = await fetch(`/api/v1/admin/audit-log?${params.toString()}`, {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        setError('Audit-Log konnte nicht geladen werden. Bitte erneut anmelden.');
        return;
      }

      const body = (await response.json()) as AuditLogResponse;
      setEntries((prev) => (nextCursor ? [...prev, ...body.entries] : body.entries));
      setCursor(body.nextCursor);
    } catch {
      setError('Der Lizenzserver ist nicht erreichbar.');
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }

  useEffect(() => {
    void loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Audit-Log</h1>
        <p className="mt-1 text-sm text-muted">Protokoll aller administrativen Aktionen.</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded border border-border bg-surface p-2 text-sm" style={{ color: 'var(--n-danger)' }}>
          {error}
        </p>
      )}

      {!loadedOnce ? (
        <p className="text-subtle">Wird geladen…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-medium">Noch keine Einträge</p>
          <p className="mt-1 text-sm text-muted">Administrative Aktionen erscheinen hier, sobald sie ausgeführt wurden.</p>
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-subtle">
                <th scope="col" className="border-b border-border py-2 pl-3">Zeitpunkt</th>
                <th scope="col" className="border-b border-border py-2">Aktion</th>
                <th scope="col" className="border-b border-border py-2">Objekt</th>
                <th scope="col" className="border-b border-border py-2">Akteur</th>
                <th scope="col" className="border-b border-border py-2 pr-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="border-b border-divider py-2 pl-3 text-muted">{formatTimestamp(entry.at)}</td>
                  <td className="border-b border-divider">{ACTION_LABEL[entry.action] ?? entry.action}</td>
                  <td className="border-b border-divider">
                    <span className="text-subtle">{entry.objectType}</span>
                    {entry.objectId && (
                      <span className="ml-1.5 font-mono text-xs text-muted">{entry.objectId.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="border-b border-divider text-muted">{entry.actor}</td>
                  <td className="border-b border-divider py-2 pr-3">
                    {entry.diffJson === null || entry.diffJson === undefined ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-sm" style={{ color: 'var(--n-primary)' }}>
                          Details
                        </summary>
                        <pre className="mt-1.5 max-w-md overflow-x-auto rounded border border-border bg-input p-2 font-mono text-xs text-muted">
                          {JSON.stringify(entry.diffJson, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4">
            {cursor ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadPage(cursor)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-raised disabled:opacity-40"
              >
                {busy ? 'Wird geladen…' : 'Weitere laden'}
              </button>
            ) : (
              <p className="text-sm text-subtle">Keine weiteren Einträge.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
