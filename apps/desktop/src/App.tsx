import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { CommandPalette } from './components/CommandPalette';
import type { Command } from './components/CommandPalette';
import { Amount } from './components/Amount';
import { StatusBadge, stateRailColor } from './components/StatusBadge';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Products } from './pages/Products';
import { InvoiceEditor } from './pages/InvoiceEditor';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { License } from './pages/License';
import { Outbox } from './pages/Outbox';
import { Help } from './pages/Help';
import { OnboardingWizard } from './pages/OnboardingWizard';
import { formatDate } from './lib/format';
import { matchShortcut } from './lib/shortcuts';
import { NAVIGATION } from './lib/navigation';
import type { InvoiceState } from '@noctura/invoice-core';

interface Row {
  id: string; number: string; customer: string; issued: string;
  due: string; grossCents: number; state: InvoiceState;
}

// Beispieldaten, bis die Abfragen aus dem Rust-Kern angebunden sind.
const DEMO_INVOICES: Row[] = [
  { id: '1', number: 'RE-2026-00042', customer: 'Steinbach Elektrotechnik GmbH', issued: '2026-07-18', due: '2026-08-01', grossCents: 428_570, state: 'sent' },
  { id: '2', number: 'RE-2026-00041', customer: 'Praxis Dr. Lehmann', issued: '2026-07-11', due: '2026-07-25', grossCents: 89_250, state: 'overdue' },
  { id: '3', number: 'RE-2026-00040', customer: 'Kollwitz Design', issued: '2026-07-04', due: '2026-07-18', grossCents: 1_190_000, state: 'paid' },
  { id: '4', number: '—', customer: 'Nordwind Logistik', issued: '2026-07-26', due: '2026-08-09', grossCents: 23_800, state: 'draft' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  const navigate = useCallback((target: string) => {
    setPage(target);
    setPaletteOpen(false);
  }, []);

  const commands: Command[] = useMemo(() => [
    ...NAVIGATION.map((item) => ({
      id: `nav.${item.id}`, label: item.label, group: 'Navigation', run: () => navigate(item.id),
    })),
    { id: 'invoice.new', label: 'Neue Rechnung', group: 'Erstellen', run: () => navigate('invoice-new') },
    { id: 'customer.new', label: 'Neuer Kunde', group: 'Erstellen', run: () => navigate('customers') },
    { id: 'template.edit', label: 'Vorlage bearbeiten', group: 'Erstellen', run: () => navigate('template-editor') },
    { id: 'backup.create', label: 'Sicherung erstellen', group: 'Daten', run: () => navigate('settings') },
    { id: 'onboarding', label: 'Einrichtung erneut öffnen', group: 'System', run: () => setOnboarding(true) },
  ], [navigate]);

  // Tastenkürzel global: eine Stelle, aus der auch Hilfe und Palette gespeist werden.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const match = matchShortcut(event, 'global');
      if (!match) return;
      if (typing && match.id !== 'palette') return;

      event.preventDefault();
      if (match.id === 'palette') setPaletteOpen((open) => !open);
      if (match.id === 'invoice.new') navigate('invoice-new');
      if (match.id === 'customer.new') navigate('customers');
      if (match.id === 'settings') navigate('settings');
      if (match.id === 'help') navigate('help');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  if (onboarding) {
    return <OnboardingWizard onFinish={() => setOnboarding(false)} onSkip={() => setOnboarding(false)} />;
  }

  return (
    <>
      <AppShell active={page} onNavigate={navigate}>
        {page === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {page === 'invoices' && <InvoiceList rows={DEMO_INVOICES} onNew={() => navigate('invoice-new')} />}
        {page === 'invoice-new' && <InvoiceEditor />}
        {page === 'customers' && (
          <Customers onOpen={() => navigate('customers')} />
        )}
        {page === 'templates' && <Templates />}
        {page === 'template-editor' && <Templates />}
        {page === 'settings' && <Settings />}
        {page === 'license' && <License />}
        {page === 'outbox' && <Outbox entries={[]} />}
        {page === 'help' && <Help />}

        {page === 'products' && <Products />}

        {['quotes', 'credit-notes', 'discounts', 'reports'].includes(page) && (
          <EmptyPage title={NAVIGATION.find((item) => item.id === page)?.label ?? ''} />
        )}
      </AppShell>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

function InvoiceList({ rows, onNew }: { rows: readonly Row[]; onNew: () => void }) {
  return (
    <>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Rechnungen</h1>
        <button type="button" onClick={onNew}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
          Neue Rechnung
        </button>
      </div>

      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Liste der Rechnungen</caption>
        <thead>
          <tr className="text-left text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
            <th scope="col" className="border-b border-border py-2 pl-4 font-medium">Nummer</th>
            <th scope="col" className="border-b border-border py-2 font-medium">Kunde</th>
            <th scope="col" className="border-b border-border py-2 font-medium">Datum</th>
            <th scope="col" className="border-b border-border py-2 font-medium">Fällig</th>
            <th scope="col" className="border-b border-border py-2 font-medium">Status</th>
            <th scope="col" className="border-b border-border py-2 pr-2 text-right font-medium">Brutto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="n-state-rail hover:bg-surface"
                style={{ ['--rail' as string]: stateRailColor(row.state), height: 'var(--n-row-height)' }}>
              <td className="border-b border-divider pl-4 font-mono text-xs">{row.number}</td>
              <td className="border-b border-divider">{row.customer}</td>
              <td className="border-b border-divider text-muted">{formatDate(row.issued)}</td>
              <td className="border-b border-divider text-muted">{formatDate(row.due)}</td>
              <td className="border-b border-divider"><StatusBadge state={row.state} /></td>
              <td className="border-b border-divider pr-2"><Amount cents={row.grossCents} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function EmptyPage({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-elev1">
      <h1 className="text-lg font-medium">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        Dieser Bereich nutzt dieselben Bausteine wie Rechnungen und Kunden. Die Datenabfragen
        stehen in <code>apps/desktop/src-tauri/src/repo</code>.
      </p>
    </div>
  );
}
