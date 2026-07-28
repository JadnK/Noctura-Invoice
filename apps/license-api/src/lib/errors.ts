/** Einheitliche Fehlerantworten. Nie Stacktraces, nie SQL, immer eine Fehler-ID. */
import { randomBytes } from 'node:crypto';

export const ERROR_MESSAGES: Record<string, string> = {
  LIC_NOT_FOUND: 'Lizenzschluessel nicht gefunden.',
  LIC_EXPIRED: 'Die Lizenz ist abgelaufen.',
  LIC_BLOCKED: 'Die Lizenz ist gesperrt.',
  LIC_ARCHIVED: 'Die Lizenz ist archiviert und kann nicht mehr verwendet werden.',
  LIC_DEVICE_LIMIT: 'Die maximale Geraeteanzahl ist erreicht.',
  LIC_DEVICE_DEACTIVATED: 'Dieses Geraet wurde deaktiviert.',
  LIC_CLOCK_SKEW: 'Der Zeitstempel der Anfrage ist unplausibel.',
  LIC_REPLAY: 'Die Anfrage wurde bereits verarbeitet.',
  LIC_NONCE_WEAK: 'Die Anfrage enthaelt keine gueltige Nonce.',
  LIC_SIGNATURE: 'Die Signatur konnte nicht geprueft werden.',
  AUTH_REQUIRED: 'Anmeldung erforderlich.',
  AUTH_INVALID: 'Zugangsdaten ungueltig oder abgelaufen.',
  AUTH_LOCKED: 'Zu viele Fehlversuche. Bitte spaeter erneut versuchen.',
  AUTH_ALREADY_REGISTERED: 'Fuer diese Lizenz gibt es bereits ein Firmenkonto. Bitten Sie Ihren Administrator um einen Zugang.',
  AUTH_EMAIL_TAKEN: 'Diese E-Mail-Adresse ist innerhalb der Lizenz bereits vergeben.',
  AUTH_LAST_ADMIN: 'Das letzte verbleibende Administratorkonto kann nicht entfernt werden.',
  RATE_LIMITED: 'Zu viele Anfragen.',
  VALIDATION: 'Die Anfrage ist unvollstaendig oder fehlerhaft.',
  INTERNAL: 'Unerwarteter Serverfehler.',
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly id: string;
  readonly detail?: Record<string, unknown>;

  constructor(code: string, status = 400, detail?: Record<string, unknown>) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.id = `err_${randomBytes(8).toString('hex')}`;
    this.detail = detail;
  }

  toResponse(): { error: { code: string; message: string; id: string; detail?: Record<string, unknown> } } {
    return { error: { code: this.code, message: this.message, id: this.id, ...(this.detail ? { detail: this.detail } : {}) } };
  }
}
