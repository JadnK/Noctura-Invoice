'use client';

import { useState } from 'react';

/**
 * Login. Der Access-Token wird nur gesendet, nie gespeichert: die Antwort
 * setzt ein HttpOnly-Cookie, das der Browser selbst verwaltet. Kein
 * localStorage, kein Token in der URL.
 */
export default function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Anmeldung fehlgeschlagen.');
        return;
      }
      const body = await response.json();
      sessionStorage.setItem('csrf', body.csrfToken); // nur der CSRF-Wert, nicht der Token
      window.location.href = '/licenses';
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="text-xl font-semibold tracking-tight">Noctura Lizenzverwaltung</h1>
      <p className="mt-1 text-sm text-muted">
        Access-Token eingeben. Er steht im Startlog des Containers und in
        <code className="mx-1 rounded bg-surface px-1">/data/secrets/admin-access-token</code>.
      </p>

      <label htmlFor="token" className="mt-6 text-sm">Access-Token</label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
        className="mt-1 rounded border border-border bg-input px-3 py-2 font-mono text-sm"
      />

      {error && (
        <p role="alert" className="mt-3 rounded border border-border bg-surface p-2 text-sm" style={{ color: 'var(--n-danger)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || token.length < 20}
        onClick={() => void submit()}
        className="mt-4 rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40"
      >
        {busy ? 'Wird geprüft…' : 'Anmelden'}
      </button>
    </main>
  );
}
