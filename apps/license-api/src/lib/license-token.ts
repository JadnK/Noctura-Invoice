/**
 * Aufbau und Pruefung des Lizenz-Tokens.
 *
 * Der Server erzeugt, die Desktop-App prueft — mit demselben Code, damit beide
 * Seiten dieselbe Vorstellung vom Format haben. Die App kennt nur den
 * oeffentlichen Schluessel.
 */
import { signPayload, verifyPayload } from './crypto.ts';
import type { KeyObject } from 'node:crypto';

export interface LicenseTokenPayload {
  readonly lic: string;
  readonly dev: string;
  readonly plan: string;
  readonly feat: readonly string[];
  /** ISO-Zeitpunkt des Ablaufs. null = unbefristet. */
  readonly exp: string | null;
  readonly iat: string;
  readonly nonce: string;
  readonly graceDays: number;
  readonly checkIntervalH: number;
}

export interface SignedLicenseToken {
  readonly payload: string;
  readonly signature: string;
}

/** Kanonische Serialisierung: Schluessel sortiert, keine Leerzeichen. */
export function canonical(payload: LicenseTokenPayload): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    ordered[key] = (payload as unknown as Record<string, unknown>)[key];
  }
  return JSON.stringify(ordered);
}

export function issueToken(payload: LicenseTokenPayload, privateKey: KeyObject): SignedLicenseToken {
  const serialized = Buffer.from(canonical(payload), 'utf8').toString('base64url');
  return { payload: serialized, signature: signPayload(serialized, privateKey) };
}

export const TOKEN_ERRORS = {
  SIGNATURE: 'LIC_SIGNATURE',
  MALFORMED: 'LIC_MALFORMED',
  DEVICE: 'LIC_DEVICE_MISMATCH',
  NONCE: 'LIC_REPLAY',
  EXPIRED: 'LIC_EXPIRED',
  GRACE: 'LIC_GRACE_EXCEEDED',
} as const;
export type TokenError = (typeof TOKEN_ERRORS)[keyof typeof TOKEN_ERRORS];

export type TokenCheck =
  | { readonly ok: true; readonly payload: LicenseTokenPayload; readonly warnOffline: boolean }
  | { readonly ok: false; readonly code: TokenError };

export interface CheckOptions {
  readonly expectedDeviceId: string;
  readonly expectedNonce?: string;
  /** Zeitpunkt der letzten erfolgreichen Serverantwort. */
  readonly lastOnlineAt: string;
  readonly now: string;
}

const DAY_MS = 86_400_000;

/**
 * Offline-Pruefung in der Desktop-App.
 *
 * Reihenfolge ist Absicht: erst Signatur, dann Form, dann Bindung an das Geraet,
 * dann Zeit.
 */
export function checkToken(
  token: SignedLicenseToken,
  publicKey: KeyObject,
  options: CheckOptions,
): TokenCheck {
  if (!verifyPayload(token.payload, token.signature, publicKey)) {
    return { ok: false, code: TOKEN_ERRORS.SIGNATURE };
  }

  let payload: LicenseTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(token.payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: TOKEN_ERRORS.MALFORMED };
  }
  if (typeof payload?.lic !== 'string' || typeof payload?.dev !== 'string') {
    return { ok: false, code: TOKEN_ERRORS.MALFORMED };
  }
  if (payload.dev !== options.expectedDeviceId) {
    return { ok: false, code: TOKEN_ERRORS.DEVICE };
  }
  if (options.expectedNonce !== undefined && payload.nonce !== options.expectedNonce) {
    return { ok: false, code: TOKEN_ERRORS.NONCE };
  }

  const now = Date.parse(options.now);
  if (payload.exp !== null && now > Date.parse(payload.exp)) {
    return { ok: false, code: TOKEN_ERRORS.EXPIRED };
  }

  const offlineMs = now - Date.parse(options.lastOnlineAt);
  const graceMs = payload.graceDays * DAY_MS;
  if (offlineMs > graceMs) {
    return { ok: false, code: TOKEN_ERRORS.GRACE };
  }

  // Warnung, sobald nur noch zwei Tage der Toleranz uebrig sind.
  const warnOffline = offlineMs > graceMs - 2 * DAY_MS;
  return { ok: true, payload, warnOffline };
}

/** Faehigkeiten, die im eingeschraenkten Modus verfuegbar bleiben. */
export const RESTRICTED_MODE_ALLOWED = [
  'invoices.read', 'invoices.export', 'invoices.print',
  'payments.record', 'backup.create', 'backup.restore',
  'customers.read', 'products.read', 'settings.read',
] as const;

export function isAllowedInRestrictedMode(capability: string): boolean {
  return (RESTRICTED_MODE_ALLOWED as readonly string[]).includes(capability);
}
