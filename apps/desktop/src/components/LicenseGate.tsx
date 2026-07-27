import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CompanySession, LicenseState } from '../lib/api';
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
 * ein angemeldetes Firmenkonto. Der erste Nutzer, der sich fuer eine Lizenz
 * registriert, wird automatisch zum Administrator dieser Firma (siehe
 * apps/license-api/src/lib/license-users.ts) - jede weitere Person meldet
 * sich mit einem vom Administrator angelegten Konto an.
 *
 * Bewusst anders als der spaetere eingeschraenkte Modus (siehe
 * packages/license-client): dieser Bildschirm ist die erstmalige Huerde vor
 * jeglicher Nutzung, nicht die spaetere Kulanz bei abgelaufener
 * Online-Pruefung. Einmal durchlaufen, greift danach die gewohnte
 * Offline-Toleranz.
 */
export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ step: 'loading' });

  useEffect(() => {
    void (async () => {
      const [license, session] = await Promise.all([
        api.licenseStatus().catch(() => null),
        api.companySessionStatus().catch(() => null),
      ]);

      if (!license || license.status === 'none') {
        setState({ step: 'license' });
        return;
      }
      if (session) {
        setState({ step: 'ready', session });
        return;
      }
      // Lizenz ist aktiviert, aber kein lokales Firmenkonto bekannt -
      // Schluessel wird fuer den Registrierungs-/Login-Schritt gebraucht,
      // die Rust-Seite haelt ihn nicht als Klartext vor.
      setState({ step: 'account', licenseKey: '' });
    })();
  }, []);

  if (state.step === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-canvas text-subtle">
        <p className="text-sm">Wird geprüft…</p>
      </div>
    );
  }

  if (state.step === 'license') {
    return (
      <LicenseActivationScreen
        onActivated={(licenseKey) => setState({ step: 'account', licenseKey })}
      />
    );
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

function LicenseActivationScreen({ onActivated }: { onActivated: (licenseKey: string) => void }) {
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
      onActivated(key.trim());
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
          Bitte den Lizenzschlüssel eingeben, um die Anwendung einzurichten.
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

function AccountScreen({ licenseKey, onReady }: { licenseKey: string; onReady: (session: CompanySession) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [key, setKey] = useState(licenseKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = key.trim().length >= 10 && email.trim() !== '' && password.length >= 10
    && (mode === 'login' || displayName.trim() !== '');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = mode === 'login'
        ? await api.loginCompanyAccount(key, email, password)
        : await api.registerCompanyAccount(key, email, password, displayName);
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
            : 'Das erste Konto einer Lizenz wird automatisch zum Administrator.'}
        </p>

        <div className="mt-4 space-y-3">
          {!licenseKey && (
            <label className="block">
              <span className="mb-1 block text-sm">Lizenzschlüssel</span>
              <input value={key} onChange={(event) => setKey(event.target.value)}
                     className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm" />
            </label>
          )}
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
                   className="w-full rounded border border-border bg-input px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Passwort</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                   placeholder="mindestens 10 Zeichen"
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
