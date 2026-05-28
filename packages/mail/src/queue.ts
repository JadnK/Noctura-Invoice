/**
 * Versandwarteschlange.
 *
 * Zwei Regeln bestimmen das Verhalten:
 *  - Vor dem Sendeversuch wird der Zaehler erhoeht und festgeschrieben. Ein
 *    Absturz mitten im Versand fuehrt dann zu einem moeglichen Nichtversand,
 *    nie zu einem Doppelversand. Bei Rechnungen ist das die richtige Richtung.
 *  - Dauerhafte Fehler werden nicht wiederholt. Ein falsches Passwort wird
 *    durch den fuenften Versuch nicht richtiger.
 */

export const MAX_ATTEMPTS = 5;

/** Wartezeit vor dem naechsten Versuch, in Sekunden. */
export const BACKOFF_SECONDS = [60, 300, 900, 3600, 21_600] as const;

export type FailureKind =
  | 'auth' | 'tls' | 'dns' | 'timeout' | 'rejected_recipient'
  | 'too_large' | 'rate_limited' | 'server_error' | 'unknown';

/** Fehler, bei denen ein erneuter Versuch sinnlos ist. */
export const PERMANENT_FAILURES: readonly FailureKind[] = [
  'auth', 'rejected_recipient', 'too_large',
];

export interface QueueItem {
  readonly id: string;
  readonly status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  readonly attempts: number;
  readonly nextAttemptAt: string;
}

export function isPermanent(kind: FailureKind): boolean {
  return PERMANENT_FAILURES.includes(kind);
}

export function backoffSeconds(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[index];
}

export interface Decision {
  readonly status: QueueItem['status'];
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly reason: string;
}

export function onFailure(item: QueueItem, kind: FailureKind, nowIso: string): Decision {
  const attempts = item.attempts + 1;
  if (isPermanent(kind)) {
    return { status: 'failed', attempts, nextAttemptAt: null, reason: 'Dauerhafter Fehler, kein weiterer Versuch.' };
  }
  if (attempts >= MAX_ATTEMPTS) {
    return { status: 'failed', attempts, nextAttemptAt: null, reason: 'Maximale Anzahl an Versuchen erreicht.' };
  }
  const wait = backoffSeconds(attempts);
  return {
    status: 'queued',
    attempts,
    nextAttemptAt: new Date(Date.parse(nowIso) + wait * 1000).toISOString(),
    reason: `Erneuter Versuch in ${Math.round(wait / 60)} Minuten.`,
  };
}

export function onSuccess(item: QueueItem): Decision {
  return { status: 'sent', attempts: item.attempts + 1, nextAttemptAt: null, reason: 'Versendet.' };
}

/** Faellige Eintraege in Reihenfolge ihrer Faelligkeit. */
export function dueItems(items: readonly QueueItem[], nowIso: string, limit = 10): QueueItem[] {
  const now = Date.parse(nowIso);
  return items
    .filter((item) => item.status === 'queued' && Date.parse(item.nextAttemptAt) <= now)
    .sort((a, b) => Date.parse(a.nextAttemptAt) - Date.parse(b.nextAttemptAt))
    .slice(0, limit);
}

export const FAILURE_TEXT: Record<FailureKind, { cause: string; fix: string }> = {
  auth: { cause: 'Der Server hat Benutzername oder Passwort abgelehnt.', fix: 'Zugangsdaten prüfen. Gmail und Microsoft 365 benötigen ein App-Passwort.' },
  tls: { cause: 'Die verschlüsselte Verbindung kam nicht zustande.', fix: 'Port und Verschlüsselung prüfen: 465 nutzt TLS, 587 nutzt STARTTLS.' },
  dns: { cause: 'Der Servername konnte nicht aufgelöst werden.', fix: 'Schreibweise des Hosts und die Internetverbindung prüfen.' },
  timeout: { cause: 'Der Server hat nicht rechtzeitig geantwortet.', fix: 'Wird automatisch erneut versucht. Bei wiederholtem Auftreten Zeitlimit erhöhen.' },
  rejected_recipient: { cause: 'Der Empfänger wurde abgelehnt.', fix: 'E-Mail-Adresse des Kunden prüfen.' },
  too_large: { cause: 'Der Anhang überschreitet das Limit des Servers.', fix: 'PDF verkleinern oder einen Downloadlink versenden.' },
  rate_limited: { cause: 'Der Server begrenzt die Anzahl der Nachrichten.', fix: 'Der Versand wird später fortgesetzt.' },
  server_error: { cause: 'Der Mailserver meldet einen internen Fehler.', fix: 'Wird automatisch erneut versucht.' },
  unknown: { cause: 'Unbekannter Fehler beim Versand.', fix: 'Technische Details im aufklappbaren Bereich prüfen.' },
};
