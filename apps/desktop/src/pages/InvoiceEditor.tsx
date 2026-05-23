import { useMemo, useState } from 'react';
import { calculateDocument, formatBp } from '@noctura/invoice-core';
import type { DocumentInput, LineInput, TaxScheme } from '@noctura/invoice-core';
import { Amount } from '../components/Amount';

/**
 * Rechnungseditor. Die Summen entstehen bei jedem Tastendruck aus
 * `invoice-core` — dieselbe Funktion, die der Rust-Kern beim Finalisieren
 * erneut ausfuehrt. Die Oberflaeche rechnet an keiner Stelle selbst.
 */
export function InvoiceEditor({ taxScheme = 'standard' as TaxScheme }) {
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [lines, setLines] = useState<LineInput[]>([
    { id: 'l1', kind: 'item', quantityMilli: 2000, unitPriceCents: 9500, taxRateBp: 1900 },
    { id: 'l2', kind: 'item', quantityMilli: 1000, unitPriceCents: 4000, taxRateBp: 1900 },
  ]);

  const input: DocumentInput = useMemo(
    () => ({ pricesIncludeTax, taxScheme, lines }),
    [pricesIncludeTax, taxScheme, lines],
  );
  const result = useMemo(() => calculateDocument(input), [input]);

  function update(id: string, patch: Partial<LineInput>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { id: `l${current.length + 1}`, kind: 'item', quantityMilli: 1000, unitPriceCents: 0, taxRateBp: 1900 },
    ]);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Rechnung bearbeiten</h1>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={pricesIncludeTax}
              onChange={(event) => setPricesIncludeTax(event.target.checked)}
            />
            Bruttopreise eingeben
          </label>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="py-2 font-medium">Beschreibung</th>
              <th scope="col" className="py-2 text-right font-medium">Menge</th>
              <th scope="col" className="py-2 text-right font-medium">Einzelpreis</th>
              <th scope="col" className="py-2 text-right font-medium">MwSt.</th>
              <th scope="col" className="py-2 text-right font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const calculated = result.lines.find((l) => l.id === line.id);
              return (
                <tr key={line.id} className="border-b border-divider">
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label="Beschreibung"
                      className="w-full rounded border border-border bg-input px-2 py-1"
                      defaultValue="Position"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      aria-label="Menge"
                      type="number"
                      step="0.001"
                      className="w-24 rounded border border-border bg-input px-2 py-1 text-right"
                      value={line.quantityMilli! / 1000}
                      onChange={(e) => update(line.id, { quantityMilli: Math.round(Number(e.target.value) * 1000) })}
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      aria-label="Einzelpreis"
                      type="number"
                      step="0.01"
                      className="w-28 rounded border border-border bg-input px-2 py-1 text-right"
                      value={line.unitPriceCents! / 100}
                      onChange={(e) => update(line.id, { unitPriceCents: Math.round(Number(e.target.value) * 100) })}
                    />
                  </td>
                  <td className="py-1.5 text-right text-muted">
                    {result.taxExempt ? '—' : formatBp(line.taxRateBp ?? 0)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Amount cents={calculated?.totalCents ?? 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={addLine}
          className="mt-3 rounded border border-border px-3 py-1.5 text-sm hover:bg-surface"
        >
          Position hinzufügen
        </button>
      </section>

      <aside className="h-fit rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium">Summen</h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Nettosumme</dt>
            <dd><Amount cents={result.netTotalCents} /></dd>
          </div>
          {result.taxGroups.map((group) => (
            <div key={group.taxRateBp} className="flex justify-between">
              <dt className="text-muted">{formatBp(group.taxRateBp)} MwSt.</dt>
              <dd><Amount cents={group.taxCents} /></dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 font-medium">
            <dt>Bruttobetrag</dt>
            <dd><Amount cents={result.grossTotalCents} /></dd>
          </div>
        </dl>

        {result.taxExempt && (
          <p className="mt-4 rounded border border-border bg-canvas p-2 text-xs text-muted">
            Es wird keine Umsatzsteuer ausgewiesen. Der Hinweistext erscheint automatisch auf der
            Rechnung. Bitte lassen Sie die Einstellung von Ihrer Steuerberatung prüfen.
          </p>
        )}
      </aside>
    </div>
  );
}
