import { useEffect, useState } from 'react';
import { Amount } from '../components/Amount';
import { StatusBadge, stateRailColor } from '../components/StatusBadge';
import { formatDate } from '../lib/format';
import { ApiError, api } from '../lib/api';
import type {
  BusinessSettings,
  CalculationInput,
  CalculationResult,
  Customer,
  DocumentLine,
  Product,
  QuoteDetail,
  QuoteDraftInput,
  QuoteSummary,
} from '../lib/api';
import {
  EmptyState,
  Field,
  Loading,
  PageError,
  STATUS_LABEL,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  customerLabel,
  formatEuroInput,
  inputClass,
  parseEuro,
  toApiError,
} from './pageUtils';

const today = () => new Date().toISOString().slice(0, 10);
function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
function freshLine(): DocumentLine {
  return { id: crypto.randomUUID(), kind: 'item', description: '', quantityMilli: 1000, unitPriceCents: 0, taxRateBp: 1900, discountValue: 0, hidden: false };
}
function blank(settings: BusinessSettings): QuoteDraftInput {
  const issueDate = today();
  return {
    customerId: '', issueDate, validUntil: plusDays(issueDate, 14), currency: 'EUR',
    pricesIncludeTax: settings.pricesIncludeTax, taxScheme: settings.taxScheme,
    documentDiscountValue: 0, lines: [freshLine()],
  };
}
function calcInput(value: QuoteDraftInput): CalculationInput {
  return {
    pricesIncludeTax: value.pricesIncludeTax,
    taxScheme: value.taxScheme,
    documentDiscountKind: value.documentDiscountKind,
    documentDiscountValue: value.documentDiscountValue,
    paidCents: 0,
    lines: value.lines.map((line) => ({
      id: line.id, kind: line.kind, quantityMilli: line.quantityMilli,
      unitPriceCents: line.unitPriceCents, taxRateBp: line.taxRateBp,
      discountKind: line.discountKind, discountValue: line.discountValue, hidden: line.hidden,
    })),
  };
}

