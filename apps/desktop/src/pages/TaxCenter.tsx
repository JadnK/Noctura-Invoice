import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { ApiError, api } from '../lib/api';
import type { Expense, ExpenseInput, TaxYearSummary } from '../lib/api';
import { EmptyState, Field, Loading, PageError, buttonPrimary, buttonSecondary, inputClass, toApiError } from './pageUtils';

const CATEGORIES = [
  'Bürobedarf', 'Software und Lizenzen', 'Telefon und Internet', 'Miete und Nebenkosten',
  'Fahrtkosten', 'Reisekosten', 'Bewirtung', 'Marketing', 'Versicherungen und Beiträge',
  'Fortbildung', 'Fremdleistungen', 'Bankgebühren', 'Werkzeuge und Ausstattung', 'Sonstiges',
];
const PAYMENT_METHODS = [
  ['bank', 'Überweisung / Bank'], ['card', 'Karte'], ['cash', 'Bar'], ['direct_debit', 'Lastschrift'], ['other', 'Sonstige'],
] as const;

type Tab = 'overview' | 'expenses' | 'export';
const currentYear = new Date().getFullYear();
function emptyExpense(year: number): ExpenseInput {
  const now = new Date();
  const expenseDate = year === now.getFullYear()
    ? `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : `${year}-01-01`;
  return {
    expenseDate,
    vendor: '', description: '', category: CATEGORIES[0] ?? 'Sonstiges', receiptNumber: '',
    netCents: 0, taxRateBp: 1900, inputTaxCents: 0, grossCents: 0,
    deductibleBp: 10000, paymentMethod: 'bank', receiptPath: '', notes: '',
  };
}
function cents(value: string) {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}
function amountInput(value: number) { return (value / 100).toFixed(2).replace('.', ','); }
function taxLabel(method: string) { return method === 'accrual' ? 'Soll-Versteuerung nach Rechnungsdatum' : 'Ist-Versteuerung nach Zahlungseingang'; }

export function TaxCenter() {
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<TaxYearSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [form, setForm] = useState<ExpenseInput>(() => emptyExpense(currentYear));
  const [netText, setNetText] = useState('0,00');
  const [targetDir, setTargetDir] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(selectedYear = year) {
    setLoading(true); setError(null);
    try {
      const [nextSummary, nextExpenses] = await Promise.all([api.taxYearSummary(selectedYear), api.expenses(selectedYear)]);
      setSummary(nextSummary); setExpenses(nextExpenses);
    } catch (err) { setError(toApiError(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function changeYear(next: number) {
    setYear(next); setForm(emptyExpense(next)); setNetText('0,00'); setNotice(null);
    await load(next);
  }

  const computed = useMemo(() => {
    const net = cents(netText);
    const inputTax = Math.round(net * form.taxRateBp / 10000);
    return { net, inputTax, gross: net + inputTax };
  }, [netText, form.taxRateBp]);

  function editExpense(row: Expense) {
    setForm({
      id: row.id, expenseDate: row.expenseDate, vendor: row.vendor, description: row.description,
      category: row.category, receiptNumber: row.receiptNumber ?? '', netCents: row.netCents,
      taxRateBp: row.taxRateBp, inputTaxCents: row.inputTaxCents, grossCents: row.grossCents,
      deductibleBp: row.deductibleBp, paymentMethod: row.paymentMethod,
      receiptPath: row.receiptPath ?? '', notes: row.notes ?? '',
    });
    setNetText(amountInput(row.netCents)); setTab('expenses'); setNotice(null);
  }
  function resetForm() { setForm(emptyExpense(year)); setNetText('0,00'); }
  async function saveExpense() {
    if (!form.vendor.trim() || !form.description.trim()) {
      setError(new ApiError('E_MISSING_FIELDS', 'Lieferant und Beschreibung sind erforderlich.'));
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveExpense({ ...form, netCents: computed.net, inputTaxCents: computed.inputTax, grossCents: computed.gross });
      resetForm(); await load(); setNotice('Betriebsausgabe gespeichert.');
    } catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }
  async function removeExpense(row: Expense) {
    if (!window.confirm(`Ausgabe „${row.description}“ löschen?`)) return;
    setBusy(true); setError(null);
    try { await api.deleteExpense(row.id); await load(); }
    catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }
  async function exportPackage() {
    if (!targetDir.trim()) {
      setError(new ApiError('E_MISSING_FIELDS', 'Bitte geben Sie einen vorhandenen Zielordner an.'));
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.exportTaxPackage(year, targetDir.trim());
      setNotice(result.warnings.length > 0
        ? `Steuerpaket erstellt: ${result.directory} · ${result.warnings.length} Belegwarnung(en) stehen in HINWEISE.txt.`
        : `Steuerpaket vollständig erstellt: ${result.directory}`);
    } catch (err) { setError(toApiError(err)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold tracking-tight">Steuerbereich</h1><p className="mt-1 max-w-3xl text-sm text-muted">Erfasst Betriebsausgaben und erstellt aus Zahlungseingängen, Belegen und offenen Posten ein Jahrespaket zur manuellen Übernahme in ELSTER oder für Ihre Steuerberatung.</p></div><label className="flex items-center gap-2 text-sm"><span className="text-muted">Steuerjahr</span><select value={year} onChange={(event) => void changeYear(Number(event.target.value))} className="rounded border border-border bg-input px-3 py-1.5">{Array.from({ length: 8 }, (_, index) => currentYear - index).map((entry) => <option key={entry}>{entry}</option>)}</select></label></div>
    <div className="rounded-lg border border-warning bg-surface px-4 py-3 text-sm"><strong>Arbeitshilfe, keine Steuerberatung:</strong> Noctura übermittelt nichts direkt an ELSTER. Prüfen Sie insbesondere Abschreibungen, Privatanteile, Bewirtung, Reisekosten, Reverse Charge und ausländische Sachverhalte fachlich.</div>
    <nav aria-label="Steuerbereiche" className="flex gap-1 border-b border-border">{([['overview', 'Jahresübersicht'], ['expenses', 'Betriebsausgaben'], ['export', 'Steuerpaket exportieren']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => { setTab(id); setError(null); setNotice(null); }} className={`border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-primary font-medium text-text' : 'border-transparent text-muted hover:text-text'}`}>{label}</button>)}</nav>
    {error && <PageError error={error} retry={() => void load()} />}
    {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}
    {loading && <Loading label="Steuerdaten werden berechnet…" />}
    {!loading && tab === 'overview' && summary && <Overview summary={summary} />}
    {!loading && tab === 'expenses' && <ExpensesPanel form={form} setForm={setForm} netText={netText} setNetText={setNetText} computed={computed} expenses={expenses ?? []} busy={busy} onSave={() => void saveExpense()} onReset={resetForm} onEdit={editExpense} onDelete={(row) => void removeExpense(row)} />}
    {!loading && tab === 'export' && summary && <ExportPanel year={year} summary={summary} targetDir={targetDir} setTargetDir={setTargetDir} busy={busy} onExport={() => void exportPackage()} />}
  </div>;
}

