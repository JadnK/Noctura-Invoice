import { useState } from 'react';
import { evaluateLicense } from '@noctura/license-client';
import type { LicenseCache } from '@noctura/license-client';

const MODE_COLOR: Record<string, string> = {
  active: 'var(--n-success)',
  warning: 'var(--n-warning)',
  restricted: 'var(--n-danger)',
  unlicensed: 'var(--n-text-subtle)',
};

/**
 * Lizenzseite. Zeigt Zustand, Restlaufzeit, Offline-Toleranz und die Geräte.
 * Sie sagt immer dazu, was trotz Einschränkung noch möglich ist — niemand soll
 * fürchten müssen, nicht mehr an seine Belege zu kommen.
 */
export function License({ cache, devices = [] }: {
  cache: LicenseCache;
  devices?: readonly { deviceId: string; lastSeenAt: string; current: boolean }[];
}) {
  const [key, setKey] = useState('');
  const view = evaluateLicense(cache, new Date().toISOString());

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Lizenz</h1>

      <section className="n-state-rail rounded-lg border border-border bg-surface p-4"
               style={{ ['--rail' as string]: MODE_COLOR[view.mode] }}>
        <p className="font-medium">{view.headline}</p>
        <p className="mt-1 text-sm text-muted">{view.detail}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {view.daysUntilExpiry !== null && (
            <>
              <dt className="text-subtle">Restlaufzeit</dt>
              <dd>{view.daysUntilExpiry} Tage</dd>
            </>
          )}
          {view.offlineDaysLeft !== null && (
            <>
              <dt className="text-subtle">Offline nutzbar noch</dt>
              <dd>{view.offlineDaysLeft} Tage</dd>
            </>
          )}
        </dl>
      </section>

      {(view.mode === 'restricted' || view.mode === 'unlicensed') && (
        <section className="rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">Was weiterhin möglich bleibt</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
            <li>Rechnungen ansehen, suchen und filtern</li>
            <li>PDFs erneut erzeugen, drucken und exportieren</li>
            <li>Zahlungen erfassen</li>
            <li>Sicherungen erstellen und wiederherstellen</li>
          </ul>
          <p className="mt-2 text-muted">Gesperrt ist nur das Finalisieren neuer Belege und der E-Mail-Versand.</p>
        </section>
      )}

      <section className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-sm">Lizenzschlüssel</span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="NOCT-XXXXX-XXXXX-XXXXX-XXXXX"
            className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
          />
        </label>
        <button
          type="button"
          disabled={key.trim().length < 10}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Lizenz aktivieren
        </button>
      </section>

      {devices.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Geräte</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-subtle">
                <th scope="col" className="border-b border-border py-2">Gerät</th>
                <th scope="col" className="border-b border-border py-2">Zuletzt gesehen</th>
                <th scope="col" className="border-b border-border py-2"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.deviceId}>
                  <td className="border-b border-divider py-2 font-mono text-xs">
                    {device.deviceId.slice(0, 8)}… {device.current && <span className="text-subtle">(dieses Gerät)</span>}
                  </td>
                  <td className="border-b border-divider text-muted">{device.lastSeenAt.slice(0, 10)}</td>
                  <td className="border-b border-divider text-right">
                    {!device.current && (
                      <button type="button" className="text-xs" style={{ color: 'var(--n-danger)' }}>
                        Deaktivieren
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
