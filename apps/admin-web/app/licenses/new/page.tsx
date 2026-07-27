'use client';

import { useState } from 'react';

const PLANS = [
  { value: 'trial', label: 'Testlizenz' },
  { value: 'monthly', label: 'Monatslizenz' },
  { value: 'yearly', label: 'Jahreslizenz' },
  { value: 'lifetime', label: 'Lebenslange Lizenz' },
  { value: 'internal', label: 'Interne Lizenz' },
  { value: 'developer', label: 'Entwicklerlizenz' },
] as const;

interface CreatedLicense {
  key: string;
  license: { id: string; keyPrefix: string; plan: string; maxDevices: number };
}

/**
 * Formular zum Anlegen einer Lizenz.
 *
 * Der Lizenzschlüssel wird vom Server genau einmal in der Antwort
 * zurückgegeben (siehe apps/license-api/src/routes/admin.ts) — danach
 * existiert nur noch der Hash. Diese Seite ist deshalb der einzige Ort,
 * an dem der Klartext-Schlüssel je sichtbar ist.
 */
export default function NewLicensePage() {
  const [plan, setPlan] = useState<(typeof PLANS)[number]['value']>('yearly');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxDevices, setMaxDevices] = useState('');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLicense | null>(null);
  const [copied, setCopied] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ownerEmail);
  const canSubmit = ownerName.trim().length > 0 && validEmail && (unlimited || expiresAt !== '') && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const csrfToken = sessionStorage.getItem('csrf') ?? '';
      const response = await fetch('/api/v1/admin/licenses', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          plan,
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim(),
          expiresAt: unlimited ? null : new Date(`${expiresAt}T00:00:00.000Z`).toISOString(),
          ...(maxDevices ? { maxDevices: Number(maxDevices) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Anmeldung abgelaufen oder Anfrage fehlerhaft. Bitte neu anmelden.');
        return;
      }
      setCreated(await response.json());
    } catch {
      setError('Der Lizenzserver ist nicht erreichbar.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold tracking-tight">Lizenz erstellt</h1>

        <div className="mt-4 rounded-lg border border-border bg-surface p-4" style={{ borderColor: 'var(--n-warning)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--n-warning)' }}>
            Dieser Schlüssel wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-canvas p-3 font-mono text-sm">{created.key}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(created.key);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded border border-border px-3 py-2 text-sm hover:bg-raised"
            >
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-subtle">Präfix</dt>
            <dd className="font-mono">{created.license.keyPrefix}…</dd>
            <dt className="text-subtle">Tarif</dt>
            <dd>{PLANS.find((p) => p.value === created.license.plan)?.label ?? created.license.plan}</dd>
            <dt className="text-subtle">Geräte</dt>
            <dd>{created.license.maxDevices}</dd>
          </dl>
        </div>

        <div className="mt-6 flex gap-2">
          <a href="/licenses" className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white">
            Zur Lizenzübersicht
          </a>
          <a href="/licenses/new" className="rounded border border-border px-3 py-1.5 text-sm">
            Weitere Lizenz erstellen
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Lizenz erstellen</h1>
        <a href="/licenses" className="text-sm text-subtle hover:text-text">Abbrechen</a>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm">Tarif</span>
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as typeof plan)}
            className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
          >
            {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Name des Lizenzinhabers</span>
          <input
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="Musterfirma GmbH"
            className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">E-Mail-Adresse</span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
            placeholder="buchhaltung@musterfirma.de"
            className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
            aria-invalid={ownerEmail !== '' && !validEmail}
          />
        </label>

        <div>
          <span className="mb-1 block text-sm">Ablaufdatum</span>
          <label className="mb-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />
            Unbefristet
          </label>
          {!unlimited && (
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
            />
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm">Maximale Geräteanzahl <span className="text-subtle">(optional, sonst Tarifvorgabe)</span></span>
          <input
            type="number"
            min={1}
            max={50}
            value={maxDevices}
            onChange={(event) => setMaxDevices(event.target.value)}
            placeholder="z. B. 3"
            className="w-32 rounded border border-border bg-input px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Interne Notiz <span className="text-subtle">(optional, für den Kunden nicht sichtbar)</span></span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="w-full rounded border border-border bg-input px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="rounded border border-border bg-surface p-2 text-sm" style={{ color: 'var(--n-danger)' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? 'Wird erstellt…' : 'Lizenz erstellen'}
        </button>
      </div>
    </main>
  );
}