function Overview({ summary }: { summary: TaxYearSummary }) {
  const hasData = summary.cashReceiptsGrossCents !== 0 || summary.expenseGrossCents !== 0 || summary.invoicedNetCents !== 0;
  if (!hasData) return <EmptyState title="Noch keine steuerlichen Daten">Erfassen Sie Zahlungen zu Rechnungen und Betriebsausgaben. Die Übersicht aktualisiert sich automatisch.</EmptyState>;
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Zahlungseingänge"><Amount cents={summary.cashReceiptsGrossCents} /><small>Betriebseinnahmen nach Zufluss</small></Metric>
      <Metric label="Erfasste Ausgaben"><Amount cents={summary.expenseGrossCents} /><small>nach Zahlungs-/Belegdatum</small></Metric>
      <Metric label="Geschätzter Gewinn"><Amount cents={summary.estimatedProfitCents} /><small>Nettoeinnahmen minus abziehbare Nettoausgaben</small></Metric>
      <Metric label="USt.-Arbeitswert"><Amount cents={summary.vatPayableCents} /><small>{taxLabel(summary.taxationMethod)}</small></Metric>
      <Metric label="Einnahmen netto"><Amount cents={summary.cashReceiptsNetCents} /></Metric>
      <Metric label="Vereinnahmte USt."><Amount cents={summary.receivedVatCents} /></Metric>
      <Metric label="Abziehbare Vorsteuer"><Amount cents={summary.deductibleInputTaxCents} /></Metric>
      <Metric label="Offene Forderungen"><Amount cents={summary.openReceivablesCents} /><small>Stand 31.12.{summary.year}</small></Metric>
    </section>
    <section className="grid gap-5 xl:grid-cols-2">
      <TaxTable title="Umsatzsteuer-Arbeitswerte" headers={['Steuersatz', 'Netto', 'Steuer', 'Brutto']} rows={summary.outputTaxByRate.map((row) => [`${(row.taxRateBp / 100).toLocaleString('de-DE')} %`, <Amount cents={row.netCents} />, <Amount cents={row.taxCents} />, <Amount cents={row.grossCents} />])} />
      <TaxTable title="Betriebsausgaben nach Kategorie" headers={['Kategorie', 'Brutto', 'davon abziehbar']} rows={summary.expenseCategories.map((row) => [row.category, <Amount cents={row.grossCents} />, <Amount cents={row.deductibleCents} />])} />
      <TaxTable title="Monatlicher Geldfluss" headers={['Monat', 'Einnahmen', 'Ausgaben', 'Ergebnis']} rows={summary.months.filter((row) => row.receiptsCents || row.expensesCents).map((row) => [row.month, <Amount cents={row.receiptsCents} />, <Amount cents={row.expensesCents} />, <Amount cents={row.resultCents} />])} />
      <TaxTable title="Offene Posten zum Jahresende" headers={['Rechnung', 'Kunde', 'Fällig', 'Offen']} rows={summary.openItems.map((row) => [row.number, row.customerName, row.dueDate, <Amount cents={row.openCents} />])} />
    </section>
    <section className="rounded-lg border border-border bg-surface p-4 text-sm shadow-elev1"><h2 className="font-semibold">Plausibilitätsvergleich</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Value label="Fakturierte Nettoerlöse" cents={summary.invoicedNetCents} /><Value label="Fakturierte Umsatzsteuer" cents={summary.invoicedTaxCents} /><Value label="Gutschriften netto" cents={summary.creditNoteNetCents} /><Value label="Gutschriften Steuer" cents={summary.creditNoteTaxCents} /></div><p className="mt-3 text-xs text-muted">Diese Werte beruhen auf Belegdatum. Zahlungseingänge können wegen Teilzahlungen, offenen Forderungen oder jahresübergreifenden Zahlungen abweichen.</p></section>
  </div>;
}

