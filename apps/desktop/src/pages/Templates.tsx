import { useEffect, useMemo, useState } from 'react';
import { TEMPLATE_PRESETS } from '@noctura/doc-render';
import type { RenderDocument, TemplateLayout } from '@noctura/doc-render';
import { api, ApiError } from '../lib/api';
import type { BusinessSettings, TemplateSummary } from '../lib/api';
import { EmptyState, Loading, PageError, buttonDanger, buttonPrimary, buttonSecondary, inputClass, toApiError } from './pageUtils';
import { TemplateEditor } from './TemplateEditor';

type TemplateCard = TemplateSummary & { layout: TemplateLayout };
type Editing = { id: string | null; initial: TemplateLayout; name: string };

function euro(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}
function companyFooter(settings: BusinessSettings) {
  return [
    settings.legalName,
    settings.email,
    settings.phone,
    settings.iban ? `IBAN ${settings.iban}` : '',
    settings.vatId ? `USt-IdNr. ${settings.vatId}` : '',
    settings.taxNumber ? `Steuernr. ${settings.taxNumber}` : '',
  ].filter(Boolean).join(' · ');
}

async function buildPreview(): Promise<RenderDocument> {
  const [settings, logoPath] = await Promise.all([api.businessSettings(), api.companyLogoDataUrl()]);
  const taxNote = settings.taxScheme === 'small_business'
    ? settings.smallBusinessNote || 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
    : undefined;

  return {
    title: 'Rechnung RE-2026-00001',
    logoPath: logoPath ?? undefined,
    addressLines: ['Empfängername', 'Straße und Hausnummer', 'PLZ Ort'],
    infoRows: [
      { label: 'Rechnungsnummer', value: 'RE-2026-00001' },
      { label: 'Rechnungsdatum', value: '27.07.2026' },
      { label: 'Leistungsdatum', value: '27.07.2026' },
      { label: 'Fällig am', value: '10.08.2026' },
    ],
    items: [
      { position: 1, kind: 'item', description: 'Bezeichnung der Leistung oder Ware', descriptionExtra: 'Optionale ergänzende Beschreibung', quantity: '1', unit: 'Stück', unitPrice: euro(10000), discount: '', taxRate: '19 %', lineTotal: euro(11900) },
      { position: 2, kind: 'item', description: 'Weitere Position', quantity: '2', unit: 'Stunden', unitPrice: euro(5000), discount: '', taxRate: '19 %', lineTotal: euro(11900) },
    ],
    totals: [
      { label: 'Nettosumme', value: euro(20000) },
      { label: 'Umsatzsteuer 19 %', value: euro(3800) },
      { label: 'Gesamtbetrag', value: euro(23800), emphasis: true },
    ],
    taxRows: [{ label: '19 % Umsatzsteuer', net: euro(20000), tax: euro(3800) }],
    taxNote,
    context: {
      'firma.name': settings.legalName,
      'firma.strasse': `${settings.street} ${settings.houseNo}`.trim(),
      'firma.plz': settings.postalCode,
      'firma.ort': settings.city,
      'firma.iban': settings.iban,
      'firma.bic': settings.bic,
      'firma.bank': settings.bankName,
      'firma.ustId': settings.vatId,
      'firma.fusszeile': companyFooter(settings),
      'beleg.nummer': 'RE-2026-00001',
      'beleg.faelligAm': '10.08.2026',
      'beleg.einleitung': 'Vielen Dank für Ihren Auftrag. Wir berechnen folgende Leistungen:',
      'beleg.schlusstext': 'Bitte überweisen Sie den Gesamtbetrag unter Angabe der Rechnungsnummer.',
      'kunde.nummer': '',
    },
    isDraft: false,
  };
}

