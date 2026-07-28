import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { CommandPalette } from './components/CommandPalette';
import type { Command } from './components/CommandPalette';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Products } from './pages/Products';
import { Invoices } from './pages/Invoices';
import { Quotes } from './pages/Quotes';
import { CreditNotes } from './pages/CreditNotes';
import { Discounts } from './pages/Discounts';
import { Settings } from './pages/Settings';
import { License } from './pages/License';
import { Outbox } from './pages/Outbox';
import { Reports } from './pages/Reports';
import { TaxCenter } from './pages/TaxCenter';
import { Help } from './pages/Help';
import { OnboardingWizard } from './pages/OnboardingWizard';
import { SearchResults } from './pages/SearchResults';
import { api } from './lib/api';
import type { SearchResult } from './lib/api';
import { matchShortcut } from './lib/shortcuts';
import { NAVIGATION } from './lib/navigation';

type Route = { page: string; id?: string; query?: string };

function activeNavigation(page: string): string {
  if (page === 'search') return '';
  return page;
}

/**
 * Abstand zwischen automatischen Lizenz-Heartbeats, solange die Anwendung
 * laeuft. Faengt eine serverseitige Sperrung innerhalb weniger Minuten ab,
 * statt sie erst beim naechsten manuellen Aktivierungsversuch oder nach
 * Ablauf der Offline-Kulanzfrist (bis zu 30 Tage) zu bemerken.
 */
const LICENSE_HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const [onboardingClosable, setOnboardingClosable] = useState(false);

  useEffect(() => {
    api.onboardingStatus()
      .then((complete) => {
        setOnboarding(!complete);
        setOnboardingClosable(false);
      })
      .catch(() => {
        setOnboarding(true);
        setOnboardingClosable(false);
      });
  }, []);

  const navigate = useCallback((page: string, id?: string, query?: string) => {
    if (page === 'invoice-new') {
      setRoute({ page: 'invoices', id: 'new' });
    } else if (page === 'quote-new') {
      setRoute({ page: 'quotes', id: 'new' });
    } else {
      setRoute({ page, id, query });
    }
    setPaletteOpen(false);
  }, []);

  const commands: Command[] = useMemo(() => [
    ...NAVIGATION.map((item) => ({
      id: `nav.${item.id}`, label: item.label, group: 'Navigation', run: () => navigate(item.id),
    })),
    { id: 'invoice.new', label: 'Neue Rechnung', group: 'Erstellen', run: () => navigate('invoices', 'new') },
    { id: 'quote.new', label: 'Neues Angebot', group: 'Erstellen', run: () => navigate('quotes', 'new') },
    { id: 'customer.new', label: 'Neuer Kunde', group: 'Erstellen', run: () => navigate('customers') },
    { id: 'backup.create', label: 'Sicherung erstellen', group: 'Daten', run: () => navigate('settings') },
    { id: 'onboarding', label: 'Einrichtung erneut öffnen', group: 'System', run: () => { setOnboardingClosable(true); setOnboarding(true); } },
  ], [navigate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const match = matchShortcut(event, 'global');
      if (!match) return;
      if (typing && match.id !== 'palette') return;
      event.preventDefault();
      if (match.id === 'palette') setPaletteOpen((open) => !open);
      if (match.id === 'invoice.new') navigate('invoices', 'new');
      if (match.id === 'customer.new') navigate('customers');
      if (match.id === 'settings') navigate('settings');
      if (match.id === 'help') navigate('help');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // Regelmaessige Lizenzbestaetigung, solange die Anwendung laeuft. Ein
  // Server-Block (Admin-Panel) landet dadurch innerhalb weniger Minuten im
  // lokalen Lizenz-Cache, ueber genau denselben Mechanismus (`ensure_allowed`
  // in src-tauri/src/commands/license.rs), der schon heute greift, wenn die
  // Offline-Kulanzfrist ohne Serverkontakt ablaeuft. Bei einem frischen
  // Wechsel in den gesperrten Zustand wird zusaetzlich einmalig auf die
  // Lizenzseite gewechselt, damit der Hinweis sichtbar wird, ohne erst eine
  // eingeschraenkte Aktion auszuloesen — danach nicht erneut bei jedem
  // weiteren Heartbeat, damit die weiterhin erlaubte Arbeit (Ansehen,
  // Export, Zahlungserfassung, Sicherung) nicht unterbrochen wird.
  const wasBlockedRef = useRef<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const result = await api.heartbeat().catch(() => null);
      if (!result || cancelled) return;
      const nowBlocked = result.status === 'blocked';
      const wasBlocked = wasBlockedRef.current;
      wasBlockedRef.current = nowBlocked;
      if (nowBlocked && wasBlocked === false) navigate('license');
    }

    api.licenseStatus()
      .then((state) => { wasBlockedRef.current = state.status === 'blocked'; })
      .catch(() => { wasBlockedRef.current = null; })
      .finally(() => { void tick(); });

    const id = window.setInterval(() => void tick(), LICENSE_HEARTBEAT_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [navigate]);

  function openSearchResult(result: SearchResult) {
    if (result.kind === 'invoice') navigate('invoices', result.id);
    else if (result.kind === 'quote') navigate('quotes', result.id);
    else if (result.kind === 'customer') navigate('customers');
    else navigate('products');
  }

  if (onboarding === null) {
    return <div className="flex h-full items-center justify-center text-sm text-subtle">Arbeitsbereich wird geladen…</div>;
  }
  if (onboarding) {
    return (
      <OnboardingWizard
        onFinish={() => { setOnboarding(false); setOnboardingClosable(false); }}
        onSkip={onboardingClosable ? () => { setOnboarding(false); setOnboardingClosable(false); } : undefined}
      />
    );
  }

  const invoiceId = route.id === 'new' ? null : route.id;
  const quoteId = route.id === 'new' ? null : route.id;

  return (
    <>
      <AppShell
        active={activeNavigation(route.page)}
        onNavigate={(page) => navigate(page)}
        onGlobalSearch={(query) => navigate('search', undefined, query)}
      >
        {route.page === 'dashboard' && <Dashboard onNavigate={(page) => navigate(page)} />}
        {route.page === 'invoices' && <Invoices initialQuery={route.query} initialId={invoiceId} />}
        {route.page === 'quotes' && <Quotes initialQuery={route.query} initialId={quoteId} />}
        {route.page === 'credit-notes' && <CreditNotes />}
        {route.page === 'customers' && <Customers onOpen={() => navigate('customers')} />}
        {route.page === 'products' && <Products />}
        {route.page === 'discounts' && <Discounts />}
        {route.page === 'outbox' && <Outbox />}
        {route.page === 'reports' && <Reports />}
        {route.page === 'tax' && <TaxCenter />}
        {route.page === 'settings' && <Settings />}
        {route.page === 'license' && <License />}
        {route.page === 'help' && <Help />}
        {route.page === 'search' && route.query && <SearchResults query={route.query} onOpen={openSearchResult} />}
      </AppShell>
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
