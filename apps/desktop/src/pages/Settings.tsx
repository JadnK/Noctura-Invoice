import { useEffect, useState } from 'react';
import { validateIban, formatIban, validateVatId, suggestTaxScheme } from '@noctura/domain';
import { SMTP_PRESETS, SMTP_PROBLEM_TEXT, validateSmtp } from '@noctura/mail';
import { previewNumbers } from '@noctura/invoice-core';
import { api } from '../lib/api';
import type { EmailSettings } from '../lib/api';
import { ApiError } from '../lib/api';

const TABS = [
  { id: 'company', label: 'Firmendaten' },
  { id: 'tax', label: 'Steuer' },
  { id: 'bank', label: 'Bankverbindung' },
  { id: 'numbering', label: 'Nummernkreise' },
  { id: 'email', label: 'E-Mail' },
  { id: 'general', label: 'Allgemein' },
  { id: 'backup', label: 'Sicherung' },
] as const;

const TAX_HINT =
  'Diese Einstellung wirkt sich unmittelbar auf Ihre Rechnungen aus. Bitte lassen Sie die Konfiguration von Ihrer Steuerberatung prüfen. Noctura Invoice leistet keine Steuerberatung.';

export function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('company');
  const [iban, setIban] = useState('');
  const [vatId, setVatId] = useState('');
  const [scheme, setScheme] = useState('standard');
  const [pattern, setPattern] = useState('RE-{YYYY}-{COUNTER}');
  const [smtp, setSmtp] = useState<{
    provider: string; host: string; port: number; security: 'tls' | 'starttls' | 'none';
    username: string; password: string; senderName: string; senderEmail: string;
    replyTo: string; bcc: string; hasPassword: boolean;
  }>({
    provider: 'custom', host: '', port: 587, security: 'starttls', username: '', password: '',
    senderName: '', senderEmail: '', replyTo: '', bcc: '', hasPassword: false,
  });
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    api.getEmailSettings()
      .then((saved) => {
        if (saved) {
          setSmtp({
            provider: saved.provider, host: saved.host, port: saved.port, security: saved.security,
            username: saved.username, password: '', senderName: saved.senderName,
            senderEmail: saved.senderEmail, replyTo: saved.replyTo ?? '', bcc: saved.bcc ?? '',
            hasPassword: saved.hasPassword,
          });
        }
        setEmailStatus('idle');
      })
      .catch(() => setEmailStatus('idle'));
  }, []);

  async function saveEmailSettings() {
    setEmailStatus('saving');
    setEmailError(null);
    try {
      const payload: EmailSettings = {
        provider: smtp.provider, host: smtp.host, port: smtp.port, security: smtp.security,
        username: smtp.username, senderName: smtp.senderName, senderEmail: smtp.senderEmail,
        replyTo: smtp.replyTo || undefined, bcc: smtp.bcc || undefined,
        hasPassword: smtp.hasPassword,
        ...(smtp.password ? { password: smtp.password } : {}),
      };
      await api.saveEmailSettings(payload);
      setSmtp((current) => ({ ...current, password: '', hasPassword: current.hasPassword || current.password !== '' }));
      setEmailStatus('saved');
      setTimeout(() => setEmailStatus('idle'), 2000);
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.info.title : 'Speichern fehlgeschlagen.');
      setEmailStatus('error');
    }
  }

  const ibanResult = iban ? validateIban(iban) : null;
  const vatResult = vatId ? validateVatId(vatId) : null;
  const smtpProblems = smtp.host ? validateSmtp(smtp) : [];
  const numberPreview = (() => {
    try {
      return previewNumbers(
        { docType: 'invoice', pattern, nextCounter: 1, padding: 5, resetMode: 'yearly' },
        new Date().toISOString(),
      );
    } catch (error) {
      return [(error as Error).message];
    }
  })();

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <nav aria-label="Einstellungsbereiche">
        <ul className="space-y-0.5">
          {TABS.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? 'page' : undefined}
                className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                  tab === entry.id ? 'bg-primary-soft' : 'text-muted hover:bg-surface hover:text-text'
                }`}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="max-w-2xl space-y-4">
        {tab === 'tax' && (
          <>
            <h1 className="text-lg font-semibold">Steuerliche Einstellungen</h1>
            <label className="block">
              <span className="mb-1 block text-sm">Besteuerung</span>
              <select
                value={scheme}
                onChange={(event) => setScheme(event.target.value)}
                className="rounded border border-border bg-input px-2 py-1.5 text-sm"
              >
                <option value="standard">Regelbesteuerung</option>
                <option value="small_business">Kleinunternehmerregelung nach § 19 UStG</option>
              </select>
            </label>

            {scheme === 'small_business' && (
              <div className="rounded border border-border bg-surface p-3 text-sm">
                <p>Auf Ihren Rechnungen wird keine Umsatzsteuer ausgewiesen. Der folgende Hinweis erscheint automatisch:</p>
                <p className="mt-2 rounded bg-canvas p-2 font-mono text-xs">
                  Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
                </p>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm">Umsatzsteuer-Identifikationsnummer</span>
              <input
                value={vatId}
                onChange={(event) => setVatId(event.target.value)}
                placeholder="DE123456789"
                className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
                aria-invalid={vatResult ? !vatResult.valid : undefined}
              />
            </label>
            {vatResult && !vatResult.valid && (
              <p className="text-sm" style={{ color: 'var(--n-warning)' }}>
                Die Form passt nicht zum Länderkürzel {vatResult.country}. Bitte prüfen.
              </p>
            )}
            {vatResult?.valid && !vatResult.known && (
              <p className="text-sm text-subtle">Für dieses Land liegt kein Prüfmuster vor; die Angabe wird ungeprüft übernommen.</p>
            )}

            <p className="rounded border border-border bg-surface p-3 text-xs text-muted">{TAX_HINT}</p>

            <p className="text-xs text-subtle">
              Vorschlag für einen Geschäftskunden in Österreich mit USt-IdNr.:{' '}
              {suggestTaxScheme({ sellerCountry: 'DE', buyerCountry: 'AT', buyerHasVatId: true, sellerIsSmallBusiness: scheme === 'small_business' }).reason}
            </p>
          </>
        )}

        {tab === 'bank' && (
          <>
            <h1 className="text-lg font-semibold">Bankverbindung</h1>
            <label className="block">
              <span className="mb-1 block text-sm">IBAN</span>
              <input
                value={iban}
                onChange={(event) => setIban(event.target.value)}
                placeholder="DE89 3704 0044 0532 0130 00"
                className="w-full rounded border border-border bg-input px-2 py-1.5 font-mono text-sm"
                aria-invalid={ibanResult ? !ibanResult.valid : undefined}
              />
            </label>
            {ibanResult && (
              <p className="text-sm" style={{ color: ibanResult.valid ? 'var(--n-success)' : 'var(--n-danger)' }}>
                {ibanResult.valid ? `Gültig: ${formatIban(iban)}` : 'Die Prüfziffer stimmt nicht. Bitte Eingabe kontrollieren.'}
              </p>
            )}
            <p className="text-xs text-subtle">
              Aus IBAN und Betrag entsteht der GiroCode auf der Rechnung — Kunden zahlen dann per Scan.
            </p>
          </>
        )}

        {tab === 'numbering' && (
          <>
            <h1 className="text-lg font-semibold">Rechnungsnummern</h1>
            <label className="block">
              <span className="mb-1 block text-sm">Muster</span>
              <input
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                className="w-full rounded border border-border bg-input px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <p className="text-xs text-subtle">
              Platzhalter: {'{YYYY} {YY} {MM} {DD} {COUNTER} {CUSTOMER} {TYPE}'}
            </p>
            <div className="rounded border border-border bg-surface p-3">
              <p className="mb-1 text-xs text-subtle">Nächste Nummern</p>
              <ul className="font-mono text-sm">
                {numberPreview.map((number) => <li key={number}>{number}</li>)}
              </ul>
            </div>
            <p className="text-xs text-subtle">
              Vergebene Nummern werden nie erneut ausgegeben. Entwürfe erhalten erst beim Finalisieren eine Nummer.
            </p>
          </>
        )}

        {tab === 'email' && (
          <>
            <h1 className="text-lg font-semibold">E-Mail-Versand</h1>
            <label className="block">
              <span className="mb-1 block text-sm">Anbieter</span>
              <select
                value={smtp.provider}
                onChange={(event) => {
                  const preset = SMTP_PRESETS.find((entry) => entry.id === event.target.value);
                  setSmtp((current) => ({
                    ...current,
                    provider: event.target.value,
                    ...(preset ? { host: preset.host, port: preset.port, security: preset.security } : {}),
                  }));
                }}
                className="rounded border border-border bg-input px-2 py-1.5 text-sm"
              >
                {SMTP_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
              {SMTP_PRESETS.find((p) => p.id === smtp.provider)?.hint && (
                <p className="mt-1 text-xs text-subtle">{SMTP_PRESETS.find((p) => p.id === smtp.provider)?.hint}</p>
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm">Server</span>
                <input value={smtp.host} onChange={(event) => setSmtp({ ...smtp, host: event.target.value })}
                       disabled={smtp.provider !== 'custom'}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Port</span>
                <input type="number" value={smtp.port} onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) })}
                       disabled={smtp.provider !== 'custom'}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm disabled:opacity-60" />
              </label>
            </div>

            {smtp.provider === 'custom' && (
              <label className="block">
                <span className="mb-1 block text-sm">Verschlüsselung</span>
                <select
                  value={smtp.security}
                  onChange={(event) => setSmtp({ ...smtp, security: event.target.value as typeof smtp.security })}
                  className="rounded border border-border bg-input px-2 py-1.5 text-sm"
                >
                  <option value="tls">TLS (Port 465)</option>
                  <option value="starttls">STARTTLS (Port 587)</option>
                  <option value="none">Keine (nur internes Relay im Firmennetz)</option>
                </select>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm">Benutzername</span>
                <input value={smtp.username} onChange={(event) => setSmtp({ ...smtp, username: event.target.value })}
                       autoComplete="off"
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">
                  Passwort {smtp.hasPassword && <span className="text-xs text-subtle">(gespeichert)</span>}
                </span>
                <input
                  type="password"
                  value={smtp.password}
                  onChange={(event) => setSmtp({ ...smtp, password: event.target.value })}
                  placeholder={smtp.hasPassword ? '•••••••• (unverändert lassen)' : ''}
                  autoComplete="new-password"
                  className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm">Absendername</span>
                <input value={smtp.senderName} onChange={(event) => setSmtp({ ...smtp, senderName: event.target.value })}
                       placeholder="Musterfirma GmbH"
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Absenderadresse</span>
                <input type="email" value={smtp.senderEmail} onChange={(event) => setSmtp({ ...smtp, senderEmail: event.target.value })}
                       placeholder="rechnungen@musterfirma.de"
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm">Antwortadresse <span className="text-subtle">(optional)</span></span>
                <input type="email" value={smtp.replyTo} onChange={(event) => setSmtp({ ...smtp, replyTo: event.target.value })}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">BCC-Adresse <span className="text-subtle">(optional)</span></span>
                <input type="email" value={smtp.bcc} onChange={(event) => setSmtp({ ...smtp, bcc: event.target.value })}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
            </div>

            {smtpProblems.map((problem) => (
              <p key={problem} className="text-sm" style={{ color: 'var(--n-warning)' }}>{SMTP_PROBLEM_TEXT[problem]}</p>
            ))}
            {emailError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--n-danger)' }}>{emailError}</p>
            )}

            <p className="text-xs text-subtle">
              Das Passwort wird auf diesem Gerät verschlüsselt abgelegt, nicht im Klartext. Es verlässt
              das Gerät nur beim tatsächlichen Versand über den eingestellten Server.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={emailStatus === 'saving'}
                onClick={() => void saveEmailSettings()}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {emailStatus === 'saving' ? 'Wird gespeichert…' : 'Speichern'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void api.testEmailConnection(smtp.host, smtp.port, smtp.security, smtp.username, smtp.password || undefined)
                    .then(() => { setEmailError(null); setEmailStatus('saved'); setTimeout(() => setEmailStatus('idle'), 2000); })
                    .catch((err) => setEmailError(err instanceof ApiError ? err.info.title : 'Verbindung fehlgeschlagen.'));
                }}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface"
              >
                Verbindung testen
              </button>
              {emailStatus === 'saved' && (
                <span className="text-sm" style={{ color: 'var(--n-success)' }}>Erfolgreich.</span>
              )}
            </div>
          </>
        )}

        {tab !== 'tax' && tab !== 'bank' && tab !== 'numbering' && tab !== 'email' && (
          <>
            <h1 className="text-lg font-semibold">{TABS.find((entry) => entry.id === tab)?.label}</h1>
            <p className="text-sm text-muted">
              Die Felder dieses Bereichs stehen in <code>docs/data-model.md</code> und werden aus dem
              Firmenprofil geladen.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
