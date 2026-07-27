/**
 * Regeln fuer Firmenkonten innerhalb einer Lizenz.
 *
 * Eine Lizenz gehoert einer Firma. Der erste Nutzer, der sich fuer diese
 * Lizenz registriert, wird automatisch zum Firmen-Admin - es gibt keinen
 * separaten Einladungsschritt fuer das allererste Konto, sonst kaeme niemand
 * hinein. Jedes weitere Konto legt nur ein bereits bestehender Admin
 * derselben Lizenz an; offene Selbstregistrierung fuer Konto zwei und
 * folgende gaebe es sonst keine Kontrolle darueber, wer Zugriff auf die
 * Firma einer fremden Lizenz bekommt.
 */

export type LicenseUserRole = 'admin' | 'member';

export interface ExistingUserSummary {
  readonly id: string;
  readonly role: LicenseUserRole;
  readonly active: boolean;
}

export type RegisterDecision =
  | { readonly ok: true; readonly role: 'admin' }
  | { readonly ok: false; readonly code: 'LICENSE_NOT_ACTIVE' | 'ALREADY_HAS_USERS' };

/**
 * Entscheidet, ob eine offene Registrierung (ohne Einladung) erlaubt ist.
 * Nur der allererste Nutzer einer Lizenz darf sich selbst registrieren.
 */
export function decideRegistration(
  licenseStatus: string,
  existingUserCount: number,
): RegisterDecision {
  if (licenseStatus !== 'active' && licenseStatus !== 'trial') {
    return { ok: false, code: 'LICENSE_NOT_ACTIVE' };
  }
  if (existingUserCount > 0) {
    return { ok: false, code: 'ALREADY_HAS_USERS' };
  }
  return { ok: true, role: 'admin' };
}

export type CreateUserDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'NOT_ADMIN' | 'EMAIL_TAKEN' | 'LICENSE_MISMATCH' };

/** Nur ein aktiver Admin derselben Lizenz darf weitere Konten anlegen. */
export function decideCreateUser(
  caller: ExistingUserSummary & { readonly licenseId: string },
  targetLicenseId: string,
  emailAlreadyExists: boolean,
): CreateUserDecision {
  if (caller.licenseId !== targetLicenseId) {
    return { ok: false, code: 'LICENSE_MISMATCH' };
  }
  if (caller.role !== 'admin' || !caller.active) {
    return { ok: false, code: 'NOT_ADMIN' };
  }
  if (emailAlreadyExists) {
    return { ok: false, code: 'EMAIL_TAKEN' };
  }
  return { ok: true };
}

export type DeleteUserDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'NOT_ADMIN' | 'LAST_ADMIN' | 'LICENSE_MISMATCH' };

/**
 * Ein Admin darf jedes Konto seiner Lizenz entfernen, auch sich selbst -
 * ausser es ist der letzte verbliebene Admin. Sonst haette eine Firma keinen
 * Weg mehr, neue Konten anzulegen oder Zugaenge zu sperren.
 */
export function decideDeleteUser(
  caller: ExistingUserSummary & { readonly licenseId: string },
  target: ExistingUserSummary & { readonly licenseId: string },
  remainingActiveAdminsExcludingTarget: number,
): DeleteUserDecision {
  if (caller.licenseId !== target.licenseId) {
    return { ok: false, code: 'LICENSE_MISMATCH' };
  }
  if (caller.role !== 'admin' || !caller.active) {
    return { ok: false, code: 'NOT_ADMIN' };
  }
  if (target.role === 'admin' && target.active && remainingActiveAdminsExcludingTarget === 0) {
    return { ok: false, code: 'LAST_ADMIN' };
  }
  return { ok: true };
}

/** E-Mail-Adressen werden getrimmt und klein geschrieben verglichen. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
