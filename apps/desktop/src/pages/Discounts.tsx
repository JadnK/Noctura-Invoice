import { useEffect, useState } from 'react';
import { Amount } from '../components/Amount';
import { api } from '../lib/api';
import type { ApiError, Discount, DiscountInput } from '../lib/api';
import {
  EmptyState,
  Field,
  Loading,
  PageError,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  formatEuroInput,
  inputClass,
  parseEuro,
  toApiError,
} from './pageUtils';

const blank: DiscountInput = {
  name: '', kind: 'percent', value: 0, scope: 'document', minOrderCents: 0,
  combinable: false, active: true,
};

export function Discounts() {
  const [rows, setRows] = useState<Discount[] | null>(null);
  const [form, setForm] = useState<DiscountInput | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try { setRows(await api.discounts()); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  function edit(row: Discount) {
    setForm({
      id: row.id, name: row.name, code: row.code ?? undefined, description: row.description ?? undefined,
      kind: row.kind, value: row.value, scope: row.scope, minOrderCents: row.minOrderCents,
      maxUses: row.maxUses ?? undefined, validFrom: row.validFrom ?? undefined, validTo: row.validTo ?? undefined,
      combinable: row.combinable, active: row.active,
    });
  }

  async function save() {
    if (!form || !form.name.trim()) return;
    setBusy(true); setError(null);
    try { await api.saveDiscount({ ...form, name: form.name.trim(), code: form.code?.trim() || undefined }); setForm(null); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function toggle(row: Discount) {
    setBusy(true); setError(null);
    try { await api.setDiscountActive(row.id, !row.active); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function remove(row: Discount) {
    if (!window.confirm(`Rabatt „${row.name}“ löschen?`)) return;
    setBusy(true); setError(null);
    try { await api.deleteDiscount(row.id); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex items-baseline justify-between gap-3"><div><h1 className="text-xl font-semibold tracking-tight">Rabatte</h1><p className="mt-1 text-sm text-muted">Rabattcodes, Gültigkeitszeiträume und Konditionen zentral verwalten.</p></div><button type="button" onClick={() => setForm({ ...blank })} className={buttonPrimary}>Neuer Rabatt</button></div>
    {error && <PageError error={error} retry={() => void load()} />}
    {form && <section className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-elev1">
      <h2 className="font-semibold">{form.id ? 'Rabatt bearbeiten' : 'Rabatt anlegen'}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Name" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} /></Field>
        <Field label="Code"><input value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="z. B. SOMMER10" className={inputClass} /></Field>
        <Field label="Geltungsbereich"><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })} className={inputClass}><option value="document">Gesamter Beleg</option><option value="line">Position</option><option value="customer">Kunde</option><option value="product">Produkt</option><option value="quantity">Menge</option></select></Field>
        <Field label="Art"><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as 'percent' | 'fixed', value: 0 })} className={inputClass}><option value="percent">Prozent</option><option value="fixed">Fester Betrag</option></select></Field>
        <Field label={form.kind === 'percent' ? 'Wert in Prozent' : 'Wert in EUR'} required><input value={form.kind === 'percent' ? String(form.value / 100) : formatEuroInput(form.value)} onChange={(event) => setForm({ ...form, value: form.kind === 'percent' ? Math.round(Number(event.target.value.replace(',', '.')) * 100) : parseEuro(event.target.value) })} className={inputClass} /></Field>
        <Field label="Mindestbestellwert in EUR"><input value={formatEuroInput(form.minOrderCents)} onChange={(event) => setForm({ ...form, minOrderCents: parseEuro(event.target.value) })} className={inputClass} /></Field>
        <Field label="Maximale Nutzungen"><input type="number" min="1" value={form.maxUses ?? ''} onChange={(event) => setForm({ ...form, maxUses: event.target.value ? Number(event.target.value) : undefined })} className={inputClass} /></Field>
        <Field label="Gültig ab"><input type="date" value={form.validFrom ?? ''} onChange={(event) => setForm({ ...form, validFrom: event.target.value || undefined })} className={inputClass} /></Field>
        <Field label="Gültig bis"><input type="date" value={form.validTo ?? ''} onChange={(event) => setForm({ ...form, validTo: event.target.value || undefined })} className={inputClass} /></Field>
      </div>
      <Field label="Beschreibung"><textarea rows={3} value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} /></Field>
      <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.combinable} onChange={(event) => setForm({ ...form, combinable: event.target.checked })} /> Mit anderen Rabatten kombinierbar</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Aktiv</label></div>
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className={buttonSecondary}>Abbrechen</button><button type="button" disabled={busy || !form.name.trim()} onClick={() => void save()} className={buttonPrimary}>Speichern</button></div>
    </section>}
    {rows === null && !error && <Loading />}
    {rows !== null && rows.length === 0 && !error && <EmptyState title="Noch keine Rabatte">Legen Sie hier Ihre Rabattcodes und Konditionen für die betriebliche Verwendung an.</EmptyState>}
    {rows !== null && rows.length > 0 && <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-elev1"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-subtle"><th className="border-b border-border py-2 pl-4">Name</th><th className="border-b border-border py-2">Code</th><th className="border-b border-border py-2">Wert</th><th className="border-b border-border py-2">Nutzung</th><th className="border-b border-border py-2">Status</th><th className="border-b border-border py-2 pr-3 text-right">Aktionen</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="hover:bg-canvas"><td className="border-b border-divider py-2 pl-4 font-medium">{row.name}</td><td className="border-b border-divider py-2 font-mono text-xs">{row.code ?? '—'}</td><td className="border-b border-divider py-2">{row.kind === 'percent' ? `${(row.value / 100).toLocaleString('de-DE')} %` : <Amount cents={row.value} />}</td><td className="border-b border-divider py-2 text-muted">{row.usedCount}{row.maxUses ? ` / ${row.maxUses}` : ''}</td><td className="border-b border-divider py-2">{row.active ? 'Aktiv' : 'Inaktiv'}</td><td className="border-b border-divider py-2 pr-3 text-right"><div className="flex justify-end gap-3"><button type="button" onClick={() => edit(row)} className="text-primary">Bearbeiten</button><button type="button" disabled={busy} onClick={() => void toggle(row)} className="text-primary">{row.active ? 'Deaktivieren' : 'Aktivieren'}</button><button type="button" disabled={busy} onClick={() => void remove(row)} className="text-danger">Löschen</button></div></td></tr>)}</tbody></table></div>}
  </div>;
}
