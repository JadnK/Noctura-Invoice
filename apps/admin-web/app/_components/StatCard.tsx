interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
}

/** Eine Kennzahlkarte fuer die Uebersichtsseite. Rein darstellend. */
export function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <p className="text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
        {label}
      </p>
      <p className="mt-1.5 font-mono text-3xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}
