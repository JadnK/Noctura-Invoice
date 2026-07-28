import { headers } from 'next/headers';

interface OwnerLicense {
  id: string;
  plan: string;
  status: string;
  expiresAt: string | null;
}

interface Owner {
  id: string;
  name: string;
  email: string;
  note: string | null;
  createdAt: string;
  licenseCount: number;
  licenses: OwnerLicense[];
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--n-state-paid)',
  trial: 'var(--n-state-sent)',
  expired: 'var(--n-state-partially)',
  blocked: 'var(--n-state-overdue)',
  archived: 'var(--n-state-cancelled)',
};

async function loadOwners(): Promise<Owner[]> {
  const response = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/admin/owners`, {
    headers: { cookie: headers().get('cookie') ?? '' },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const body = await response.json();
  return body.owners ?? [];
}

export default async function OwnersPage() {
  const owners = await loadOwners();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Kunden</h1>
        <p className="mt-1 text-sm text-muted">Lizenzinhaber mit ihren jeweiligen Lizenzen.</p>
      </div>

      {owners.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-medium">Noch kein Kunde angelegt</p>
          <p className="mt-1 text-sm text-muted">
            Kunden entstehen automatisch, sobald für sie eine Lizenz erstellt wird.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {owners.map((owner) => (
            <li key={owner.id} className="overflow-hidden rounded-lg border border-border bg-surface shadow-elev1">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 hover:bg-raised">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{owner.name}</p>
                    <p className="truncate text-sm text-muted">{owner.email}</p>
                    {owner.note && <p className="mt-1 truncate text-sm text-subtle">{owner.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-primary-soft px-3 py-1 text-xs text-text">
                      {owner.licenseCount} {owner.licenseCount === 1 ? 'Lizenz' : 'Lizenzen'}
                    </span>
                    <span aria-hidden className="text-subtle transition-transform group-open:rotate-90">›</span>
                  </div>
                </summary>

                <div className="border-t border-border px-4 pb-4 pt-3">
                  {owner.licenses.length === 0 ? (
                    <p className="text-sm text-subtle">Keine Lizenzen für diesen Kunden.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-subtle">
                          <th scope="col" className="border-b border-divider py-1.5">Tarif</th>
                          <th scope="col" className="border-b border-divider py-1.5">Status</th>
                          <th scope="col" className="border-b border-divider py-1.5">Läuft ab</th>
                          <th scope="col" className="border-b border-divider py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {owner.licenses.map((license) => (
                          <tr
                            key={license.id}
                            className="n-state-rail"
                            style={{ ['--rail' as string]: STATUS_COLOR[license.status] ?? 'var(--n-state-draft)' }}
                          >
                            <td className="border-b border-divider py-1.5 pl-2">{license.plan}</td>
                            <td className="border-b border-divider">{license.status}</td>
                            <td className="border-b border-divider text-muted">
                              {license.expiresAt ? license.expiresAt.slice(0, 10) : 'unbefristet'}
                            </td>
                            <td className="border-b border-divider pr-2 text-right">
                              <a href={`/licenses/${license.id}`} className="text-sm" style={{ color: 'var(--n-primary)' }}>
                                Öffnen
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