export function Templates() {
  const [rows, setRows] = useState<TemplateCard[] | null>(null);
  const [preview, setPreview] = useState<RenderDocument | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const [summaries, previewDocument] = await Promise.all([api.templates(), buildPreview()]);
      const details = await Promise.all(summaries.map((row) => api.template(row.id)));
      setRows(summaries.flatMap((row, index) => {
        const detail = details[index];
        if (!detail) return [];
        try { return [{ ...row, layout: JSON.parse(detail.layoutJson) as TemplateLayout }]; }
        catch { return []; }
      }));
      setPreview(previewDocument);
    } catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, []);

  async function openTemplate(row: TemplateCard) {
    setEditing({ id: row.id, initial: row.layout, name: row.name });
  }
  function newFromPreset(index: number) {
    const preset = TEMPLATE_PRESETS[index];
    if (!preset) return;
    setEditing({ id: null, name: preset.name, initial: structuredClone(preset.layout) });
    setShowPresets(false);
  }
  async function save(layout: TemplateLayout, name: string) {
    setBusy(true); setError(null);
    try {
      const normalized = { ...layout, name: name.trim() || layout.name };
      if (editing?.id) await api.updateTemplate(editing.id, normalized.name, JSON.stringify(normalized));
      else await api.createTemplate(normalized.name, JSON.stringify(normalized));
      setEditing(null); await load();
    } catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }
  async function remove(row: TemplateCard) {
    if (!window.confirm(`Vorlage „${row.name}“ wirklich löschen?`)) return;
    setBusy(true); setError(null);
    try { await api.deleteTemplate(row.id); await load(); }
    catch (err) { setError(toApiError(err)); } finally { setBusy(false); }
  }

  if (editing && preview) return <TemplateWorkspace editing={editing} preview={preview} busy={busy} error={error} onCancel={() => setEditing(null)} onSave={save} />;

  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-semibold tracking-tight">Rechnungsvorlagen</h1><p className="mt-1 max-w-2xl text-sm text-muted">Gestalten Sie Belege mit echten lokalen Firmendaten. Die gewählte Standardvorlage wird beim PDF-Export verwendet.</p></div><button type="button" onClick={() => setShowPresets(true)} className={buttonPrimary}>Neue Vorlage</button></div>
    {error && <PageError error={error} retry={() => void load()} />}
    {rows === null && !error && <Loading label="Vorlagen werden geladen…" />}
    {showPresets && <section className="rounded-lg border border-border bg-surface p-5 shadow-elev1"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Design auswählen</h2><p className="mt-1 text-sm text-muted">Farben, Schrift, Ränder, Spalten und sichtbare Bereiche können anschließend angepasst werden.</p></div><button type="button" onClick={() => setShowPresets(false)} className={buttonSecondary}>Schließen</button></div><div className="grid gap-4 lg:grid-cols-3">{TEMPLATE_PRESETS.map((preset, index) => <button key={preset.id} type="button" onClick={() => newFromPreset(index)} className="group overflow-hidden rounded-lg border border-border bg-canvas text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-elev1"><TemplateThumbnail layout={preset.layout} /><div className="p-4"><div className="font-semibold">{preset.name}</div><div className="mt-1 text-sm text-muted">{preset.description}</div></div></button>)}</div></section>}
    {rows && rows.length === 0 && !showPresets && <EmptyState title="Noch keine eigene Vorlage">Erstellen Sie eine Vorlage aus einem der professionellen Grunddesigns. Bis dahin verwendet die App das integrierte moderne Standarddesign.</EmptyState>}
    {rows && rows.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <article key={row.id} className="overflow-hidden rounded-lg border border-border bg-surface shadow-elev1"><TemplateThumbnail layout={row.layout} /><div className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{row.name}</h2><p className="mt-0.5 text-xs text-subtle">Version {row.version} · {row.layout.page.variant ?? 'modern'}</p></div>{row.isDefault && <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-medium">Standard</span>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openTemplate(row)} className={buttonSecondary}>Bearbeiten</button>{!row.isDefault && <button type="button" disabled={busy} onClick={() => void api.setDefaultTemplate(row.id).then(load).catch((err) => setError(toApiError(err)))} className={buttonPrimary}>Als Standard</button>}{!row.isDefault && <button type="button" disabled={busy} onClick={() => void remove(row)} className={buttonDanger}>Löschen</button>}</div></div></article>)}</div>}
    {rows && rows.length > 0 && <section className="rounded-lg border border-border bg-surface p-4 text-sm text-muted shadow-elev1"><strong className="text-text">Hinweis:</strong> Bereits finalisierte Belege behalten ihre eingefrorenen Inhalte. Beim erneuten PDF-Export wird die dem Beleg zugewiesene Vorlage verwendet; fehlt diese, greift die Standardvorlage.</section>}
  </div>;
}

function TemplateWorkspace({ editing, preview, busy, error, onCancel, onSave }: { editing: Editing; preview: RenderDocument; busy: boolean; error: ApiError | null; onCancel: () => void; onSave: (layout: TemplateLayout, name: string) => Promise<void> }) {
  const [name, setName] = useState(editing.name);
  const title = useMemo(() => editing.id ? 'Vorlage bearbeiten' : 'Neue Vorlage', [editing.id]);
  return <div className="flex h-full flex-col gap-3"><div className="flex items-center gap-3"><button type="button" onClick={onCancel} className={buttonSecondary}>← Vorlagen</button><div><div className="text-xs text-subtle">{title}</div><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name der Vorlage" className={`${inputClass} mt-1 w-72`} /></div>{busy && <span className="text-xs text-subtle">Wird gespeichert…</span>}</div>{error && <PageError error={error} />}<div className="min-h-0 flex-1"><TemplateEditor initial={editing.initial} previewDocument={preview} onSave={(layout) => void onSave(layout, name)} /></div></div>;
}

function TemplateThumbnail({ layout }: { layout: TemplateLayout }) {
  const accent = layout.page.accentColor ?? layout.page.primaryColor;
  const classic = layout.page.variant === 'classic';
  return <div className="relative h-44 bg-white p-5" style={{ borderTop: classic ? `1px solid ${accent}` : `6px solid ${accent}` }}><div className="flex justify-between"><div className="h-2 w-20 rounded bg-slate-200" /><div className="h-4 w-12 rounded" style={{ background: accent }} /></div><div className="mt-5 flex justify-between gap-5"><div className="space-y-1"><div className="h-1.5 w-20 rounded bg-slate-300" /><div className="h-1.5 w-16 rounded bg-slate-200" /><div className="h-1.5 w-12 rounded bg-slate-200" /></div><div className="w-24"><div className="mb-2 h-5 w-full rounded" style={{ background: `${accent}22` }} /><div className="space-y-1"><div className="h-1.5 w-full rounded bg-slate-200" /><div className="h-1.5 w-4/5 rounded bg-slate-200" /></div></div></div><div className="mt-5 space-y-1.5"><div className="h-3 rounded" style={{ background: classic ? '#e5e7eb' : accent }} /><div className="h-2 rounded bg-slate-100" /><div className="h-2 rounded bg-slate-100" /><div className="h-2 rounded bg-slate-100" /></div><div className="ml-auto mt-4 w-24 rounded bg-slate-100 p-2"><div className="mb-1 h-1.5 rounded bg-slate-300" /><div className="h-2 rounded" style={{ background: accent }} /></div></div>;
}
