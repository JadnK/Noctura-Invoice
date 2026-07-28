import type { ReactNode } from 'react';
import { Nav } from '../_components/Nav';

/**
 * Layout fuer den authentifizierten Bereich (Uebersicht, Lizenzen, Kunden,
 * Audit-Log). Die Klammer im Ordnernamen ist eine Next.js Route-Group:
 * sie fasst diese Seiten fuer eine gemeinsame Navigation zusammen, ohne
 * das URL-Schema zu veraendern (/licenses bleibt /licenses). Der Login
 * (app/page.tsx) liegt bewusst ausserhalb, dort gibt es keine Navigation.
 */
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
