import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CompanySession } from '../lib/api';
import { ApiError } from '../lib/api';

type GateState =
  | { step: 'loading' }
  | { step: 'license' }
  | { step: 'account'; licenseKey: string }
  | { step: 'ready'; session: CompanySession };
/**
 * Sperrbildschirm vor der eigentlichen Anwendung.
 *
 * Zwei Voraussetzungen, in dieser Reihenfolge: eine aktivierte Lizenz, dann
 * ein angemeldetes Firmenkonto. Der Lizenzschlüssel wird dabei genau einmal
 * abgefragt — bei der Aktivierung. Für Anmeldung und auch für die
 * Firmenregistrierung merkt sich das Gerät den Schlüssel selbst (siehe
 * stored_license_key in commands/license.rs): niemand soll ihn bei jeder
 * Anmeldung erneut abtippen müssen, nur weil die Sitzung abgelaufen ist.
 *
 * Bewusst getrennt vom späteren eingeschränkten Modus (siehe
 * packages/license-client): dieser Bildschirm ist die erstmalige Hürde vor
 * jeglicher Nutzung, nicht die spätere Kulanz bei abgelaufener
 * Online-Prüfung. Einmal durchlaufen, greift danach die gewohnte
 * Offline-Toleranz.
 */
export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ step: 'loading' });
  async function check() {
    const [license, session, storedKey] = await Promise.all([
      api.licenseStatus().catch(() => null),
      api.companySessionStatus().catch(() => null),
      api.storedLicenseKey().catch(() => null),
    ]);

    if (!license || license.status === 'none' || license.status === 'unlicensed' || !storedKey) {
      setState({ step: 'license' });
      return;
    }
    if (session) {
      setState({ step: 'ready', session });
      return;
    }
    setState({ step: 'account', licenseKey: storedKey });
  }

  useEffect(() => { void check(); }, []);
  if (state.step === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-canvas text-subtle">
        <p className="text-sm">Wird geprüft…</p>
      </div>
    );
  }

  if (state.step === 'license') {
    return <LicenseActivationScreen onActivated={() => void check()} />;
  }

  if (state.step === 'account') {
    return (
      <AccountScreen
        licenseKey={state.licenseKey}
        onReady={(session) => setState({ step: 'ready', session })}
      />
    );
  }

  return <>{children}</>;
}
function LicenseActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.activateLicense(key.trim());
      if (result.status !== 'valid') {
        setError('Die Lizenz konnte nicht bestätigt werden.');
        return;
      }
      onActivated();
    } catch (err) {
      setError(err instanceof ApiError ? err.info.title : 'Lizenzserver nicht erreichbar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-elev2">
        <h1 className="text-lg font-semibold tracking-tight">Noctura Invoice</h1>
        <p className="mt-1 text-sm text-muted">
          Bitte den Lizenzschlüssel eingeben, um die Anwendung auf diesem Gerät einzurichten.
        </p>
        <p className="mt-1 text-xs text-subtle">
          Nur einmalig nötig — danach merkt sich das Gerät den Schlüssel für Anmeldungen.
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm">Lizenzschlüssel</span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && key.trim().length >= 10) void activate(); }}
            placeholder="NOCT-XXXXX-XXXXX-XXXXX-XXXXX"
            autoFocus
            className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--n-danger)' }}>{error}</p>
        )}

        <button
          type="button"
          disabled={busy || key.trim().length < 10}
          onClick={() => void activate()}
          className="mt-4 w-full rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Wird geprüft…' : 'Lizenz aktivieren'}
        </button>
      </div>
    </div>
  );
}
/**
 * Anmeldung und Firmeneinrichtung. Der Lizenzschlüssel selbst kommt hier
 * nirgends mehr in ein Eingabefeld — er wurde bereits bei der Aktivierung
 * abgefragt und wird im Hintergrund automatisch mitgeschickt. Der normale,
 * taegliche Anmeldevorgang braucht nur E-Mail und Passwort.
 */
function AccountScreen({
  licenseKey,
  onReady,
}: {
  licenseKey: string;
  onReady: (session: CompanySession) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim() !== '' && password.length >= 10
    && (mode === 'login' || displayName.trim() !== '');
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = mode === 'login'
        ? await api.loginCompanyAccount(licenseKey, email, password)
        : await api.registerCompanyAccount(licenseKey, email, password, displayName);
      onReady(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.info.title : 'Lizenzserver nicht erreichbar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-elev2">
        <h1 className="text-lg font-semibold tracking-tight">
          {mode === 'login' ? 'Anmelden' : 'Firma einrichten'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === 'login'
            ? 'Mit Ihrem persönlichen Konto anmelden.'
            : 'Das erste Konto dieser Lizenz wird automatisch zum Administrator.'}
        </p>
        <div className="mt-4 space-y-3">
          {mode === 'register' && (
            <label className="block">
              <span className="mb-1 block text-sm">Name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)}
                     placeholder="Vor- und Nachname"
                     className="w-full rounded border border-border bg-input px-3 py-2 text-sm" />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-sm">E-Mail-Adresse</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                   autoFocus
                   className="w-full rounded border border-border bg-input px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Passwort</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                   placeholder={mode === 'register' ? 'mindestens 10 Zeichen' : undefined}
                   onKeyDown={(event) => { if (event.key === 'Enter' && canSubmit) void submit(); }}
                   className="w-full rounded border border-border bg-input px-3 py-2 text-sm" />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--n-danger)' }}>{error}</p>}

        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => void submit()}
          className="mt-4 w-full rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Wird geprüft…' : mode === 'login' ? 'Anmelden' : 'Firma einrichten'}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="mt-3 w-full text-center text-sm text-subtle hover:text-text"
        >
          {mode === 'login' ? 'Noch kein Konto? Erste Einrichtung starten' : 'Bereits ein Konto vorhanden? Anmelden'}
        </button>
      </div>
    </div>
  );
}
