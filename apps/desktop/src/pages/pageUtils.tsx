import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { ErrorNotice } from '../components/ErrorNotice';

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError('E_UNKNOWN', String(error));
}

export function Loading({ label = 'Wird geladen…' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-subtle">{label}</p>;
}

export function EmptyState({ title, children, action }: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-elev1">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageError({ error, retry }: { error: ApiError; retry?: () => void }) {
  return <ErrorNotice error={error} onRetry={retry} />;
}

export function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}{required && <span aria-hidden className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-border bg-input px-2.5 py-1.5 text-sm outline-none focus:border-primary';

export const buttonPrimary =
  'rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

export const buttonSecondary =
  'rounded border border-border bg-surface px-3 py-1.5 text-sm hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50';

export const buttonDanger =
  'rounded border border-danger px-3 py-1.5 text-sm text-danger hover:bg-surface disabled:opacity-50';

export function parseEuro(value: string): number {
  const trimmed = value.trim().replace(/\s/g, '');
  if (!trimmed) return 0;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function formatEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function customerLabel(customer: {
  number: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
  return `${customer.number} · ${customer.company || person || 'Ohne Namen'}`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  finalized: 'Finalisiert',
  sent: 'Versendet',
  delivered: 'Zugestellt',
  partially_paid: 'Teilbezahlt',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
  uncollectible: 'Uneinbringlich',
  archived: 'Archiviert',
  accepted: 'Angenommen',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
  converted: 'Umgewandelt',
  settled: 'Verrechnet',
  queued: 'Wartend',
  sending: 'Wird gesendet',
  failed: 'Fehlgeschlagen',
};
