/**
 * Brücke zum Rust-Kern. Jeder Aufruf gibt entweder ein Ergebnis oder einen
 * Fehler mit stabilem Code zurück — die Oberfläche muss nie Fehlertexte parsen.
 */
import { invoke } from '@tauri-apps/api/core';
import { describeError } from './errors';
import type { ErrorInfo } from './errors';

export class ApiError extends Error {
  readonly info: ErrorInfo;
  readonly detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.info = describeError(code);
    this.detail = detail;
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const payload = error as { code?: string; message?: string; detail?: string };
    throw new ApiError(payload?.code ?? 'E_UNKNOWN', payload?.message ?? String(error), payload?.detail);
  }
}

export interface DashboardData {
  revenueMonthCents: number;
  revenueYearCents: number;
  openCents: number;
  overdueCents: number;
  draftCount: number;
  paidCount: number;
  cancelledCount: number;
  averagePaymentDays: number;
  activeCustomers: number;
  revenueSeries: { month: string; cents: number }[];
  statusSplit: { status: string; count: number }[];
  topProducts: { name: string; quantityMilli: number }[];
}

export const api = {
  dashboard: () => call<DashboardData>('dashboard_data'),
  customers: (query?: string) => call<unknown[]>('list_customers', { query, includeArchived: false }),
  products: (query?: string) => call<unknown[]>('list_products', { query }),
  calculate: (input: unknown) => call<unknown>('calculate_preview', { input }),
  finalize: (invoiceId: string, input: unknown, expectedGrossCents: number) =>
    call<{ number: string; finalizedAt: string }>('finalize_invoice', { invoiceId, input, expectedGrossCents }),
  cancelInvoice: (invoiceId: string, reason: string) => call<string>('cancel_invoice', { invoiceId, reason }),
  licenseStatus: () => call<Record<string, unknown>>('license_status'),
  activateLicense: (key: string) => call<Record<string, unknown>>('activate_license', { key }),
  heartbeat: () => call<Record<string, unknown>>('license_heartbeat'),
  createBackup: (targetDir: string, password?: string) =>
    call<{ path: string; sizeBytes: number; encrypted: boolean }>('create_backup', { targetDir, password }),
  inspectBackup: (path: string, password?: string) => call<Record<string, unknown>>('inspect_backup', { path, password }),
  restoreBackup: (path: string, password?: string) => call<string>('restore_backup', { path, password }),
};
