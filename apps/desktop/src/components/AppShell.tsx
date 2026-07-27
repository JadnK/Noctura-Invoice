import type { ReactNode } from 'react';
import { useState } from 'react';
import { GROUP_LABELS, NAVIGATION } from '../lib/navigation';
import type { NavItem } from '../lib/navigation';

export function AppShell({ active, onNavigate, onGlobalSearch, children, detail }: {
  active: string;
  onNavigate: (id: string) => void;
  onGlobalSearch: (query: string) => void;
  children: ReactNode;
  detail?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const groups = ['belege', 'stammdaten', 'system'] as const;

  return (
    <div className="flex h-full">
      <nav aria-label="Hauptnavigation" className="flex flex-col border-r border-border bg-sidebar transition-[width] duration-150" style={{ width: collapsed ? 'var(--n-sidebar-width-collapsed)' : 'var(--n-sidebar-width)' }}>
        <div className="flex h-12 items-center gap-2.5 px-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold" style={{ background: 'var(--n-canvas)', border: '1.5px solid var(--n-primary)' }}>N</span>{!collapsed && <span className="text-sm font-semibold tracking-tight">Noctura</span>}</div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{groups.map((group) => <section key={group} className="mb-4">{!collapsed && <h2 className="px-2 pb-1 text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>{GROUP_LABELS[group]}</h2>}<ul>{NAVIGATION.filter((item: NavItem) => item.group === group).map((item) => <li key={item.id}><button type="button" onClick={() => onNavigate(item.id)} aria-current={active === item.id ? 'page' : undefined} title={collapsed ? item.label : undefined} className={['w-full rounded px-2 py-1.5 text-left text-sm transition-colors', active === item.id ? 'n-state-rail bg-primary-soft text-text' : 'text-muted hover:bg-surface hover:text-text'].join(' ')} style={active === item.id ? { ['--rail' as string]: 'var(--n-primary)' } : undefined}>{collapsed ? item.label.slice(0, 2) : item.label}</button></li>)}</ul></section>)}</div>
        <button type="button" onClick={() => setCollapsed((value) => !value)} className="border-t border-border px-3 py-2 text-left text-xs text-subtle hover:text-text" aria-expanded={!collapsed}>{collapsed ? '›' : '‹ Navigation einklappen'}</button>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4" style={{ height: 'var(--n-titlebar-height)' }}>
          <form className="w-full max-w-xl" onSubmit={(event) => { event.preventDefault(); const query = search.trim(); if (query) onGlobalSearch(query); }}>
            <label className="sr-only" htmlFor="global-search">Suche</label>
            <input id="global-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechnungen, Angebote, Kunden, Produkte durchsuchen" className="w-full rounded border border-border bg-input px-3 py-1.5 text-sm placeholder:text-subtle" />
          </form>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-subtle">Strg + K</kbd>
        </header>
        <div className="flex min-h-0 flex-1"><main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>{detail && <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4 xl:block">{detail}</aside>}</div>
      </div>
    </div>
  );
}
