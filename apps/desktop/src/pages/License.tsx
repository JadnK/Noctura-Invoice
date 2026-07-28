import { useEffect, useState } from 'react';
import { evaluateLicense } from '@noctura/license-client';
import type { LicenseCache } from '@noctura/license-client';
import { api } from '../lib/api';
import type { CompanySession, CompanyUserSummary } from '../lib/api';
import { ApiError } from '../lib/api';
import { Loading } from './pageUtils';

const MODE_COLOR: Record<string, string> = {
  active: 'var(--n-success)',
  warning: 'var(--n-warning)',
  restricted: 'var(--n-danger)',
  unlicensed: 'var(--n-text-subtle)',
};

/**
 * Lizenzseite. Zeigt Zustand, Restlaufzeit, Offline-Toleranz und - neu -
 * das Firmenkonto und dessen Team. Sagt immer dazu, was trotz Einschränkung
 * noch möglich ist — niemand soll fürchten müssen, nicht mehr an seine
 * Belege zu kommen.
 */
export function License() {
  const [cache, setCache] = useState<LicenseCache | null>(null);
  const [session, setSession] = useState<CompanySession | null>(null);
  const [users, setUsers] = useState<CompanyUserSummary[] | null>(null);

  async function load() {
    const [license, companySession] = await Promise.all([
      api.licenseStatus().catch(() => null),
      api.companySessionStatus().catch(() => null),
    ]);
    if (license) {
      setCache({
        status: license.status === 'valid' ? 'valid' : license.status === 'expired' ? 'expired' : license.status === 'blocked' ? 'blocked' : 'none',
        plan: license.plan ?? undefined,
        features: license.features,
        expiresAt: license.expiresAt,
        lastOnlineAt: license.lastOnlineAt ?? undefined,
        graceDays: license.graceDays,
        checkIntervalH: license.checkIntervalH,
        blockedReason: license.blockedReason ?? undefined,
      });
    }
    setSession(companySession);
    if (companySession) {
      api.listCompanyUsers().then(setUsers).catch(() => setUsers(null));
    }
  }

  useEffect(() => { void load(); }, []);

  if (!cache) return <Loading />;

  const view = evaluateLicense(cache, new Date().toISOString());

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Lizenz</h1>

      <section className="n-state-rail rounded-lg border border-border bg-surface p-4"
               style={{ ['--rail' as string]: MODE_COLOR[view.mode] }}>
        <p className="font-medium">{view.headline}</p>
        <p className="mt-1 text-sm text-muted">{view.detail}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {view.daysUntilExpiry !== null && (
            <>
              <dt className="text-subtle">Restlaufzeit</dt>
              <dd>{view.daysUntilExpiry} Tage</dd>
            </>
          )}
          {view.offlineDaysLeft !== null && (
            <>
              <dt className="text-subtle">Offline nutzbar noch</dt>
              <dd>{view.offlineDaysLeft} Tage</dd>
            </>
          )}
        </dl>
      </section>

      {(view.mode === 'restricted' || view.mode === 'unlicensed') && (
        <section className="rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">Was weiterhin möglich bleibt</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
            <li>Rechnungen ansehen, suchen und filtern</li>
            <li>PDFs erneut erzeugen, drucken und exportieren</li>
            <li>Zahlungen erfassen</li>
            <li>Sicherungen erstellen und wiederherstellen</li>
          </ul>
        </section>
      )}

      {session && (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{session.displayName}</p>
              <p className="text-sm text-muted">{session.email} · {session.role === 'admin' ? 'Administrator' : 'Mitglied'}</p>
            </div>
            <button
              type="button"
              onClick={() => { void api.logoutCompanyAccount().then(() => window.location.reload()); }}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-raised"
            >
              Abmelden
            </button>
          </div>
        </section>
      )}

      {session?.role === 'admin' && (
        <TeamSection users={users} onCreated={() => api.listCompanyUsers().then(setUsers).catch(() => {})} />
      )}
    </div>
  );
}

function TeamSection({ users, onCreated }: { users: CompanyUserSummary[] | null; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.createCompanyUser(email, password, displayName, role);
      setEmail(''); setPassword(''); setDisplayName(''); setRole('member'); setShowForm(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.info.title : 'Fehler beim Anlegen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Team</h2>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="text-sm" style={{ color: 'var(--n-primary)' }}>
          {showForm ? 'Abbrechen' : 'Mitarbeiter einladen'}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-surface p-3">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name"
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail"
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Startpasswort (mind. 10 Zeichen)"
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
                  className="rounded border border-border bg-input px-2 py-1.5 text-sm">
            <option value="member">Mitglied</option>
            <option value="admin">Administrator</option>
          </select>
          {error && <p role="alert" className="text-sm" style={{ color: 'var(--n-danger)' }}>{error}</p>}
          <button type="button" disabled={busy} onClick={() => void create()}
                  className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {busy ? 'Wird angelegt…' : 'Konto anlegen'}
          </button>
        </div>
      )}

      {users === null ? (
        <Loading />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2">Name</th>
              <th scope="col" className="border-b border-border py-2">E-Mail</th>
              <th scope="col" className="border-b border-border py-2">Rolle</th>
              <th scope="col" className="border-b border-border py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="border-b border-divider py-1.5">{user.displayName}</td>
                <td className="border-b border-divider text-muted">{user.email}</td>
                <td className="border-b border-divider">{user.role === 'admin' ? 'Administrator' : 'Mitglied'}</td>
                <td className="border-b border-divider">{user.active ? 'aktiv' : 'deaktiviert'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
