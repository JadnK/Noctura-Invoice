import { useState } from 'react';
import { GROUP_LABELS, NAVIGATION } from '../lib/navigation';
import type { NavItem } from '../lib/navigation';

/**
 * Grundlayout: einklappbare Sidebar, Titelleiste mit globaler Suche,
 * Hauptbereich, optionaler Detailbereich.
 */
export function AppShell({
  active, onNavigate, children, detail,
}: {
  active: string;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const groups = ['belege', 'stammdaten', 'system'] as const;

  return (
    <div className="flex h-full">
      <nav
        aria-label="Hauptnavigation"
        className="flex flex-col border-r border-border bg-sidebar transition-[width] duration-150"
        style={{ width: collapsed ? 'var(--n-sidebar-width-collapsed)' : 'var(--n-sidebar-width)' }}
      >
        <div className="flex h-12 items-center gap-2 px-3">
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Noctura</span>}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <section key={group} className="mb-4">
              {!collapsed && (
                <h2 className="px-2 pb-1 text-xs uppercase text-subtle" style={{ letterSpacing: 'var(--n-tracking-caps)' }}>
                  {GROUP_LABELS[group]}
                </h2>
              )}
              <ul>
                {NAVIGATION.filter((item: NavItem) => item.group === group).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      aria-current={active === item.id ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={[
                        'w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                        active === item.id
                          ? 'bg-primary-soft text-text'
                          : 'text-muted hover:bg-surface hover:text-text',
                      ].join(' ')}
                    >
                      {collapsed ? item.label.slice(0, 2) : item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="border-t border-border px-3 py-2 text-left text-xs text-subtle hover:text-text"
          aria-expanded={!collapsed}
        >
          {collapsed ? '›' : '‹ Navigation einklappen'}
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center gap-3 border-b border-border px-4"
          style={{ height: 'var(--n-titlebar-height)' }}
        >
          <label className="sr-only" htmlFor="global-search">Suche</label>
          <input
            id="global-search"
            type="search"
            placeholder="Rechnungen, Kunden, Produkte durchsuchen"
            className="w-full max-w-xl rounded border border-border bg-input px-3 py-1.5 text-sm placeholder:text-subtle"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-subtle">Strg + K</kbd>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
          {detail && (
            <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4 xl:block">
              {detail}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
