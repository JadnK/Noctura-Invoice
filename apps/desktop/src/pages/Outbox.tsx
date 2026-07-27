import { FAILURE_TEXT } from '@noctura/mail';
import type { FailureKind } from '@noctura/mail';

export interface OutboxEntry {
  id: string;
  subject: string;
  to: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  nextAttemptAt: string | null;
  errorCode: FailureKind | null;
}

const STATUS_LABEL: Record<OutboxEntry['status'], string> = {
  queued: 'Wartet', sending: 'Wird gesendet', sent: 'Versendet',
  failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen',
};

const STATUS_COLOR: Record<OutboxEntry['status'], string> = {
  queued: 'var(--n-state-draft)', sending: 'var(--n-state-sent)', sent: 'var(--n-state-paid)',
  failed: 'var(--n-state-overdue)', cancelled: 'var(--n-state-cancelled)',
};

/** E-Mail-Ausgang: was wartet, was fehlgeschlagen ist und warum. */
export function Outbox({ entries }: { entries: readonly OutboxEntry[] }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">E-Mail-Ausgang</h1>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-elev1">
          <p className="font-medium">Nichts im Ausgang</p>
          <p className="mt-1 text-sm text-muted">Versendete Rechnungen und Mahnungen erscheinen hier mit ihrem Zustand.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="n-state-rail rounded-lg border border-border bg-surface p-3"
                style={{ ['--rail' as string]: STATUS_COLOR[entry.status] }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium">{entry.subject}</p>
                <span className="text-xs text-subtle">{STATUS_LABEL[entry.status]}</span>
              </div>
              <p className="text-sm text-muted">{entry.to}</p>

              {entry.errorCode && (
                <div className="mt-2 rounded bg-canvas p-2 text-xs">
                  <p style={{ color: 'var(--n-danger)' }}>{FAILURE_TEXT[entry.errorCode].cause}</p>
                  <p className="mt-1 text-muted">{FAILURE_TEXT[entry.errorCode].fix}</p>
                </div>
              )}

              <div className="mt-2 flex items-center gap-3 text-xs text-subtle">
                <span>{entry.attempts} Versuch{entry.attempts === 1 ? '' : 'e'}</span>
                {entry.nextAttemptAt && <span>nächster Versuch {new Date(entry.nextAttemptAt).toLocaleTimeString('de-DE')}</span>}
                {entry.status === 'failed' && (
                  <button type="button" className="text-text underline">Erneut senden</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
