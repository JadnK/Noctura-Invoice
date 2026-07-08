import { useState } from 'react';
import { validateIban, formatIban, validateVatId, suggestTaxScheme } from '@noctura/domain';
import { SMTP_PRESETS, SMTP_PROBLEM_TEXT, validateSmtp } from '@noctura/mail';
import { previewNumbers } from '@noctura/invoice-core';

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
  const [smtp, setSmtp] = useState({ host: '', port: 587, security: 'starttls' as const, username: '', senderEmail: '' });

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
                onChange={(event) => {
                  const preset = SMTP_PRESETS.find((entry) => entry.id === event.target.value);
                  if (preset) setSmtp((current) => ({ ...current, host: preset.host, port: preset.port, security: preset.security }));
                }}
                className="rounded border border-border bg-input px-2 py-1.5 text-sm"
              >
                {SMTP_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm">Server</span>
                <input value={smtp.host} onChange={(event) => setSmtp({ ...smtp, host: event.target.value })}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">Port</span>
                <input type="number" value={smtp.port} onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) })}
                       className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
              </label>
            </div>

            {smtpProblems.map((problem) => (
              <p key={problem} className="text-sm" style={{ color: 'var(--n-warning)' }}>{SMTP_PROBLEM_TEXT[problem]}</p>
            ))}

            <p className="text-xs text-subtle">
              Das Passwort wird im Schlüsselbund des Betriebssystems abgelegt, nie in der Datenbank.
            </p>
            <button type="button" className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface">
              Verbindung testen
            </button>
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
