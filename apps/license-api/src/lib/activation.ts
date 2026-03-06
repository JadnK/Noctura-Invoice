/**
 * Aktivierungsentscheidung als reine Funktion.
 *
 * Die Route laedt Daten und schreibt Ergebnisse; ob eine Aktivierung erlaubt
 * ist, entscheidet ausschliesslich dieser Code. Damit ist die Regel testbar,
 * ohne Datenbank und ohne HTTP.
 */

export const LICENSE_STATUS = ['trial', 'active', 'expired', 'blocked', 'archived'] as const;
export type LicenseStatus = (typeof LICENSE_STATUS)[number];

export interface LicenseRecord {
  readonly id: string;
  readonly status: LicenseStatus;
  readonly plan: string;
  readonly features: readonly string[];
  /** null = unbefristet. */
  readonly expiresAt: string | null;
  readonly maxDevices: number;
  readonly blockedReason?: string | null;
}

export interface DeviceRecord {
  readonly deviceId: string;
  readonly deactivatedAt: string | null;
}

export type ActivationDecision =
  | { readonly ok: true; readonly reusedDevice: boolean; readonly freeSlots: number }
  | { readonly ok: false; readonly code: string; readonly detail?: Record<string, unknown> };

export function decideActivation(
  license: LicenseRecord,
  devices: readonly DeviceRecord[],
  deviceId: string,
  nowIso: string,
): ActivationDecision {
  if (license.status === 'blocked' || license.status === 'archived') {
    return { ok: false, code: 'LIC_BLOCKED', detail: { reason: license.blockedReason ?? null } };
  }
  if (license.expiresAt !== null && Date.parse(nowIso) > Date.parse(license.expiresAt)) {
    return { ok: false, code: 'LIC_EXPIRED', detail: { expiresAt: license.expiresAt } };
  }

  const existing = devices.find((d) => d.deviceId === deviceId);
  if (existing) {
    // Ein deaktiviertes Geraet darf sich nicht stillschweigend reaktivieren:
    // sonst waere die Deaktivierung im Admin-Panel wirkungslos.
    if (existing.deactivatedAt !== null) {
      return { ok: false, code: 'LIC_DEVICE_DEACTIVATED' };
    }
    const active = devices.filter((d) => d.deactivatedAt === null).length;
    return { ok: true, reusedDevice: true, freeSlots: license.maxDevices - active };
  }

  const active = devices.filter((d) => d.deactivatedAt === null).length;
  if (active >= license.maxDevices) {
    return {
      ok: false,
      code: 'LIC_DEVICE_LIMIT',
      detail: { active, maxDevices: license.maxDevices },
    };
  }
  return { ok: true, reusedDevice: false, freeSlots: license.maxDevices - active - 1 };
}

/** Standardwerte je Tarif. Der Betreiber kann sie je Lizenz ueberschreiben. */
export const PLAN_DEFAULTS: Record<string, { maxDevices: number; graceDays: number; checkIntervalH: number; features: readonly string[] }> = {
  trial:     { maxDevices: 1, graceDays: 3,  checkIntervalH: 24, features: ['invoices', 'quotes'] },
  monthly:   { maxDevices: 2, graceDays: 7,  checkIntervalH: 24, features: ['invoices', 'quotes', 'credit_notes', 'templates', 'email'] },
  yearly:    { maxDevices: 3, graceDays: 14, checkIntervalH: 24, features: ['invoices', 'quotes', 'credit_notes', 'templates', 'email', 'recurring'] },
  lifetime:  { maxDevices: 3, graceDays: 30, checkIntervalH: 72, features: ['invoices', 'quotes', 'credit_notes', 'templates', 'email', 'recurring', 'multi_company'] },
  internal:  { maxDevices: 10, graceDays: 30, checkIntervalH: 72, features: ['*'] },
  developer: { maxDevices: 5, graceDays: 30, checkIntervalH: 72, features: ['*'] },
};

export function hasFeature(features: readonly string[], code: string): boolean {
  return features.includes('*') || features.includes(code);
}
