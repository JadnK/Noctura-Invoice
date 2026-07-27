'use client';

import { useEffect, useState } from 'react';

interface Device {
  id: string;
  deviceId: string;
  os: string;
  appVersion: string;
  lastSeenAt: string;
  deactivatedAt: string | null;
}

interface CompanyUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface LicenseDetail {
  id: string;
  keyPrefix: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  maxDevices: number;
  blockedReason: string | null;
  note: string | null;
  owner: { name: string; email: string };
  devices: Device[];
  users: CompanyUser[];
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--n-state-paid)',
  trial: 'var(--n-state-sent)',
  expired: 'var(--n-state-partially)',
  blocked: 'var(--n-state-overdue)',
  archived: 'var(--n-state-cancelled)',
};

function csrfHeader(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionStorage.getItem('csrf') ?? '' };
}

export default function LicenseDetailPage({ params }: { params: { id: string } }) {
  const [license, setLicense] = useState<LicenseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [newExpiry, setNewExpiry] = useState('');
  const [unlimited, setUnlimited] = useState(false);

  async function load() {
    const response = await fetch(`/api/v1/admin/licenses/${params.id}`, { credentials: 'same-origin' });
    if (!response.ok) {
      setError('Lizenz konnte nicht geladen werden.');
      return;
    }
    const body = await response.json();
    setLicense(body.license);
  }

  useEffect(() => { void load(); }, [params.id]);

  async function runAction(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/licenses/${params.id}${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeader(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        setError(errBody?.error?.message ?? 'Aktion fehlgeschlagen.');
        return;
      }
      await load();
      setShowBlockForm(false);
      setBlockReason('');
    } finally {
      setBusy(false);
    }
  }

  if (error && !license) {
    return <main className="p-6"><p role="alert" style={{ color: 'var(--n-danger)' }}>{error}</p></main>;
  }
  if (!license) {
    return <main className="p-6"><p className="text-subtle">Wird geladen…</p></main>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <a href="/licenses" className="text-sm text-subtle hover:text-text">← Lizenzen</a>
      </div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold">{license.keyPrefix}…</h1>
          <p className="text-sm text-muted">{license.owner.name} · {license.owner.email}</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm"
          style={{ background: 'var(--n-neutral-soft)', color: STATUS_COLOR[license.status] ?? undefined }}
        >
          {license.status}
        </span>
      </div>

      {error && <p role="alert" className="mb-4 rounded border border-border bg-surface p-2 text-sm" style={{ color: 'var(--n-danger)' }}>{error}</p>}

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 shadow-elev1">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-subtle">Tarif</dt><dd>{license.plan}</dd>
          <dt className="text-subtle">Läuft ab</dt><dd>{license.expiresAt ? license.expiresAt.slice(0, 10) : 'unbefristet'}</dd>
          <dt className="text-subtle">Geräte</dt><dd>{license.devices.filter((d) => !d.deactivatedAt).length} / {license.maxDevices}</dd>
          {license.blockedReason && (<><dt className="text-subtle">Sperrgrund</dt><dd>{license.blockedReason}</dd></>)}
          {license.note && (<><dt className="text-subtle">Notiz</dt><dd>{license.note}</dd></>)}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {license.status === 'blocked' ? (
            <button type="button" disabled={busy} onClick={() => void runAction('/unblock')}
                    className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
              Entsperren
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setShowBlockForm((v) => !v)}
                    className="rounded border border-border px-3 py-1.5 text-sm" style={{ color: 'var(--n-danger)' }}>
              Sperren
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void runAction('/reset-devices')}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-raised">
            Alle Geräte zurücksetzen
          </button>
        </div>

        {showBlockForm && (
          <div className="mt-3 flex gap-2">
            <input
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="Grund für die Sperrung"
              className="flex-1 rounded border border-border bg-input px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={busy || blockReason.trim().length < 3}
              onClick={() => void runAction('/block', { reason: blockReason.trim() })}
              className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--n-danger)' }}
            >
              Sperrung bestätigen
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium">Ablaufdatum ändern</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />
              Unbefristet
            </label>
            {!unlimited && (
              <input
                type="date"
                value={newExpiry}
                onChange={(event) => setNewExpiry(event.target.value)}
                className="rounded border border-border bg-input px-3 py-1.5 text-sm"
              />
            )}
            <button
              type="button"
              disabled={busy || (!unlimited && newExpiry === '')}
              onClick={() => void runAction('/extend', { expiresAt: unlimited ? null : new Date(`${newExpiry}T00:00:00.000Z`).toISOString() })}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-raised disabled:opacity-40"
            >
              Speichern
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Geräte</h2>
        {license.devices.length === 0 ? (
          <p className="text-sm text-subtle">Noch kein Gerät aktiviert.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-subtle">
                <th scope="col" className="border-b border-border py-2">Gerät</th>
                <th scope="col" className="border-b border-border py-2">System</th>
                <th scope="col" className="border-b border-border py-2">Version</th>
                <th scope="col" className="border-b border-border py-2">Zuletzt gesehen</th>
                <th scope="col" className="border-b border-border py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {license.devices.map((device) => (
                <tr key={device.id}>
                  <td className="border-b border-divider py-1.5 font-mono text-xs">{device.deviceId.slice(0, 12)}…</td>
                  <td className="border-b border-divider text-muted">{device.os}</td>
                  <td className="border-b border-divider text-muted">{device.appVersion}</td>
                  <td className="border-b border-divider text-muted">{device.lastSeenAt.slice(0, 10)}</td>
                  <td className="border-b border-divider">{device.deactivatedAt ? 'deaktiviert' : 'aktiv'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Firmenkonten</h2>
        {license.users.length === 0 ? (
          <p className="text-sm text-subtle">
            Noch kein Firmenkonto. Der erste Nutzer, der sich in der Desktop-App mit diesem
            Lizenzschlüssel registriert, wird automatisch zum Administrator dieser Firma.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-subtle">
                <th scope="col" className="border-b border-border py-2">Name</th>
                <th scope="col" className="border-b border-border py-2">E-Mail</th>
                <th scope="col" className="border-b border-border py-2">Rolle</th>
                <th scope="col" className="border-b border-border py-2">Status</th>
                <th scope="col" className="border-b border-border py-2">Letzte Anmeldung</th>
              </tr>
            </thead>
            <tbody>
              {license.users.map((user) => (
                <tr key={user.id}>
                  <td className="border-b border-divider py-1.5">{user.displayName}</td>
                  <td className="border-b border-divider text-muted">{user.email}</td>
                  <td className="border-b border-divider">{user.role === 'admin' ? 'Administrator' : 'Mitglied'}</td>
                  <td className="border-b border-divider">{user.active ? 'aktiv' : 'deaktiviert'}</td>
                  <td className="border-b border-divider text-muted">{user.lastLoginAt ? user.lastLoginAt.slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
