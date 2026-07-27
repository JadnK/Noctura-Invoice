import { useEffect, useMemo, useState } from 'react';
import { Amount } from '../components/Amount';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, api } from '../lib/api';
import type {
  BusinessSettings,
  CalculationInput,
  CalculationResult,
  Customer,
  DocumentLine,
  InvoiceDetail,
  InvoiceDraftInput,
  Product,
} from '../lib/api';
import {
  EmptyState,
  Field,
  Loading,
  PageError,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  customerLabel,
  formatEuroInput,
  inputClass,
  parseEuro,
  toApiError,
} from './pageUtils';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function newLine(): DocumentLine {
  return {
    id: crypto.randomUUID(),
    kind: 'item',
    description: '',
    quantityMilli: 1000,
    unitPriceCents: 0,
    taxRateBp: 1900,
    discountValue: 0,
    hidden: false,
  };
}

function blankDraft(settings: BusinessSettings): InvoiceDraftInput {
  const issueDate = isoToday();
  return {
    customerId: '',
    issueDate,
    serviceDate: issueDate,
    dueDate: addDays(issueDate, settings.paymentTermsDays),
    currency: 'EUR',
    pricesIncludeTax: settings.pricesIncludeTax,
    taxScheme: settings.taxScheme,
    documentDiscountValue: 0,
    lines: [newLine()],
  };
}

function calculationInput(draft: InvoiceDraftInput, paidCents = 0): CalculationInput {
  return {
    pricesIncludeTax: draft.pricesIncludeTax,
    taxScheme: draft.taxScheme,
    lines: draft.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      quantityMilli: line.quantityMilli,
      unitPriceCents: line.unitPriceCents,
      taxRateBp: line.taxRateBp,
      discountKind: line.discountKind,
      discountValue: line.discountValue,
      hidden: line.hidden,
    })),
    documentDiscountKind: draft.documentDiscountKind,
    documentDiscountValue: draft.documentDiscountValue,
    paidCents,
  };
}

