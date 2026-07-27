import { useEffect, useState } from 'react';
import { Amount } from '../components/Amount';
import { api } from '../lib/api';
import type { DashboardData } from '../lib/api';
import { ApiError } from '../lib/api';
import { ErrorNotice } from '../components/ErrorNotice';

/**
 * Dashboard. Vier Kennzahlen oben, darunter Verlauf und Listen. Die Zahlen
 * kommen aus einer einzigen Abfrage im Rust-Kern (dashboard_data), damit die
 * Seite auch mit zehntausend Belegen sofort steht.
 */
export interface DashboardProps {
  onNavigate: (page: string) => void;
}

function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <p className="text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>{label}</p>
      <p className="mt-2 text-2xl">{children}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.dashboard());
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    }
  }

  useEffect(() => { void load(); }, []);

  const header = (
    <div className="flex items-baseline justify-between">
      <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>
      <div className="flex gap-2">
        <button type="button" onClick={() => onNavigate('invoice-new')}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
          Neue Rechnung
        </button>
        <button type="button" onClick={() => onNavigate('customers')}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface">
          Neuer Kunde
        </button>
      </div>
    </div>
  );

  if (error) {
    return <div className="space-y-6">{header}<ErrorNotice error={error} onRetry={() => void load()} /></div>;
  }
  if (!data) {
    return <div className="space-y-6">{header}<p className="text-sm text-subtle">Wird geladen…</p></div>;
  }

  const max = Math.max(1, ...data.revenueSeries.map((entry) => entry.cents));

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Umsatz im Monat"><Amount cents={data.revenueMonthCents} /></Kpi>
        <Kpi label="Umsatz im Jahr"><Amount cents={data.revenueYearCents} /></Kpi>
        <Kpi label="Offene Forderungen"><Amount cents={data.openCents} /></Kpi>
        <Kpi
          label="Überfällig"
          hint={data.overdueCents > 0 ? 'Mahnvorschläge unter Rechnungen ansehen' : 'Nichts überfällig'}
        >
          <span style={{ color: data.overdueCents > 0 ? 'var(--n-danger)' : undefined }}>
            <Amount cents={data.overdueCents} />
          </span>
        </Kpi>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
        <h2 className="mb-4 text-sm font-medium">Umsatzverlauf</h2>
        {data.revenueSeries.every((entry) => entry.cents === 0) ? (
          <p className="py-8 text-center text-sm text-subtle">
            Noch keine finalisierten Rechnungen. Der Verlauf erscheint, sobald die erste Rechnung abgeschlossen ist.
          </p>
        ) : (
          <ol className="flex h-40 items-end gap-2">
            {data.revenueSeries.map((entry, index) => (
              <li key={`${entry.month}-${index}`} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{ height: `${Math.round((entry.cents / max) * 100)}%`, background: 'var(--n-primary)', minHeight: 2 }}
                  title={`${entry.month}`}
                />
                <span className="text-xs text-subtle">{entry.month}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.topProducts.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <h2 className="mb-3 text-sm font-medium">Häufig verkauft</h2>
          <ul className="space-y-1 text-sm">
            {data.topProducts.map((product) => (
              <li key={product.name} className="flex justify-between">
                <span>{product.name}</span>
                <span className="text-muted">{(product.quantityMilli / 1000).toLocaleString('de-DE')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Entwürfe">{data.draftCount}</Kpi>
        <Kpi label="Aktive Kunden">{data.activeCustomers}</Kpi>
        <Kpi label="Zahlungsdauer" hint="Durchschnitt bezahlter Rechnungen">
          {data.averagePaymentDays} Tage
        </Kpi>
      </div>
    </div>
  );
}
