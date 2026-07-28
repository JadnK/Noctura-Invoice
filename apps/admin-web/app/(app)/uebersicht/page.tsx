import { headers } from 'next/headers';
import { StatCard } from '../../_components/StatCard';

interface Stats {
  total: number;
  active: number;
  expired: number;
  blocked: number;
  trial: number;
  devices: number;
}

async function loadStats(): Promise<Stats | null> {
  const response = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/admin/stats`, {
    headers: { cookie: headers().get('cookie') ?? '' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json();
}

export default async function OverviewPage() {
  const stats = await loadStats();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>
        <p className="mt-1 text-sm text-muted">Kennzahlen über alle Lizenzen und aktiven Geräte.</p>
      </div>

      {!stats ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-medium" style={{ color: 'var(--n-danger)' }}>Kennzahlen konnten nicht geladen werden.</p>
          <p className="mt-1 text-sm text-muted">Bitte erneut anmelden oder es später erneut versuchen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Lizenzen gesamt" value={stats.total} />
          <StatCard label="Aktiv" value={stats.active} accent="var(--n-success)" />
          <StatCard label="Testphase" value={stats.trial} accent="var(--n-info)" />
          <StatCard label="Abgelaufen" value={stats.expired} accent="var(--n-warning)" />
          <StatCard label="Gesperrt" value={stats.blocked} accent="var(--n-danger)" />
          <StatCard label="Aktive Geräte" value={stats.devices} />
        </div>
      )}
    </main>
  );
}
