/** Vordefinierte SMTP-Anbieter. Werte aus der jeweiligen offiziellen Dokumentation. */

export interface SmtpPreset {
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly security: 'tls' | 'starttls';
  readonly hint?: string;
}

export const SMTP_PRESETS: readonly SmtpPreset[] = [
  { id: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls',
    hint: 'Benötigt ein App-Passwort; das normale Kontopasswort wird abgelehnt.' },
  { id: 'microsoft365', label: 'Microsoft 365', host: 'smtp.office365.com', port: 587, security: 'starttls',
    hint: 'SMTP-Auth muss im Tenant freigeschaltet sein.' },
  { id: 'outlook', label: 'Outlook.com', host: 'smtp-mail.outlook.com', port: 587, security: 'starttls' },
  { id: 'ionos', label: 'IONOS', host: 'smtp.ionos.de', port: 465, security: 'tls' },
  { id: 'strato', label: 'Strato', host: 'smtp.strato.de', port: 465, security: 'tls' },
  { id: 'hetzner', label: 'Hetzner', host: 'mail.your-server.de', port: 465, security: 'tls' },
  { id: 'mailbox', label: 'Mailbox.org', host: 'smtp.mailbox.org', port: 465, security: 'tls' },
  { id: 'custom', label: 'Benutzerdefiniert', host: '', port: 587, security: 'starttls' },
];

export function presetById(id: string): SmtpPreset | undefined {
  return SMTP_PRESETS.find((preset) => preset.id === id);
}

export type SmtpProblem = 'HOST' | 'PORT' | 'USERNAME' | 'SENDER' | 'SECURITY_PORT';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly security: 'tls' | 'starttls' | 'none';
  readonly username: string;
  readonly senderEmail: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSmtp(config: SmtpConfig): SmtpProblem[] {
  const problems: SmtpProblem[] = [];
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(config.host)) problems.push('HOST');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) problems.push('PORT');
  if (config.username.trim() === '') problems.push('USERNAME');
  if (!EMAIL.test(config.senderEmail)) problems.push('SENDER');
  // Port 465 spricht implizit TLS, 587 spricht STARTTLS. Die haeufigste
  // Fehlkonfiguration ueberhaupt, deshalb wird sie ausdruecklich gemeldet.
  if (config.port === 465 && config.security !== 'tls') problems.push('SECURITY_PORT');
  if (config.port === 587 && config.security === 'tls') problems.push('SECURITY_PORT');
  return problems;
}

export const SMTP_PROBLEM_TEXT: Record<SmtpProblem, string> = {
  HOST: 'Der Servername sieht nicht wie ein Hostname aus.',
  PORT: 'Der Port muss zwischen 1 und 65535 liegen.',
  USERNAME: 'Der Benutzername fehlt.',
  SENDER: 'Die Absenderadresse ist keine gültige E-Mail-Adresse.',
  SECURITY_PORT: 'Port und Verschlüsselung passen nicht zusammen: 465 nutzt TLS, 587 nutzt STARTTLS.',
};