function ExpensesPanel({ form, setForm, netText, setNetText, computed, expenses, busy, onSave, onReset, onEdit, onDelete }: {
  form: ExpenseInput; setForm: (next: ExpenseInput) => void; netText: string; setNetText: (value: string) => void;
  computed: { net: number; inputTax: number; gross: number }; expenses: Expense[]; busy: boolean;
  onSave: () => void; onReset: () => void; onEdit: (row: Expense) => void; onDelete: (row: Expense) => void;
}) {
  return <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-elev1"><div><h2 className="font-semibold">{form.id ? 'Ausgabe bearbeiten' : 'Betriebsausgabe erfassen'}</h2><p className="mt-1 text-sm text-muted">Beträge werden in Cent gespeichert; Vorsteuer und Brutto berechnet die App.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Zahlungs-/Belegdatum" required><input type="date" value={form.expenseDate} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} className={inputClass} /></Field><Field label="Belegnummer"><input value={form.receiptNumber ?? ''} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} className={inputClass} /></Field></div>
      <Field label="Lieferant" required><input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} className={inputClass} /></Field>
      <Field label="Beschreibung" required><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Kategorie"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Zahlungsart"><select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className={inputClass}>{PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Netto"><input inputMode="decimal" value={netText} onChange={(event) => setNetText(event.target.value)} className={inputClass} /></Field><Field label="Vorsteuer"><select value={form.taxRateBp} onChange={(event) => setForm({ ...form, taxRateBp: Number(event.target.value) })} className={inputClass}><option value={0}>0 %</option><option value={700}>7 %</option><option value={1900}>19 %</option></select></Field><Field label="Abziehbar"><select value={form.deductibleBp} onChange={(event) => setForm({ ...form, deductibleBp: Number(event.target.value) })} className={inputClass}><option value={10000}>100 %</option><option value={7000}>70 %</option><option value={5000}>50 %</option><option value={0}>0 %</option></select></Field></div>
      <div className="grid grid-cols-3 gap-2 rounded bg-input p-3 text-sm"><Value label="Netto" cents={computed.net} /><Value label="Vorsteuer" cents={computed.inputTax} /><Value label="Brutto" cents={computed.gross} /></div>
      <Field label="Pfad zum digitalen Beleg"><input value={form.receiptPath ?? ''} onChange={(event) => setForm({ ...form, receiptPath: event.target.value })} placeholder="C:\Belege\2026\rechnung.pdf" className={inputClass} /></Field>
      <Field label="Notiz"><textarea rows={3} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} /></Field>
      <div className="flex justify-end gap-2"><button type="button" onClick={onReset} className={buttonSecondary}>Leeren</button><button type="button" disabled={busy || computed.gross <= 0} onClick={onSave} className={buttonPrimary}>{form.id ? 'Änderungen speichern' : 'Ausgabe speichern'}</button></div>
    </section>
    <section className="overflow-x-auto rounded-lg border border-border bg-surface p-4 shadow-elev1"><h2 className="mb-3 font-semibold">Erfasste Ausgaben</h2>{expenses.length === 0 ? <p className="py-8 text-center text-sm text-muted">Für dieses Jahr wurden noch keine Ausgaben erfasst.</p> : <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-subtle"><th className="border-b border-border py-2">Datum</th><th className="border-b border-border py-2">Lieferant / Beschreibung</th><th className="border-b border-border py-2">Kategorie</th><th className="border-b border-border py-2 text-right">Brutto</th><th className="border-b border-border py-2"></th></tr></thead><tbody>{expenses.map((row) => <tr key={row.id}><td className="border-b border-divider py-2 align-top">{row.expenseDate}</td><td className="border-b border-divider py-2"><div className="font-medium">{row.vendor}</div><div className="text-xs text-muted">{row.description}{row.receiptNumber ? ` · ${row.receiptNumber}` : ''}</div></td><td className="border-b border-divider py-2 text-muted">{row.category}</td><td className="border-b border-divider py-2 text-right"><Amount cents={row.grossCents} /></td><td className="border-b border-divider py-2 text-right"><div className="flex justify-end gap-2"><button type="button" onClick={() => onEdit(row)} className="text-xs text-primary">Bearbeiten</button><button type="button" onClick={() => onDelete(row)} className="text-xs" style={{ color: 'var(--n-danger)' }}>Löschen</button></div></td></tr>)}</tbody></table>}</section>
  </div>;
}

