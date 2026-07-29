import { useEffect, useState } from 'react';
import { BusinessSettingsForm } from '../components/BusinessSettingsForm';
import { ApiError, api } from '../lib/api';
import type { BusinessSettings, EmailSettings } from '../lib/api';
import {
  Field,
  Loading,
  PageError,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  toApiError,
} from './pageUtils';

const TABS = [
  { id: 'company', label: 'Firmendaten' },
  { id: 'tax', label: 'Steuer' },
  { id: 'bank', label: 'Bankverbindung' },
  { id: 'numbering', label: 'Nummernkreise' },
  { id: 'email', label: 'E-Mail' },
  { id: 'backup', label: 'Sicherung' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const emptyEmail: EmailSettings & { password: string } = {
  provider: 'custom', host: '', port: 587, security: 'starttls', username: '', password: '',
  senderName: '', senderEmail: '', replyTo: '', bcc: '', hasPassword: false,
};

export function Settings() {
  const [tab, setTab] = useState<Tab>('company');
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [email, setEmail] = useState({ ...emptyEmail });
  const [backup, setBackup] = useState({ targetDir: '', password: '', restorePath: '', restorePassword: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [businessSettings, emailSettings] = await Promise.all([api.businessSettings(), api.getEmailSettings()]);
      setBusiness(businessSettings);
      if (emailSettings) setEmail({ ...emailSettings, password: '', replyTo: emailSettings.replyTo ?? '', bcc: emailSettings.bcc ?? '' });
    } catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function saveBusiness() {
    if (!business) return;
    if (!business.legalName.trim()) {
      setError(new ApiError('E_MISSING_FIELDS', 'Der Unternehmensname ist erforderlich.'));
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try { await api.saveBusinessSettings(business); setNotice('Einstellungen gespeichert.'); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function saveEmail() {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveEmailSettings({
        provider: email.provider, host: email.host, port: email.port, security: email.security,
        username: email.username, senderName: email.senderName, senderEmail: email.senderEmail,
        replyTo: email.replyTo || undefined, bcc: email.bcc || undefined, hasPassword: email.hasPassword,
        ...(email.password ? { password: email.password } : {}),
      });
      setEmail((current) => ({ ...current, password: '', hasPassword: current.hasPassword || Boolean(current.password) }));
      setNotice('E-Mail-Einstellungen gespeichert.');
    } catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function testEmail() {
    setBusy(true); setError(null); setNotice(null);
    try { await api.testEmailConnection(email.host, email.port, email.security, email.username, email.password || undefined); setNotice('SMTP-Verbindung erfolgreich.'); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function createBackup() {
    if (!backup.targetDir.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.createBackup(backup.targetDir.trim(), backup.password || undefined);
      setNotice(`Sicherung erstellt: ${result.path} (${(result.sizeBytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 2 })} MB)`);
    } catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  async function restoreBackup() {
    if (!backup.restorePath.trim() || !window.confirm('Die aktuelle lokale Datenbank wird durch die Sicherung ersetzt. Fortfahren?')) return;
    setBusy(true); setError(null); setNotice(null);
    try { const result = await api.restoreBackup(backup.restorePath.trim(), backup.restorePassword || undefined); setNotice(result); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  if (!business && !error) return <Loading />;

  return <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
    <nav aria-label="Einstellungsbereiche"><ul className="space-y-1">{TABS.map((entry) => <li key={entry.id}><button type="button" onClick={() => { setTab(entry.id); setError(null); setNotice(null); }} aria-current={tab === entry.id ? 'page' : undefined} className={`w-full rounded px-3 py-2 text-left text-sm ${tab === entry.id ? 'bg-primary-soft font-medium' : 'text-muted hover:bg-surface hover:text-text'}`}>{entry.label}</button></li>)}</ul></nav>
    <section className="max-w-4xl space-y-4">
      <div><h1 className="text-xl font-semibold tracking-tight">Einstellungen</h1><p className="mt-1 text-sm text-muted">Alle Änderungen werden lokal und dauerhaft gespeichert.</p></div>
      {error && <PageError error={error} retry={() => void load()} />}
      {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}
      {business && ['company', 'tax', 'bank', 'numbering'].includes(tab) && <div className="rounded-lg border border-border bg-surface p-5 shadow-elev1"><BusinessSettingsForm value={business} onChange={setBusiness} sections={[tab as 'company' | 'tax' | 'bank' | 'numbering']} /><div className="mt-6 flex justify-end"><button type="button" disabled={busy} onClick={() => void saveBusiness()} className={buttonPrimary}>Speichern</button></div></div>}
      {tab === 'email' && <div className="space-y-5 rounded-lg border border-border bg-surface p-5 shadow-elev1"><div><h2 className="font-semibold">SMTP-Versand</h2><p className="mt-1 text-sm text-muted">Das Passwort wird gerätegebunden verschlüsselt gespeichert und nie an die Oberfläche zurückgegeben.</p></div><div className="grid gap-4 md:grid-cols-2">
        <Field label="Anbieter"><select value={email.provider} onChange={(event) => setEmail({ ...email, provider: event.target.value })} className={inputClass}><option value="custom">Eigener SMTP-Server</option><option value="gmail">Gmail</option><option value="outlook">Microsoft 365 / Outlook</option><option value="ionos">IONOS</option><option value="strato">STRATO</option></select></Field>
        <Field label="Server" required><input value={email.host} onChange={(event) => setEmail({ ...email, host: event.target.value })} className={inputClass} /></Field>
        <Field label="Port" required><input type="number" value={email.port} onChange={(event) => setEmail({ ...email, port: Number(event.target.value) })} className={inputClass} /></Field>
        <Field label="Sicherheit"><select value={email.security} onChange={(event) => setEmail({ ...email, security: event.target.value as EmailSettings['security'] })} className={inputClass}><option value="starttls">STARTTLS</option><option value="tls">TLS</option><option value="none">Keine (nur internes Relay)</option></select></Field>
        <Field label="Benutzername" required><input value={email.username} onChange={(event) => setEmail({ ...email, username: event.target.value })} className={inputClass} /></Field>
        <Field label={email.hasPassword ? 'Neues Passwort (optional)' : 'Passwort'} required={!email.hasPassword}><input type="password" value={email.password} onChange={(event) => setEmail({ ...email, password: event.target.value })} className={inputClass} /></Field>
        <Field label="Absendername" required><input value={email.senderName} onChange={(event) => setEmail({ ...email, senderName: event.target.value })} className={inputClass} /></Field>
        <Field label="Absenderadresse" required><input type="email" value={email.senderEmail} onChange={(event) => setEmail({ ...email, senderEmail: event.target.value })} className={inputClass} /></Field>
        <Field label="Antwortadresse"><input type="email" value={email.replyTo ?? ''} onChange={(event) => setEmail({ ...email, replyTo: event.target.value })} className={inputClass} /></Field>
        <Field label="Verteiler (BCC, mehrere durch Komma getrennt)">
          <input type="email" multiple value={email.bcc ?? ''} onChange={(event) => setEmail({ ...email, bcc: event.target.value })} placeholder="buchhaltung@firma.de, chef@firma.de" className={inputClass} />
        </Field>
      </div><div className="flex justify-end gap-2"><button type="button" disabled={busy || !email.host || !email.username || (!email.password && !email.hasPassword)} onClick={() => void testEmail()} className={buttonSecondary}>Verbindung testen</button><button type="button" disabled={busy || !email.host || !email.senderEmail} onClick={() => void saveEmail()} className={buttonPrimary}>Speichern</button></div></div>}
      {tab === 'backup' && <div className="space-y-6"><section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-elev1"><div><h2 className="font-semibold">Sicherung erstellen</h2><p className="mt-1 text-sm text-muted">Geben Sie einen vorhandenen Zielordner an. Optional wird das Backup mit einem Passwort verschlüsselt.</p></div><Field label="Zielordner" required><input value={backup.targetDir} onChange={(event) => setBackup({ ...backup, targetDir: event.target.value })} placeholder="C:\\Users\\Name\\Documents\\Noctura-Backups" className={inputClass} /></Field><Field label="Passwort (optional)"><input type="password" value={backup.password} onChange={(event) => setBackup({ ...backup, password: event.target.value })} className={inputClass} /></Field><div className="flex justify-end"><button type="button" disabled={busy || !backup.targetDir.trim()} onClick={() => void createBackup()} className={buttonPrimary}>Sicherung erstellen</button></div></section>
        <section className="space-y-4 rounded-lg border border-danger bg-surface p-5 shadow-elev1"><div><h2 className="font-semibold">Sicherung wiederherstellen</h2><p className="mt-1 text-sm text-muted">Die aktuelle Datenbank wird ersetzt. Erstellen Sie vorher eine neue Sicherung.</p></div><Field label="Sicherungsdatei" required><input value={backup.restorePath} onChange={(event) => setBackup({ ...backup, restorePath: event.target.value })} placeholder="C:\\...\\noctura-backup.nib" className={inputClass} /></Field><Field label="Passwort (falls verschlüsselt)"><input type="password" value={backup.restorePassword} onChange={(event) => setBackup({ ...backup, restorePassword: event.target.value })} className={inputClass} /></Field><div className="flex justify-end"><button type="button" disabled={busy || !backup.restorePath.trim()} onClick={() => void restoreBackup()} className={buttonDanger}>Datenbank wiederherstellen</button></div></section>
      </div>}
    </section>
  </div>;
}