export function Quotes({ initialQuery = '', initialId }: { initialQuery?: string; initialId?: string | null }) {
  const [rows, setRows] = useState<QuoteSummary[] | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null | undefined>(initialId);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setError(null);
    try { setRows(await api.quotes(query, status)); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  if (editingId !== undefined) {
    return <QuoteEditor quoteId={editingId} onClose={() => { setEditingId(undefined); void load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Angebote</h1><p className="mt-1 text-sm text-muted">Angebote erstellen, finalisieren und ohne erneute Eingabe in Rechnungen umwandeln.</p></div>
        <button type="button" onClick={() => setEditingId(null)} className={buttonPrimary}>Neues Angebot</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nummer oder Kunde suchen" className={inputClass} />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
          <option value="">Alle Status</option>
          {['draft', 'finalized', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
        </select>
      </div>
      {error && <PageError error={error} retry={() => void load()} />}
      {!error && rows === null && <Loading />}
      {!error && rows !== null && rows.length === 0 && <EmptyState title="Noch keine Angebote">Erstellen Sie ein Angebot aus echten Kunden- und Produktdaten.</EmptyState>}
      {!error && rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-elev1">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-subtle">
            <th className="border-b border-border py-2 pl-4">Nummer</th><th className="border-b border-border py-2">Kunde</th>
            <th className="border-b border-border py-2">Datum</th><th className="border-b border-border py-2">Gültig bis</th>
            <th className="border-b border-border py-2">Status</th><th className="border-b border-border py-2 pr-3 text-right">Brutto</th>
          </tr></thead><tbody>
            {rows.map((row) => <tr key={row.id} onClick={() => setEditingId(row.id)} className="n-state-rail cursor-pointer hover:bg-canvas" style={{ ['--rail' as string]: stateRailColor(row.status as never) }}>
              <td className="border-b border-divider py-2 pl-4 font-mono text-xs">{row.number ?? 'Entwurf'}</td>
              <td className="border-b border-divider py-2">{row.customerName}</td><td className="border-b border-divider py-2 text-muted">{formatDate(row.issueDate)}</td>
              <td className="border-b border-divider py-2 text-muted">{formatDate(row.validUntil)}</td><td className="border-b border-divider py-2"><StatusBadge state={row.status as never} /></td>
              <td className="border-b border-divider py-2 pr-3 text-right"><Amount cents={row.grossTotalCents} /></td>
            </tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

function QuoteEditor({ quoteId, onClose }: { quoteId: string | null; onClose: () => void }) {
  const [id, setId] = useState<string | null>(quoteId);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [draft, setDraft] = useState<QuoteDraftInput | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(current = id) {
    setError(null);
    try {
      const [settings, customerRows, productRows] = await Promise.all([api.businessSettings(), api.customers(), api.products()]);
      setCustomers(customerRows);
      setProducts(productRows.filter((product) => !product.archivedAt));
      if (current) {
        const loaded = await api.quote(current);
        if (!loaded) throw new Error('Das Angebot wurde nicht gefunden.');
        setDetail(loaded);
        setDraft({
          id: loaded.id, customerId: loaded.customerId, issueDate: loaded.issueDate, validUntil: loaded.validUntil,
          currency: loaded.currency, pricesIncludeTax: loaded.pricesIncludeTax, taxScheme: loaded.taxScheme,
          introText: loaded.introText, outroText: loaded.outroText, internalNote: loaded.internalNote,
          documentDiscountKind: loaded.documentDiscountKind, documentDiscountValue: loaded.documentDiscountValue,
          lines: loaded.lines,
        });
      } else {
        setDetail(null); setDraft(blank(settings));
      }
    } catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(quoteId); }, [quoteId]);
  useEffect(() => {
    if (!draft) return;
    const timer = window.setTimeout(() => api.calculate(calcInput(draft)).then(setCalculation).catch((err) => setError(toApiError(err))), 80);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const readOnly = detail !== null && detail.status !== 'draft';
  function patch<K extends keyof QuoteDraftInput>(key: K, value: QuoteDraftInput[K]) { setDraft((current) => current ? { ...current, [key]: value } : current); }
  function patchLine(lineId: string, values: Partial<DocumentLine>) { setDraft((current) => current ? { ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, ...values } : line) } : current); }
  function addProduct() {
    const product = products.find((entry) => entry.id === selectedProduct);
    if (!product) return;
    setDraft((current) => current ? { ...current, lines: [...current.lines, {
      id: crypto.randomUUID(), kind: 'item', productId: product.id, description: product.name,
      quantityMilli: 1000, unitId: product.unitId ?? undefined, unitPriceCents: product.netPriceCents,
      taxRateBp: product.taxRateBp, discountKind: product.defaultDiscountBp ? 'percent' : undefined,
      discountValue: product.defaultDiscountBp, hidden: false,
    }] } : current);
    setSelectedProduct('');
  }
  function validate() {
    if (!draft?.customerId) return 'Bitte wählen Sie einen Kunden.';
    if (!draft.issueDate || !draft.validUntil) return 'Datum und Gültigkeit sind Pflichtfelder.';
    if (!draft.lines.length || draft.lines.some((line) => !line.description.trim())) return 'Mindestens eine vollständig beschriebene Position ist erforderlich.';
    return null;
  }
  async function save() {
    if (!draft) return null;
    const issue = validate();
    if (issue) { setError(new ApiError('E_MISSING_FIELDS', issue)); return null; }
    setBusy(true); setError(null);
    try {
      const savedId = await api.saveQuote({ ...draft, id: id ?? undefined });
      setId(savedId); setDraft((current) => current ? { ...current, id: savedId } : current); setNotice('Angebot gespeichert.');
      return savedId;
    } catch (err) { setError(toApiError(err)); return null; }
    finally { setBusy(false); }
  }
  async function finalize() {
    const savedId = await save(); if (!savedId) return;
    setBusy(true);
    try { await api.finalizeQuote(savedId); await load(savedId); setNotice('Angebot finalisiert.'); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function convert() {
    if (!id) return; setBusy(true);
    try { const invoiceId = await api.convertQuoteToInvoice(id); setNotice(`Rechnungsentwurf erstellt (${invoiceId}). Öffnen Sie ihn unter Rechnungen.`); await load(id); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function setStatus(next: string) {
    if (!id) return; setBusy(true);
    try { await api.updateQuoteStatus(id, next); await load(id); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function createPdf() {
    if (!id) return; setBusy(true);
    try { const result = await api.generateDocumentPdf('quote', id); setNotice(`PDF gespeichert: ${result.path}`); await load(id); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function deleteDraft() {
    if (!id || !window.confirm('Angebotsentwurf löschen?')) return;
    setBusy(true); try { await api.deleteQuoteDraft(id); onClose(); } catch (err) { setError(toApiError(err)); setBusy(false); }
  }

  if (error && !draft) return <PageError error={error} retry={() => void load()} />;
  if (!draft || !customers) return <Loading />;
  if (!customers.length) return <EmptyState title="Zuerst einen Kunden anlegen">Angebote benötigen einen Kundenstammsatz.</EmptyState>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><button type="button" onClick={onClose} className="text-sm text-subtle hover:text-text">← Angebote</button><div><h1 className="text-xl font-semibold">{detail?.number ?? 'Angebotsentwurf'}</h1>{detail && <StatusBadge state={detail.status as never} />}</div></div>
      <div className="flex flex-wrap gap-2">
        {!readOnly && id && <button type="button" disabled={busy} onClick={() => void deleteDraft()} className={buttonDanger}>Löschen</button>}
        {!readOnly && <><button type="button" disabled={busy} onClick={() => void save()} className={buttonSecondary}>Speichern</button><button type="button" disabled={busy} onClick={() => void finalize()} className={buttonPrimary}>Finalisieren</button></>}
        {readOnly && detail?.status !== 'converted' && <><button type="button" disabled={busy} onClick={() => void createPdf()} className={buttonSecondary}>PDF erzeugen</button><button type="button" disabled={busy} onClick={() => void setStatus('accepted')} className={buttonSecondary}>Angenommen</button><button type="button" disabled={busy} onClick={() => void setStatus('rejected')} className={buttonSecondary}>Abgelehnt</button><button type="button" disabled={busy} onClick={() => void convert()} className={buttonPrimary}>In Rechnung umwandeln</button></>}
      </div>
    </div>
    {error && <PageError error={error} />}{notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-elev1 md:grid-cols-3">
      <Field label="Kunde" required><select disabled={readOnly} value={draft.customerId} onChange={(event) => patch('customerId', event.target.value)} className={inputClass}><option value="">Bitte wählen</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerLabel(customer)}</option>)}</select></Field>
      <Field label="Angebotsdatum" required><input disabled={readOnly} type="date" value={draft.issueDate} onChange={(event) => patch('issueDate', event.target.value)} className={inputClass} /></Field>
      <Field label="Gültig bis" required><input disabled={readOnly} type="date" value={draft.validUntil} onChange={(event) => patch('validUntil', event.target.value)} className={inputClass} /></Field>
      <Field label="Steuerart"><select disabled={readOnly} value={draft.taxScheme} onChange={(event) => patch('taxScheme', event.target.value)} className={inputClass}><option value="standard">Regelbesteuerung</option><option value="small_business">Kleinunternehmer</option><option value="reverse_charge">Reverse Charge</option><option value="intra_community">Innergemeinschaftlich</option><option value="tax_exempt">Steuerbefreit</option></select></Field>
      <Field label="Preise"><select disabled={readOnly} value={draft.pricesIncludeTax ? 'gross' : 'net'} onChange={(event) => patch('pricesIncludeTax', event.target.value === 'gross')} className={inputClass}><option value="net">Netto</option><option value="gross">Brutto</option></select></Field>
      <Field label="Dokumentrabatt"><div className="flex gap-2"><select disabled={readOnly} value={draft.documentDiscountKind ?? ''} onChange={(event) => patch('documentDiscountKind', (event.target.value || undefined) as 'percent' | 'fixed' | undefined)} className={inputClass}><option value="">Keiner</option><option value="percent">Prozent</option><option value="fixed">EUR</option></select><input disabled={readOnly || !draft.documentDiscountKind} value={draft.documentDiscountKind === 'fixed' ? formatEuroInput(draft.documentDiscountValue) : String(draft.documentDiscountValue / 100)} onChange={(event) => patch('documentDiscountValue', draft.documentDiscountKind === 'fixed' ? parseEuro(event.target.value) : Math.round(Number(event.target.value.replace(',', '.')) * 100))} className={inputClass} /></div></Field>
    </section>
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Positionen</h2>{!readOnly && <div className="flex min-w-[320px] gap-2"><select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)} className={inputClass}><option value="">Produkt übernehmen…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select><button type="button" disabled={!selectedProduct} onClick={addProduct} className={buttonSecondary}>Hinzufügen</button></div>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="text-left text-xs uppercase text-subtle"><th className="border-b border-border py-2">Beschreibung</th><th className="border-b border-border py-2 w-24">Menge</th><th className="border-b border-border py-2 w-32">Preis</th><th className="border-b border-border py-2 w-24">USt.</th><th className="border-b border-border py-2 w-28 text-right">Summe</th>{!readOnly && <th className="border-b border-border py-2 w-10" />}</tr></thead><tbody>
        {draft.lines.map((line) => <tr key={line.id}><td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} value={line.description} onChange={(event) => patchLine(line.id, { description: event.target.value })} className={inputClass} /></td><td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} type="number" min="0.001" step="0.001" value={line.quantityMilli / 1000} onChange={(event) => patchLine(line.id, { quantityMilli: Math.round(Number(event.target.value) * 1000) })} className={inputClass} /></td><td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} value={formatEuroInput(line.unitPriceCents)} onChange={(event) => patchLine(line.id, { unitPriceCents: parseEuro(event.target.value) })} className={inputClass} /></td><td className="border-b border-divider py-2 pr-2"><select disabled={readOnly || draft.taxScheme !== 'standard'} value={line.taxRateBp} onChange={(event) => patchLine(line.id, { taxRateBp: Number(event.target.value) })} className={inputClass}><option value={1900}>19 %</option><option value={700}>7 %</option><option value={0}>0 %</option></select></td><td className="border-b border-divider py-2 text-right"><Amount cents={Math.round(line.quantityMilli * line.unitPriceCents / 1000)} /></td>{!readOnly && <td className="border-b border-divider py-2 pl-2"><button type="button" onClick={() => patch('lines', draft.lines.filter((entry) => entry.id !== line.id))} className="text-danger">×</button></td>}</tr>)}
      </tbody></table></div>
      {!readOnly && <button type="button" onClick={() => patch('lines', [...draft.lines, freshLine()])} className={buttonSecondary}>Leere Position hinzufügen</button>}
    </section>
    <section className="grid gap-4 lg:grid-cols-[1fr_300px]"><div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1"><Field label="Einleitung"><textarea disabled={readOnly} rows={4} value={draft.introText ?? ''} onChange={(event) => patch('introText', event.target.value)} className={inputClass} /></Field><Field label="Schlusstext"><textarea disabled={readOnly} rows={4} value={draft.outroText ?? ''} onChange={(event) => patch('outroText', event.target.value)} className={inputClass} /></Field><Field label="Interne Notiz"><textarea disabled={readOnly} rows={2} value={draft.internalNote ?? ''} onChange={(event) => patch('internalNote', event.target.value)} className={inputClass} /></Field></div><div className="h-fit rounded-lg border border-border bg-surface p-4 shadow-elev1"><h2 className="mb-3 font-semibold">Summen</h2><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Netto</dt><dd>{calculation ? <Amount cents={calculation.netTotalCents} /> : '—'}</dd></div><div className="flex justify-between"><dt>Umsatzsteuer</dt><dd>{calculation ? <Amount cents={calculation.taxTotalCents} /> : '—'}</dd></div><div className="flex justify-between border-t border-divider pt-2 text-base font-semibold"><dt>Brutto</dt><dd>{calculation ? <Amount cents={calculation.grossTotalCents} /> : '—'}</dd></div></dl>{detail?.pdfPath && <p className="mt-3 break-all text-xs text-subtle">PDF: {detail.pdfPath}</p>}</div></section>
  </div>;
}