function ExportPanel({ year, summary, targetDir, setTargetDir, busy, onExport }: { year: number; summary: TaxYearSummary; targetDir: string; setTargetDir: (value: string) => void; busy: boolean; onExport: () => void }) {
  return <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="rounded-lg border border-border bg-surface p-5 shadow-elev1"><h2 className="font-semibold">Inhalt des Steuerpakets {year}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><ExportItem title="Steuerbericht als PDF">Zusammenfassung der EÜR-Arbeitswerte, Umsatzsteuer und Ausgabenkategorien.</ExportItem><ExportItem title="EÜR-Arbeitswerte als CSV">Zentrale Jahreskennzahlen in einer kompakten Tabelle.</ExportItem><ExportItem title="Einnahmen als CSV">Alle erfassten Zahlungseingänge mit Rechnung, Kunde, Netto und Steuer.</ExportItem><ExportItem title="Ausgaben als CSV">Alle Betriebsausgaben inklusive Vorsteuer, Abzugsquote und Belegpfad.</ExportItem><ExportItem title="Umsatzsteuer als CSV">Bemessungsgrundlagen und Steuer nach Steuersatz.</ExportItem><ExportItem title="Monate und Kategorien">Separate CSV-Dateien für Geldfluss und Ausgabenstruktur.</ExportItem><ExportItem title="Offene Posten als CSV">Noch offene Rechnungen zum 31.12.{year}.</ExportItem><ExportItem title="Belegkopien">Vorhandene Belegdateien werden in einen eigenen Unterordner kopiert.</ExportItem><ExportItem title="Hinweise und Warnungen">Berechnungsgrundlage, Sonderfälle und fehlende Belege.</ExportItem></div><div className="mt-5 rounded bg-input p-4 text-sm"><div className="font-medium">Aktuelle Berechnung</div><div className="mt-2 grid grid-cols-2 gap-3"><Value label="Geschätzter Gewinn" cents={summary.estimatedProfitCents} /><Value label="Liquidität brutto" cents={summary.cashResultCents} /><Value label="USt.-Arbeitswert" cents={summary.vatPayableCents} /><Value label="Offene Posten" cents={summary.openReceivablesCents} /></div></div></section><section className="h-fit space-y-4 rounded-lg border border-border bg-surface p-5 shadow-elev1"><div><h2 className="font-semibold">Export erstellen</h2><p className="mt-1 text-sm text-muted">Im Zielordner wird ein eigener Unterordner angelegt. Vorhandene Dateien desselben Jahres werden aktualisiert.</p></div><Field label="Zielordner" required><input value={targetDir} onChange={(event) => setTargetDir(event.target.value)} placeholder="C:\Users\Name\Documents\Steuer" className={inputClass} /></Field><button type="button" disabled={busy || !targetDir.trim()} onClick={onExport} className={`${buttonPrimary} w-full`}>{busy ? 'Steuerpaket wird erstellt…' : `Steuerpaket ${year} erstellen`}</button><p className="text-xs text-subtle">Es werden ausschließlich lokale Dateien erzeugt. Es findet keine Netzwerkübertragung statt.</p></section></div>;
}

function Metric({ label, children, }: { label: string; children: ReactNode }) { return <div className="rounded-lg border border-border bg-surface p-4 shadow-elev1"><div className="text-xs uppercase text-subtle">{label}</div><div className="mt-2 text-lg font-semibold">{children}</div></div>; }
function Value({ label, cents: value }: { label: string; cents: number }) { return <div><div className="text-xs text-subtle">{label}</div><div className="font-medium"><Amount cents={value} /></div></div>; }
function TaxTable({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) { return <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4 shadow-elev1"><h2 className="mb-3 font-semibold">{title}</h2>{rows.length === 0 ? <p className="py-5 text-center text-sm text-muted">Keine Daten</p> : <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-subtle">{headers.map((header, index) => <th key={header} className={`border-b border-border py-2 ${index > 0 ? 'text-right' : ''}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className={`border-b border-divider py-2 ${index > 0 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table>}</div>; }
function ExportItem({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded border border-divider p-3"><div className="font-medium">{title}</div><p className="mt-1 text-sm text-muted">{children}</p></div>; }
