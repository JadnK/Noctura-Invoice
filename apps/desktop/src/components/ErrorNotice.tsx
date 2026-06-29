import { useState } from 'react';
import type { ApiError } from '../lib/api';

/**
 * Fehleranzeige: was passiert ist, woran es liegt, was zu tun ist. Technische
 * Einzelheiten bleiben eingeklappt, die Fehler-ID ist kopierbar.
 */
export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-4">
      <p className="font-medium" style={{ color: 'var(--n-danger)' }}>{error.info.title}</p>
      <p className="mt-1 text-sm text-muted">{error.info.cause}</p>
      <p className="mt-1 text-sm">{error.info.fix}</p>

      <div className="mt-3 flex items-center gap-2">
        {error.info.retryable && onRetry && (
          <button type="button" onClick={onRetry} className="rounded border border-border px-2 py-1 text-sm hover:bg-raised">
            Erneut versuchen
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="text-xs text-subtle hover:text-text"
        >
          {open ? 'Technische Details ausblenden' : 'Technische Details'}
        </button>
      </div>

      {open && (
        <pre className="mt-2 overflow-x-auto rounded bg-canvas p-2 text-xs text-muted">
          {error.info.code}
          {error.detail ? `\n${error.detail}` : ''}
        </pre>
      )}
    </div>
  );
}
