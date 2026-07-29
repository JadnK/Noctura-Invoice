import { useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { api } from '../lib/api';
import type { BusinessSettings } from '../lib/api';
import { Field, inputClass, toApiError } from '../pages/pageUtils';

export function BusinessSettingsForm({ value, onChange, sections = ['company', 'tax', 'bank', 'numbering'] }: {
  value: BusinessSettings;
  onChange: (value: BusinessSettings) => void;
  sections?: Array<'company' | 'tax' | 'bank' | 'numbering'>;
}) {
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const patch = <K extends keyof BusinessSettings>(key: K, next: BusinessSettings[K]) => onChange({ ...value, [key]: next });

  async function chooseLogo() {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const path = await api.chooseCompanyLogo();
      if (path) patch('logoPath', path);
    } catch (error) {
      setLogoError(toApiError(error).message);
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await api.removeCompanyLogo();
      patch('logoPath', '');
    } catch (error) {
      setLogoError(toApiError(error).message);
    } finally {
      setLogoBusy(false);
    }
  }

  return <div className="space-y-6">
    {sections.includes('company') && <section className="space-y-4">
      <div><h2 className="font-semibold">Firmendaten</h2><p className="mt-1 text-sm text-muted">Diese Angaben werden beim Finalisieren als unveränderlicher Belegschnappschuss gespeichert.</p></div>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="rounded-lg border border-border bg-canvas p-4">
          <div className="mb-3 text-sm font-medium">Firmenlogo</div>
          <div className="flex h-28 items-center justify-center overflow-hidden rounded border border-dashed border-border bg-surface">
            {value.logoPath ? <img src={convertFileSrc(value.logoPath)} alt="Firmenlogo" className="max-h-24 max-w-[190px] object-contain" /> : <span className="px-3 text-center text-xs text-subtle">Noch kein Logo hinterlegt</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={logoBusy} onClick={() => void chooseLogo()} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-input disabled:opacity-50">{logoBusy ? 'Wird gewählt…' : value.logoPath ? 'Logo ändern' : 'Logo auswählen'}</button>
            {value.logoPath && <button type="button" disabled={logoBusy} onClick={() => void removeLogo()} className="rounded px-3 py-1.5 text-sm text-danger hover:bg-input">Entfernen</button>}
          </div>
          <p className="mt-2 text-xs text-subtle">PNG oder JPG, maximal 10 MB. Das Logo wird lokal gespeichert und automatisch auf allen PDFs verwendet.</p>
          {logoError && <p className="mt-2 text-xs text-danger">{logoError}</p>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Unternehmensname" required><input value={value.legalName} onChange={(event) => patch('legalName', event.target.value)} className={inputClass} /></Field>
          <Field label="Rechtsform"><input value={value.legalForm} onChange={(event) => patch('legalForm', event.target.value)} className={inputClass} /></Field>
          <Field label="Vorname Inhaber/in"><input value={value.ownerFirstName} onChange={(event) => patch('ownerFirstName', event.target.value)} className={inputClass} /></Field>
          <Field label="Nachname Inhaber/in"><input value={value.ownerLastName} onChange={(event) => patch('ownerLastName', event.target.value)} className={inputClass} /></Field>
          <Field label="E-Mail"><input type="email" value={value.email} onChange={(event) => patch('email', event.target.value)} className={inputClass} /></Field>
          <Field label="Telefon"><input value={value.phone} onChange={(event) => patch('phone', event.target.value)} className={inputClass} /></Field>
          <Field label="Website"><input value={value.website} onChange={(event) => patch('website', event.target.value)} className={inputClass} /></Field>
          <Field label="Empfänger-Zusatz (z. B. bei gemieteter Adresse)">
            <input value={value.addressRecipient} onChange={(event) => patch('addressRecipient', event.target.value)} placeholder="z. B. c/o Mustermann Bürodienste" className={inputClass} />
          </Field>
          <div />
          <Field label="Straße"><input value={value.street} onChange={(event) => patch('street', event.target.value)} className={inputClass} /></Field>
          <Field label="Hausnummer"><input value={value.houseNo} onChange={(event) => patch('houseNo', event.target.value)} className={inputClass} /></Field>
          <Field label="Postleitzahl"><input value={value.postalCode} onChange={(event) => patch('postalCode', event.target.value)} className={inputClass} /></Field>
          <Field label="Ort"><input value={value.city} onChange={(event) => patch('city', event.target.value)} className={inputClass} /></Field>
          <Field label="Land"><input value={value.country} maxLength={2} onChange={(event) => patch('country', event.target.value.toUpperCase())} className={inputClass} /></Field>
        </div>
      </div>
    </section>}

    {sections.includes('tax') && <section className="space-y-4">
      <div><h2 className="font-semibold">Steuer</h2><p className="mt-1 text-sm text-muted">Die Auswahl beeinflusst alle neuen Belege. Bitte mit Ihrer Steuerberatung abstimmen.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Steuerregel"><select value={value.taxScheme} onChange={(event) => patch('taxScheme', event.target.value)} className={inputClass}><option value="standard">Regelbesteuerung</option><option value="small_business">Kleinunternehmer § 19 UStG</option><option value="reverse_charge">Reverse Charge</option><option value="intra_community">Innergemeinschaftlich</option><option value="tax_exempt">Steuerbefreit</option></select></Field>
        <Field label="Standardsteuersatz"><select value={value.defaultTaxRateBp} onChange={(event) => patch('defaultTaxRateBp', Number(event.target.value))} className={inputClass}><option value={1900}>19 %</option><option value={700}>7 %</option><option value={0}>0 %</option></select></Field>
        <Field label="USt-IdNr."><input value={value.vatId} onChange={(event) => patch('vatId', event.target.value.toUpperCase().replace(/\s/g, ''))} className={inputClass} /></Field>
        <Field label="Steuernummer"><input value={value.taxNumber} onChange={(event) => patch('taxNumber', event.target.value)} className={inputClass} /></Field>
        <Field label="Gläubiger-ID"><input value={value.creditorId} onChange={(event) => patch('creditorId', event.target.value.toUpperCase().replace(/\s/g, ''))} className={inputClass} /></Field>
        <Field label="Besteuerungsart"><select value={value.taxationMethod} onChange={(event) => patch('taxationMethod', event.target.value)} className={inputClass}><option value="actual">Istversteuerung</option><option value="accrual">Sollversteuerung</option></select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.pricesIncludeTax} onChange={(event) => patch('pricesIncludeTax', event.target.checked)} /> Preise standardmäßig als Bruttopreise erfassen</label>
      {value.taxScheme === 'small_business' && <Field label="Hinweis nach § 19 UStG"><textarea rows={3} value={value.smallBusinessNote} onChange={(event) => patch('smallBusinessNote', event.target.value)} className={inputClass} /></Field>}
    </section>}

    {sections.includes('bank') && <section className="space-y-4">
      <div><h2 className="font-semibold">Bankverbindung</h2><p className="mt-1 text-sm text-muted">Die Standardbankverbindung wird in erzeugte Rechnungs-PDFs übernommen.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Kontoinhaber"><input value={value.bankHolder} onChange={(event) => patch('bankHolder', event.target.value)} className={inputClass} /></Field>
        <Field label="Bank"><input value={value.bankName} onChange={(event) => patch('bankName', event.target.value)} className={inputClass} /></Field>
        <Field label="IBAN"><input value={value.iban} onChange={(event) => patch('iban', event.target.value.toUpperCase().replace(/\s/g, ''))} className={inputClass} /></Field>
        <Field label="BIC"><input value={value.bic} onChange={(event) => patch('bic', event.target.value.toUpperCase().replace(/\s/g, ''))} className={inputClass} /></Field>
      </div>
    </section>}

    {sections.includes('numbering') && <section className="space-y-4">
      <div><h2 className="font-semibold">Nummernkreise</h2><p className="mt-1 text-sm text-muted">Erlaubte Platzhalter: {'{YYYY}'}, {'{YY}'}, {'{MM}'}, {'{DD}'}, {'{COUNTER}'}, {'{CUSTOMER}'}, {'{TYPE}'}.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Rechnungen"><input value={value.invoicePattern} onChange={(event) => patch('invoicePattern', event.target.value)} className={inputClass} /></Field>
        <Field label="Angebote"><input value={value.quotePattern} onChange={(event) => patch('quotePattern', event.target.value)} className={inputClass} /></Field>
        <Field label="Gutschriften"><input value={value.creditNotePattern} onChange={(event) => patch('creditNotePattern', event.target.value)} className={inputClass} /></Field>
        <Field label="Standard-Zahlungsziel in Tagen"><input type="number" min="0" max="365" value={value.paymentTermsDays} onChange={(event) => patch('paymentTermsDays', Number(event.target.value))} className={inputClass} /></Field>
      </div>
    </section>}
  </div>;
}