export function InvoiceEditor({ invoiceId, onDone, onCancel }: {
  invoiceId: string | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(invoiceId);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [draft, setDraft] = useState<InvoiceDraftInput | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [payment, setPayment] = useState({ date: isoToday(), amount: '', method: 'transfer', reference: '' });
  const [email, setEmail] = useState({ to: '', subject: '', body: '' });
  const [notice, setNotice] = useState<string | null>(null);

  async function load(id = currentId) {
    setError(null);
    try {
      const [loadedSettings, loadedCustomers, loadedProducts] = await Promise.all([
        api.businessSettings(),
        api.customers(undefined, false),
        api.products(),
      ]);
      setSettings(loadedSettings);
      setCustomers(loadedCustomers);
      setProducts(loadedProducts.filter((product) => !product.archivedAt));
      if (id) {
        const loaded = await api.invoice(id);
        if (!loaded) throw new Error('Die Rechnung wurde nicht gefunden.');
        setDetail(loaded);
        setDraft({
          id: loaded.id,
          customerId: loaded.customerId,
          issueDate: loaded.issueDate,
          serviceDate: loaded.serviceDate,
          dueDate: loaded.dueDate,
          currency: loaded.currency,
          pricesIncludeTax: loaded.pricesIncludeTax,
          taxScheme: loaded.taxScheme,
          reference: loaded.reference,
          orderNumber: loaded.orderNumber,
          project: loaded.project,
          contactPerson: loaded.contactPerson,
          introText: loaded.introText,
          outroText: loaded.outroText,
          internalNote: loaded.internalNote,
          publicNote: loaded.publicNote,
          documentDiscountKind: loaded.documentDiscountKind,
          documentDiscountValue: loaded.documentDiscountValue,
          lines: loaded.lines,
        });
        setEmail({
          to: loaded.customerEmail ?? '',
          subject: loaded.number ? `Rechnung ${loaded.number}` : 'Ihre Rechnung',
          body: loaded.number
            ? `Guten Tag,\n\nanbei erhalten Sie die Rechnung ${loaded.number}.\n\nMit freundlichen Grüßen\n${loadedSettings.legalName}`
            : '',
        });
      } else {
        setDetail(null);
        setDraft(blankDraft(loadedSettings));
      }
    } catch (err) {
      setError(toApiError(err));
    }
  }

  useEffect(() => { void load(invoiceId); }, [invoiceId]);

  useEffect(() => {
    if (!draft) return;
    let active = true;
    const timer = window.setTimeout(() => {
      api.calculate(calculationInput(draft, detail?.paidCents ?? 0))
        .then((result) => { if (active) setCalculation(result); })
        .catch((err) => { if (active) setError(toApiError(err)); });
    }, 100);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft, detail?.paidCents]);

  const readOnly = detail !== null && detail.status !== 'draft';
  const selectedCustomer = useMemo(
    () => customers?.find((customer) => customer.id === draft?.customerId),
    [customers, draft?.customerId],
  );

  function patch<K extends keyof InvoiceDraftInput>(key: K, value: InvoiceDraftInput[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function patchLine(id: string, values: Partial<DocumentLine>) {
    setDraft((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, ...values } : line),
    } : current);
  }

  function removeLine(id: string) {
    setDraft((current) => current ? {
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    } : current);
  }

  function addProduct() {
    const product = products.find((entry) => entry.id === selectedProduct);
    if (!product) return;
    setDraft((current) => current ? {
      ...current,
      lines: [...current.lines, {
        id: crypto.randomUUID(),
        kind: 'item',
        productId: product.id,
        description: product.name,
        quantityMilli: 1000,
        unitId: product.unitId ?? undefined,
        unitPriceCents: product.netPriceCents,
        taxRateBp: product.taxRateBp,
        discountKind: product.defaultDiscountBp > 0 ? 'percent' : undefined,
        discountValue: product.defaultDiscountBp,
        hidden: false,
      }],
    } : current);
    setSelectedProduct('');
  }

  function validate(): string | null {
    if (!draft) return 'Rechnung nicht geladen.';
    if (!draft.customerId) return 'Bitte wählen Sie einen Kunden.';
    if (!draft.issueDate) return 'Bitte geben Sie das Rechnungsdatum an.';
    if (!draft.serviceDate) return 'Bitte geben Sie das Leistungsdatum an.';
    if (!draft.dueDate) return 'Bitte geben Sie das Fälligkeitsdatum an.';
    if (draft.lines.length === 0) return 'Bitte fügen Sie mindestens eine Position hinzu.';
    if (draft.lines.some((line) => line.kind === 'item' && !line.description.trim())) {
      return 'Jede Position benötigt eine Beschreibung.';
    }
    if (draft.lines.some((line) => line.quantityMilli <= 0)) return 'Mengen müssen größer als null sein.';
    return null;
  }

  async function save(): Promise<string | null> {
    if (!draft) return null;
    const problem = validate();
    if (problem) {
      setError(new ApiError('E_MISSING_FIELDS', problem));
      return null;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const id = await api.saveInvoice({ ...draft, id: currentId ?? undefined });
      setCurrentId(id);
      setDraft((current) => current ? { ...current, id } : current);
      setNotice('Entwurf gespeichert.');
      return id;
    } catch (err) {
      setError(toApiError(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!draft || !calculation) return;
    const id = await save();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.finalize(id, calculationInput(draft), calculation.grossTotalCents);
      await load(id);
      setNotice('Rechnung wurde finalisiert. Die Rechnungsnummer ist jetzt unveränderlich vergeben.');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function createPdf() {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.generateDocumentPdf('invoice', currentId);
      setNotice(`PDF gespeichert: ${result.path}`);
      await load(currentId);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function registerPayment() {
    if (!currentId || !payment.amount) return;
    setBusy(true);
    setError(null);
    try {
      await api.registerInvoicePayment(
        currentId,
        payment.date,
        parseEuro(payment.amount),
        payment.method,
        payment.reference,
      );
      setPaymentOpen(false);
      setPayment((current) => ({ ...current, amount: '', reference: '' }));
      await load(currentId);
      setNotice('Zahlung wurde verbucht.');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function queueEmail() {
    if (!currentId) return;
    if (!email.to.trim()) {
      setError(new ApiError('E_MISSING_FIELDS', 'Bitte geben Sie eine Empfängeradresse an.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.generateDocumentPdf('invoice', currentId);
      await api.queueInvoiceEmail(currentId, email.to.trim(), email.subject.trim(), email.body);
      const result = await api.processOutbox();
      setNotice(result.sent > 0 ? 'E-Mail wurde versendet.' : 'E-Mail wurde in den Ausgang gelegt.');
      setEmailOpen(false);
      await load(currentId);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvoice() {
    if (!currentId) return;
    const reason = window.prompt('Grund für die Stornierung:')?.trim();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelInvoice(currentId, reason);
      await load(currentId);
      setNotice('Rechnung wurde storniert und ein Stornobeleg wurde erzeugt.');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!currentId || !window.confirm('Diesen Rechnungsentwurf endgültig löschen?')) return;
    setBusy(true);
    try {
      await api.deleteInvoiceDraft(currentId);
      onDone?.();
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  if (error && !draft) return <PageError error={error} retry={() => void load()} />;
  if (!draft || !customers || !settings) return <Loading />;

  if (customers.length === 0) {
    return (
      <EmptyState title="Zuerst einen Kunden anlegen">
        Eine Rechnung benötigt einen echten Kundenstammsatz. Legen Sie ihn unter „Kunden“ an und öffnen Sie den Editor erneut.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel ?? onDone} className="text-sm text-subtle hover:text-text">← Rechnungen</button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {detail?.number ?? (currentId ? 'Rechnungsentwurf' : 'Neue Rechnung')}
            </h1>
            {detail && <div className="mt-1"><StatusBadge state={detail.status as never} /></div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && currentId && (
            <button type="button" disabled={busy} onClick={() => void removeDraft()} className={buttonDanger}>Entwurf löschen</button>
          )}
          {!readOnly && (
            <>
              <button type="button" disabled={busy} onClick={() => void save()} className={buttonSecondary}>Speichern</button>
              <button type="button" disabled={busy || !calculation} onClick={() => void finalize()} className={buttonPrimary}>Finalisieren</button>
            </>
          )}
          {readOnly && detail?.status !== 'cancelled' && (
            <>
              <button type="button" disabled={busy} onClick={() => void createPdf()} className={buttonSecondary}>PDF erzeugen</button>
              <button type="button" disabled={busy} onClick={() => setEmailOpen((value) => !value)} className={buttonSecondary}>Per E-Mail senden</button>
              {detail && detail.grossTotalCents > detail.paidCents && (
                <button type="button" disabled={busy} onClick={() => {
                  setPayment((current) => ({ ...current, amount: formatEuroInput(detail.grossTotalCents - detail.paidCents) }));
                  setPaymentOpen((value) => !value);
                }} className={buttonPrimary}>Zahlung erfassen</button>
              )}
              <button type="button" disabled={busy} onClick={() => void cancelInvoice()} className={buttonDanger}>Stornieren</button>
            </>
          )}
        </div>
      </div>

      {error && <PageError error={error} />}
      {notice && <div className="rounded border border-border bg-surface px-3 py-2 text-sm">{notice}</div>}

      {paymentOpen && (
        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-elev1 sm:grid-cols-4">
          <Field label="Zahlungsdatum" required>
            <input type="date" value={payment.date} onChange={(event) => setPayment({ ...payment, date: event.target.value })} className={inputClass} />
          </Field>
          <Field label="Betrag in EUR" required>
            <input value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className={inputClass} />
          </Field>
          <Field label="Zahlungsart">
            <select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} className={inputClass}>
              <option value="transfer">Überweisung</option><option value="cash">Bar</option><option value="paypal">PayPal</option>
              <option value="card">Karte</option><option value="direct_debit">Lastschrift</option><option value="other">Sonstige</option>
            </select>
          </Field>
          <Field label="Referenz">
            <input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className={inputClass} />
          </Field>
          <div className="sm:col-span-4 flex justify-end">
            <button type="button" disabled={busy} onClick={() => void registerPayment()} className={buttonPrimary}>Zahlung buchen</button>
          </div>
        </section>
      )}

      {emailOpen && (
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Empfänger" required><input type="email" value={email.to} onChange={(event) => setEmail({ ...email, to: event.target.value })} className={inputClass} /></Field>
            <Field label="Betreff" required><input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} className={inputClass} /></Field>
          </div>
          <Field label="Nachricht" required><textarea rows={7} value={email.body} onChange={(event) => setEmail({ ...email, body: event.target.value })} className={inputClass} /></Field>
          {!detail?.pdfPath && <p className="text-xs text-subtle">Das PDF wird beim Versand automatisch erzeugt und angehängt.</p>}
          <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => void queueEmail()} className={buttonPrimary}>Jetzt senden</button></div>
        </section>
      )}

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-elev1 md:grid-cols-3">
        <Field label="Kunde" required>
          <select disabled={readOnly} value={draft.customerId} onChange={(event) => {
            patch('customerId', event.target.value);
            const customer = customers.find((entry) => entry.id === event.target.value);
            if (customer?.paymentTermsDays) patch('dueDate', addDays(draft.issueDate, customer.paymentTermsDays));
          }} className={inputClass}>
            <option value="">Bitte wählen</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customerLabel(customer)}</option>)}
          </select>
        </Field>
        <Field label="Rechnungsdatum" required><input disabled={readOnly} type="date" value={draft.issueDate} onChange={(event) => patch('issueDate', event.target.value)} className={inputClass} /></Field>
        <Field label="Fällig am" required><input disabled={readOnly} type="date" value={draft.dueDate} onChange={(event) => patch('dueDate', event.target.value)} className={inputClass} /></Field>
        <Field label="Leistungsdatum"><input disabled={readOnly} type="date" value={draft.serviceDate ?? ''} onChange={(event) => patch('serviceDate', event.target.value || undefined)} className={inputClass} /></Field>
        <Field label="Referenz"><input disabled={readOnly} value={draft.reference ?? ''} onChange={(event) => patch('reference', event.target.value)} className={inputClass} /></Field>
        <Field label="Bestellnummer"><input disabled={readOnly} value={draft.orderNumber ?? ''} onChange={(event) => patch('orderNumber', event.target.value)} className={inputClass} /></Field>
        <Field label="Projekt"><input disabled={readOnly} value={draft.project ?? ''} onChange={(event) => patch('project', event.target.value)} className={inputClass} /></Field>
        <Field label="Ansprechpartner"><input disabled={readOnly} value={draft.contactPerson ?? ''} onChange={(event) => patch('contactPerson', event.target.value)} className={inputClass} /></Field>
        <Field label="Steuerart">
          <select disabled={readOnly} value={draft.taxScheme} onChange={(event) => patch('taxScheme', event.target.value)} className={inputClass}>
            <option value="standard">Regelbesteuerung</option><option value="small_business">Kleinunternehmer § 19 UStG</option>
            <option value="reverse_charge">Reverse Charge</option><option value="intra_community">Innergemeinschaftlich</option><option value="tax_exempt">Steuerbefreit</option>
          </select>
        </Field>
        <Field label="Preise">
          <select disabled={readOnly} value={draft.pricesIncludeTax ? 'gross' : 'net'} onChange={(event) => patch('pricesIncludeTax', event.target.value === 'gross')} className={inputClass}>
            <option value="net">Netto</option><option value="gross">Brutto</option>
          </select>
        </Field>
        <Field label="Dokumentrabatt">
          <div className="flex gap-2">
            <select disabled={readOnly} value={draft.documentDiscountKind ?? ''} onChange={(event) => patch('documentDiscountKind', (event.target.value || undefined) as 'percent' | 'fixed' | undefined)} className={inputClass}>
              <option value="">Keiner</option><option value="percent">Prozent</option><option value="fixed">EUR</option>
            </select>
            <input disabled={readOnly || !draft.documentDiscountKind} value={draft.documentDiscountKind === 'fixed' ? formatEuroInput(draft.documentDiscountValue) : String(draft.documentDiscountValue / 100)} onChange={(event) => patch('documentDiscountValue', draft.documentDiscountKind === 'fixed' ? parseEuro(event.target.value) : Math.round(Number(event.target.value.replace(',', '.')) * 100))} className={inputClass} />
          </div>
        </Field>
      </section>


      <section className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Positionen</h2>
          {!readOnly && (
            <div className="flex min-w-[320px] gap-2">
              <select value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)} className={inputClass}>
                <option value="">Produkt übernehmen…</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
              </select>
              <button type="button" disabled={!selectedProduct} onClick={addProduct} className={buttonSecondary}>Hinzufügen</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-subtle">
              <th className="border-b border-border py-2">Beschreibung</th><th className="border-b border-border py-2 w-24">Menge</th>
              <th className="border-b border-border py-2 w-32">Einzelpreis</th><th className="border-b border-border py-2 w-24">USt.</th>
              <th className="border-b border-border py-2 w-36">Rabatt</th><th className="border-b border-border py-2 w-28 text-right">Summe</th>
              {!readOnly && <th className="border-b border-border py-2 w-12" />}
            </tr></thead>
            <tbody>
              {draft.lines.map((line) => {
                const raw = Math.round(line.quantityMilli * line.unitPriceCents / 1000);
                return (
                  <tr key={line.id}>
                    <td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} value={line.description} onChange={(event) => patchLine(line.id, { description: event.target.value })} className={inputClass} /></td>
                    <td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} type="number" min="0.001" step="0.001" value={line.quantityMilli / 1000} onChange={(event) => patchLine(line.id, { quantityMilli: Math.round(Number(event.target.value) * 1000) })} className={inputClass} /></td>
                    <td className="border-b border-divider py-2 pr-2"><input disabled={readOnly} value={formatEuroInput(line.unitPriceCents)} onChange={(event) => patchLine(line.id, { unitPriceCents: parseEuro(event.target.value) })} className={inputClass} /></td>
                    <td className="border-b border-divider py-2 pr-2"><select disabled={readOnly || draft.taxScheme !== 'standard'} value={line.taxRateBp} onChange={(event) => patchLine(line.id, { taxRateBp: Number(event.target.value) })} className={inputClass}><option value={1900}>19 %</option><option value={700}>7 %</option><option value={0}>0 %</option></select></td>
                    <td className="border-b border-divider py-2 pr-2"><div className="flex gap-1"><select disabled={readOnly} value={line.discountKind ?? ''} onChange={(event) => patchLine(line.id, { discountKind: (event.target.value || undefined) as 'percent' | 'fixed' | undefined, discountValue: 0 })} className={inputClass}><option value="">—</option><option value="percent">%</option><option value="fixed">EUR</option></select><input disabled={readOnly || !line.discountKind} value={line.discountKind === 'fixed' ? formatEuroInput(line.discountValue) : String(line.discountValue / 100)} onChange={(event) => patchLine(line.id, { discountValue: line.discountKind === 'fixed' ? parseEuro(event.target.value) : Math.round(Number(event.target.value.replace(',', '.')) * 100) })} className={inputClass} /></div></td>
                    <td className="border-b border-divider py-2 text-right"><Amount cents={raw} /></td>
                    {!readOnly && <td className="border-b border-divider py-2 pl-2"><button type="button" onClick={() => removeLine(line.id)} className="text-danger" aria-label="Position entfernen">×</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && <button type="button" onClick={() => setDraft({ ...draft, lines: [...draft.lines, newLine()] })} className={buttonSecondary}>Leere Position hinzufügen</button>}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <Field label="Einleitung"><textarea disabled={readOnly} rows={3} value={draft.introText ?? ''} onChange={(event) => patch('introText', event.target.value)} className={inputClass} /></Field>
          <Field label="Schlusstext"><textarea disabled={readOnly} rows={3} value={draft.outroText ?? ''} onChange={(event) => patch('outroText', event.target.value)} className={inputClass} /></Field>
          <Field label="Öffentliche Notiz"><textarea disabled={readOnly} rows={2} value={draft.publicNote ?? ''} onChange={(event) => patch('publicNote', event.target.value)} className={inputClass} /></Field>
          <Field label="Interne Notiz"><textarea disabled={readOnly} rows={2} value={draft.internalNote ?? ''} onChange={(event) => patch('internalNote', event.target.value)} className={inputClass} /></Field>
        </div>
        <div className="h-fit rounded-lg border border-border bg-surface p-4 shadow-elev1">
          <h2 className="mb-3 font-semibold">Summen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Netto</dt><dd>{calculation ? <Amount cents={calculation.netTotalCents} /> : '—'}</dd></div>
            <div className="flex justify-between"><dt>Umsatzsteuer</dt><dd>{calculation ? <Amount cents={calculation.taxTotalCents} /> : '—'}</dd></div>
            <div className="flex justify-between border-t border-divider pt-2 text-base font-semibold"><dt>Brutto</dt><dd>{calculation ? <Amount cents={calculation.grossTotalCents} /> : '—'}</dd></div>
            {detail && <><div className="flex justify-between"><dt>Bezahlt</dt><dd><Amount cents={detail.paidCents} /></dd></div><div className="flex justify-between font-medium"><dt>Offen</dt><dd><Amount cents={Math.max(0, detail.grossTotalCents - detail.paidCents)} /></dd></div></>}
          </dl>
          {selectedCustomer && <p className="mt-4 border-t border-divider pt-3 text-xs text-subtle">Kunde: {customerLabel(selectedCustomer)}</p>}
          {detail?.pdfPath && <p className="mt-2 break-all text-xs text-subtle">PDF: {detail.pdfPath}</p>}
        </div>
      </section>
    </div>
  );
}
