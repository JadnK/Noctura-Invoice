import { Amount } from '../components/Amount';

/**
 * Dashboard. Vier Kennzahlen oben, darunter Verlauf und Listen. Die Zahlen
 * kommen aus einer einzigen Abfrage im Rust-Kern, damit die Seite auch mit
 * zehntausend Belegen sofort steht.
 */
export interface DashboardProps {
  revenueMonthCents: number;
  revenueYearCents: number;
  openCents: number;
  overdueCents: number;
  draftCount: number;
  activeCustomers: number;
  averagePaymentDays: number;
  revenueSeries: readonly { month: string; cents: number }[];
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

export function Dashboard(props: DashboardProps) {
  const max = Math.max(1, ...props.revenueSeries.map((entry) => entry.cents));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => props.onNavigate('invoice-new')}
                  className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
            Neue Rechnung
          </button>
          <button type="button" onClick={() => props.onNavigate('customer-new')}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface">
            Neuer Kunde
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Umsatz im Monat"><Amount cents={props.revenueMonthCents} /></Kpi>
        <Kpi label="Umsatz im Jahr"><Amount cents={props.revenueYearCents} /></Kpi>
        <Kpi label="Offene Forderungen"><Amount cents={props.openCents} /></Kpi>
        <Kpi
          label="Überfällig"
          hint={props.overdueCents > 0 ? 'Mahnvorschläge unter Rechnungen ansehen' : 'Nichts überfällig'}
        >
          <span style={{ color: props.overdueCents > 0 ? 'var(--n-danger)' : undefined }}>
            <Amount cents={props.overdueCents} />
          </span>
        </Kpi>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
        <h2 className="mb-4 text-sm font-medium">Umsatzverlauf</h2>
        {props.revenueSeries.length === 0 ? (
          <p className="py-8 text-center text-sm text-subtle">
            Noch keine bezahlten Rechnungen. Der Verlauf erscheint, sobald die erste Zahlung erfasst ist.
          </p>
        ) : (
          <ol className="flex h-40 items-end gap-2">
            {props.revenueSeries.map((entry) => (
              <li key={entry.month} className="flex flex-1 flex-col items-center gap-1">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Entwürfe">{props.draftCount}</Kpi>
        <Kpi label="Aktive Kunden">{props.activeCustomers}</Kpi>
        <Kpi label="Zahlungsdauer" hint="Durchschnitt der letzten zwölf Monate">
          {props.averagePaymentDays} Tage
        </Kpi>
      </div>
    </div>
  );
}
