import { headers } from 'next/headers';

interface License {
  id: string;
  keyPrefix: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  maxDevices: number;
  owner: { name: string; email: string };
  _count: { devices: number };
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--n-state-paid)',
  trial: 'var(--n-state-sent)',
  expired: 'var(--n-state-partially)',
  blocked: 'var(--n-state-overdue)',
  archived: 'var(--n-state-cancelled)',
};

async function loadLicenses(): Promise<License[]> {
  const response = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/admin/licenses`, {
    headers: { cookie: headers().get('cookie') ?? '' },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const body = await response.json();
  return body.licenses ?? [];
}

export default async function LicensesPage() {
  const licenses = await loadLicenses();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Lizenzen</h1>
        <a href="/licenses/new" className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white">
          Lizenz erstellen
        </a>
      </div>

      {licenses.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-medium">Noch keine Lizenz angelegt</p>
          <p className="mt-1 text-sm text-muted">
            Erstellen Sie die erste Lizenz. Der Schlüssel wird genau einmal angezeigt.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-subtle">
              <th scope="col" className="border-b border-border py-2 pl-3">Schlüssel</th>
              <th scope="col" className="border-b border-border py-2">Inhaber</th>
              <th scope="col" className="border-b border-border py-2">Tarif</th>
              <th scope="col" className="border-b border-border py-2">Status</th>
              <th scope="col" className="border-b border-border py-2">Geräte</th>
              <th scope="col" className="border-b border-border py-2">Läuft ab</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((license) => (
              <tr key={license.id} className="n-state-rail hover:bg-surface"
                  style={{ ['--rail' as string]: STATUS_COLOR[license.status] ?? 'var(--n-state-draft)' }}>
                <td className="border-b border-divider py-2 pl-3 font-mono text-xs">{license.keyPrefix}…</td>
                <td className="border-b border-divider">{license.owner?.name}</td>
                <td className="border-b border-divider">{license.plan}</td>
                <td className="border-b border-divider">{license.status}</td>
                <td className="border-b border-divider">{license._count?.devices ?? 0} / {license.maxDevices}</td>
                <td className="border-b border-divider text-muted">
                  {license.expiresAt ? license.expiresAt.slice(0, 10) : 'unbefristet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
