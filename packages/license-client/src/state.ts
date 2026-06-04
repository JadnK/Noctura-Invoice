/**
 * Lizenzzustand in der Desktop-App.
 *
 * Der Zustand entsteht ausschliesslich aus gespeicherten Werten und der
 * aktuellen Zeit — keine Netzwerkaufrufe, keine Seiteneffekte. Damit ist das
 * Verhalten bei Serverausfall, Systemzeitsprung und Ablauf testbar.
 */

export type LicenseMode = 'unlicensed' | 'active' | 'warning' | 'restricted';

export interface LicenseCache {
  readonly status: 'none' | 'valid' | 'expired' | 'blocked';
  readonly plan?: string;
  readonly features?: readonly string[];
  /** Ablauf der Lizenz. null = unbefristet. */
  readonly expiresAt?: string | null;
  readonly lastOnlineAt?: string;
  readonly graceDays?: number;
  readonly checkIntervalH?: number;
  readonly blockedReason?: string;
}

export interface LicenseView {
  readonly mode: LicenseMode;
  readonly headline: string;
  readonly detail: string;
  /** Tage, die ohne Serverkontakt noch bleiben. */
  readonly offlineDaysLeft: number | null;
  readonly daysUntilExpiry: number | null;
  readonly shouldCheckNow: boolean;
}

const DAY = 86_400_000;

function days(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY;
}

export function evaluateLicense(cache: LicenseCache, nowIso: string): LicenseView {
  if (cache.status === 'none') {
    return {
      mode: 'unlicensed',
      headline: 'Keine Lizenz aktiviert',
      detail: 'Bestehende Rechnungen bleiben lesbar und exportierbar. Zum Erstellen neuer Belege wird ein Lizenzschlüssel benötigt.',
      offlineDaysLeft: null, daysUntilExpiry: null, shouldCheckNow: false,
    };
  }

  if (cache.status === 'blocked') {
    return {
      mode: 'restricted',
      headline: 'Lizenz gesperrt',
      detail: cache.blockedReason
        ? `Grund: ${cache.blockedReason}`
        : 'Bitte wenden Sie sich an den Anbieter.',
      offlineDaysLeft: 0, daysUntilExpiry: null, shouldCheckNow: true,
    };
  }

  const expiresAt = cache.expiresAt ?? null;
  const daysUntilExpiry = expiresAt === null ? null : Math.floor(days(nowIso, expiresAt));

  if (cache.status === 'expired' || (daysUntilExpiry !== null && daysUntilExpiry < 0)) {
    return {
      mode: 'restricted',
      headline: 'Lizenz abgelaufen',
      detail: 'Neue Belege können erst nach einer Verlängerung finalisiert werden. Ansehen, Export und Sicherung bleiben möglich.',
      offlineDaysLeft: 0, daysUntilExpiry, shouldCheckNow: true,
    };
  }

  const graceDays = cache.graceDays ?? 7;
  const lastOnline = cache.lastOnlineAt ?? nowIso;
  const offlineDays = days(lastOnline, nowIso);
  const offlineDaysLeft = Math.max(0, Math.ceil(graceDays - offlineDays));
  const checkInterval = (cache.checkIntervalH ?? 24) / 24;
  const shouldCheckNow = offlineDays >= checkInterval;

  if (offlineDays > graceDays) {
    return {
      mode: 'restricted',
      headline: 'Lizenz konnte nicht geprüft werden',
      detail: `Seit ${Math.floor(offlineDays)} Tagen besteht keine Verbindung zum Lizenzserver. Neue Belege sind vorübergehend gesperrt, alle vorhandenen Daten bleiben zugänglich.`,
      offlineDaysLeft: 0, daysUntilExpiry, shouldCheckNow: true,
    };
  }

  if (offlineDaysLeft <= 2) {
    return {
      mode: 'warning',
      headline: `Offline-Nutzung endet in ${offlineDaysLeft} Tag${offlineDaysLeft === 1 ? '' : 'en'}`,
      detail: 'Sobald wieder eine Verbindung besteht, wird die Lizenz automatisch bestätigt.',
      offlineDaysLeft, daysUntilExpiry, shouldCheckNow,
    };
  }

  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
    return {
      mode: 'warning',
      headline: `Lizenz läuft in ${daysUntilExpiry} Tagen ab`,
      detail: 'Eine Verlängerung verhindert, dass die Belegerstellung unterbrochen wird.',
      offlineDaysLeft, daysUntilExpiry, shouldCheckNow,
    };
  }

  return {
    mode: 'active',
    headline: cache.plan ? `Lizenz aktiv (${cache.plan})` : 'Lizenz aktiv',
    detail: expiresAt === null ? 'Unbefristet.' : `Gültig bis ${expiresAt.slice(0, 10)}.`,
    offlineDaysLeft, daysUntilExpiry, shouldCheckNow,
  };
}

/** Faehigkeiten, die im eingeschraenkten Modus erhalten bleiben. */
export const ALWAYS_ALLOWED = [
  'invoices.read', 'invoices.export', 'invoices.print', 'quotes.read',
  'customers.read', 'products.read', 'payments.record',
  'backup.create', 'backup.restore', 'settings.read', 'license.manage',
] as const;

export function isAllowed(view: LicenseView, capability: string, features: readonly string[] = []): boolean {
  if ((ALWAYS_ALLOWED as readonly string[]).includes(capability)) return true;
  if (view.mode === 'restricted' || view.mode === 'unlicensed') return false;
  const module = capability.split('.')[0];
  return features.includes('*') || features.length === 0 || features.includes(module);
}
