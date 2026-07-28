'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/uebersicht', label: 'Übersicht' },
  { href: '/licenses', label: 'Lizenzen' },
  { href: '/kunden', label: 'Kunden' },
  { href: '/audit-log', label: 'Audit-Log' },
] as const;

/**
 * Persistente Seitennavigation fuer den authentifizierten Bereich. Reine
 * clientseitige Aktiv-Erkennung ueber usePathname, keine Server-Roundtrip
 * noetig. Folgt demselben Sidebar-Muster wie AppShell in der Desktop-App
 * (apps/desktop/src/components/AppShell.tsx), reduziert auf das, was ein
 * Admin-Panel braucht.
 */
export function Nav() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      const csrfToken = sessionStorage.getItem('csrf') ?? '';
      await fetch('/api/v1/admin/session', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
    } finally {
      sessionStorage.removeItem('csrf');
      window.location.href = '/';
    }
  }

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex h-screen w-[var(--n-sidebar-width)] shrink-0 flex-col border-r border-border bg-sidebar"
    >
      <div className="flex h-12 items-center gap-2.5 px-4">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
          style={{ background: 'var(--n-canvas)', border: '1.5px solid var(--n-primary)' }}
        >
          N
        </span>
        <span className="text-sm font-semibold tracking-tight">Noctura Admin</span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'block rounded px-2.5 py-1.5 text-sm transition-colors',
                  active ? 'n-state-rail bg-primary-soft text-text' : 'text-muted hover:bg-surface hover:text-text',
                ].join(' ')}
                style={active ? { ['--rail' as string]: 'var(--n-primary)' } : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={loggingOut}
        onClick={() => void logout()}
        className="border-t border-border px-4 py-3 text-left text-xs text-subtle hover:text-text disabled:opacity-40"
      >
        {loggingOut ? 'Wird abgemeldet…' : 'Abmelden'}
      </button>
    </nav>
  );
}
