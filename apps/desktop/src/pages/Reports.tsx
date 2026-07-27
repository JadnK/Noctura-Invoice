import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Amount } from '../components/Amount';
import { api } from '../lib/api';
import type { ApiError, ReportData } from '../lib/api';
import { EmptyState, Field, Loading, PageError, buttonPrimary, inputClass, toApiError } from './pageUtils';

function yearStart() { return `${new Date().getFullYear()}-01-01`; }
function today() { return new Date().toISOString().slice(0, 10); }

export function Reports() {
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.reports(from, to)); }
    catch (err) { setError(toApiError(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold tracking-tight">Auswertungen</h1><p className="mt-1 text-sm text-muted">Alle Kennzahlen werden direkt aus finalisierten Belegen in der lokalen SQLite-Datenbank berechnet.</p></div>
    <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <div className="w-44"><Field label="Von"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></Field></div>
      <div className="w-44"><Field label="Bis"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></Field></div>
      <button type="button" onClick={() => void load()} disabled={loading || from > to} className={buttonPrimary}>Auswertung aktualisieren</button>
    </section>
    {error && <PageError error={error} retry={() => void load()} />}
    {loading && <Loading label="Auswertung wird berechnet…" />}
    {!loading && data && data.invoiceCount === 0 && data.monthly.length === 0 && <EmptyState title="Keine Belegaktivität im Zeitraum">Ändern Sie den Zeitraum oder finalisieren Sie zunächst einen Beleg.</EmptyState>}
    {!loading && data && (data.invoiceCount > 0 || data.monthly.length > 0) && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Bruttoumsatz"><Amount cents={data.revenueGrossCents} /></Metric>
        <Metric label="Nettoumsatz"><Amount cents={data.revenueNetCents} /></Metric>
        <Metric label="Umsatzsteuer"><Amount cents={data.taxCents} /></Metric>
        <Metric label="Offene Forderungen"><Amount cents={data.outstandingCents} /></Metric>
        <Metric label="Rechnungen">{data.invoiceCount.toLocaleString('de-DE')}</Metric>
        <Metric label="Ø Rechnung"><Amount cents={data.averageInvoiceCents} /></Metric>
        <Metric label="Erfasste Zahlungen"><Amount cents={data.paidCents} /></Metric>
        <Metric label="Zeitraum">{data.from} – {data.to}</Metric>
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <ReportTable title="Monatliche Entwicklung" headers={['Monat', 'Rechnungen', 'Netto', 'Brutto']} rows={data.monthly.map((row) => [row.month, row.invoiceCount.toLocaleString('de-DE'), <Amount cents={row.netCents} />, <Amount cents={row.grossCents} />])} />
        <ReportTable title="Umsatzsteuer nach Satz" headers={['Steuersatz', 'Bemessungsgrundlage', 'Steuer']} rows={data.vat.map((row) => [`${(row.taxRateBp / 100).toLocaleString('de-DE')} %`, <Amount cents={row.netCents} />, <Amount cents={row.taxCents} />])} />
        <ReportTable title="Umsatzstärkste Kunden" headers={['Kunde', 'Rechnungen', 'Brutto']} rows={data.topCustomers.map((row) => [row.customerName, row.invoiceCount.toLocaleString('de-DE'), <Amount cents={row.grossCents} />])} />
        <ReportTable title="Rechnungsstatus" headers={['Status', 'Anzahl', 'Brutto']} rows={data.statuses.map((row) => [row.status, row.count.toLocaleString('de-DE'), <Amount cents={row.grossCents} />])} />
      </section>
    </>}
  </div>;
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface p-4 shadow-elev1"><div className="text-xs uppercase text-subtle">{label}</div><div className="mt-2 text-lg font-semibold">{children}</div></div>;
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4 shadow-elev1"><h2 className="mb-3 font-semibold">{title}</h2><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-subtle">{headers.map((header, index) => <th key={header} className={`border-b border-border py-2 ${index > 0 ? 'text-right' : ''}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className={`border-b border-divider py-2 ${cellIndex > 0 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
