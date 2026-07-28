import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Product, ProductInput } from '../lib/api';
import { ApiError } from '../lib/api';
import { ErrorNotice } from '../components/ErrorNotice';
import { Amount } from '../components/Amount';
import { EmptyState, Loading } from './pageUtils';
import { formatBp } from '@noctura/invoice-core';

const PRODUCT_KINDS = [
  { value: 'product', label: 'Produkt' },
  { value: 'service', label: 'Dienstleistung' },
] as const;

function emptyForm(): ProductInput {
  return { sku: '', name: '', kind: 'product', netPriceCents: 0, taxRateBp: 1900, defaultDiscountBp: 0 };
}

/**
 * Produktverwaltung. Liste, Anlegen, Bearbeiten - gegen die echte lokale
 * Datenbank. Produkte, die bereits auf einem Beleg stehen, werden beim
 * Entfernen archiviert statt gelöscht (siehe repo/products.rs).
 */
export function Products() {
  const [rows, setRows] = useState<Product[] | null>(null);
  const [units, setUnits] = useState<[string, string][]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      setRows(await api.products(query || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    }
  }

  useEffect(() => { void api.units().then(setUnits).catch(() => setUnits([])); }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (creating || editingId) {
    return (
      <ProductForm
        productId={editingId}
        units={units}
        onDone={() => { setCreating(false); setEditingId(null); void load(); }}
        onCancel={() => { setCreating(false); setEditingId(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Produkte</h1>
        <button type="button" onClick={() => setCreating(true)}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
          Neues Produkt
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name oder Artikelnummer"
        aria-label="Produkte durchsuchen"
        className="w-full max-w-md rounded border border-border bg-input px-3 py-1.5 text-sm"
      />

      {error && <ErrorNotice error={error} onRetry={() => void load()} />}
      {!error && rows === null && <Loading />}

      {!error && rows !== null && rows.length === 0 && (
        <EmptyState title={query ? 'Kein Treffer' : 'Noch kein Produkt angelegt'}>
          {query ? 'Andere Schreibweise versuchen.' : 'Legen Sie das erste Produkt an, um es in Rechnungen verwenden zu können.'}
        </EmptyState>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2">Artikelnummer</th>
              <th scope="col" className="border-b border-border py-2">Bezeichnung</th>
              <th scope="col" className="border-b border-border py-2">Art</th>
              <th scope="col" className="border-b border-border py-2">MwSt.</th>
              <th scope="col" className="border-b border-border py-2 text-right">Preis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-surface" onClick={() => setEditingId(row.id)}>
                <td className="border-b border-divider py-2 font-mono text-xs">{row.sku}</td>
                <td className="border-b border-divider">{row.name}</td>
                <td className="border-b border-divider text-muted">
                  {row.kind === 'service' ? 'Dienstleistung' : 'Produkt'}
                </td>
                <td className="border-b border-divider text-muted">{formatBp(row.taxRateBp)}</td>
                <td className="border-b border-divider pr-1"><Amount cents={row.netPriceCents} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProductForm({ productId, units, onDone, onCancel }: {
  productId: string | null;
  units: [string, string][];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProductInput>(emptyForm());
  const [priceInput, setPriceInput] = useState('0,00');
  const [loading, setLoading] = useState(productId !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!productId) return;
    api.product(productId)
      .then((product) => {
        if (product) {
          setValues({
            sku: product.sku, name: product.name, kind: product.kind,
            netPriceCents: product.netPriceCents, taxRateBp: product.taxRateBp,
            unitId: product.unitId ?? undefined, defaultDiscountBp: product.defaultDiscountBp,
          });
          setPriceInput((product.netPriceCents / 100).toFixed(2).replace('.', ','));
        }
        setLoading(false);
      })
      .catch((err) => { setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err))); setLoading(false); });
  }, [productId]);

  const canSave = values.name.trim() !== '' && values.sku.trim() !== '' && !busy;

  function updatePrice(raw: string) {
    setPriceInput(raw);
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) setValues({ ...values, netPriceCents: Math.round(parsed * 100) });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (productId) await api.updateProduct(productId, values);
      else await api.createProduct(values);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('E_UNKNOWN', String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{productId ? 'Produkt bearbeiten' : 'Neues Produkt'}</h1>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm">Artikelnummer</span>
          <input value={values.sku} onChange={(event) => setValues({ ...values, sku: event.target.value })}
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Art</span>
          <select value={values.kind} onChange={(event) => setValues({ ...values, kind: event.target.value })}
                  className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm">
            {PRODUCT_KINDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm">Bezeichnung</span>
        <input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })}
               className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm">Nettopreis (€)</span>
          <input value={priceInput} onChange={(event) => updatePrice(event.target.value)}
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">MwSt. (%)</span>
          <input type="number" min={0} max={100} step={0.5} value={values.taxRateBp / 100}
                 onChange={(event) => setValues({ ...values, taxRateBp: Math.round(Number(event.target.value) * 100) })}
                 className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Einheit</span>
          <select value={values.unitId ?? ''} onChange={(event) => setValues({ ...values, unitId: event.target.value || undefined })}
                  className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm">
            <option value="">—</option>
            {units.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm">Standardrabatt (%)</span>
        <input type="number" min={0} max={100} step={0.5} value={values.defaultDiscountBp / 100}
               onChange={(event) => setValues({ ...values, defaultDiscountBp: Math.round(Number(event.target.value) * 100) })}
               className="w-32 rounded border border-border bg-input px-2 py-1.5 text-sm" />
      </label>

      {error && <ErrorNotice error={error} />}

      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={() => void save()}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
          {busy ? 'Wird gespeichert…' : 'Produkt speichern'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-sm">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
