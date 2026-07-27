import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ApiError, SearchResult } from '../lib/api';
import { EmptyState, Loading, PageError, toApiError } from './pageUtils';

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  invoice: 'Rechnung', quote: 'Angebot', customer: 'Kunde', product: 'Produkt',
};

export function SearchResults({ query, onOpen }: { query: string; onOpen: (result: SearchResult) => void }) {
  const [rows, setRows] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setError(null);
    try { setRows(await api.globalSearch(query)); }
    catch (err) { setError(toApiError(err)); }
  }
  useEffect(() => { void load(); }, [query]);

  return <div className="space-y-4"><div><h1 className="text-xl font-semibold tracking-tight">Suche</h1><p className="mt-1 text-sm text-muted">Ergebnisse für „{query}“</p></div>{error && <PageError error={error} retry={() => void load()} />}{rows === null && !error && <Loading />}{rows !== null && rows.length === 0 && <EmptyState title="Keine Treffer">Durchsucht werden Rechnungen, Angebote, Kunden und Produkte.</EmptyState>}{rows !== null && rows.length > 0 && <div className="divide-y divide-divider rounded-lg border border-border bg-surface shadow-elev1">{rows.map((row) => <button key={`${row.kind}-${row.id}`} type="button" onClick={() => onOpen(row)} className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-canvas"><span className="mt-0.5 rounded bg-primary-soft px-2 py-0.5 text-xs">{KIND_LABEL[row.kind]}</span><span><span className="block font-medium">{row.title}</span><span className="mt-0.5 block text-sm text-muted">{row.subtitle}</span></span></button>)}</div>}</div>;
}
