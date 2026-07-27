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

export interface Customer {
  id: string;
  number: string;
  type: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  vatId: string | null;
  taxStatus: string;
  paymentTermsDays: number | null;
  discountBp: number;
  archivedAt: string | null;
}

export interface CustomerDetail extends Customer {
  street: string | null;
  houseNo: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
}

export interface CustomerInput {
  kind: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  vatId?: string;
  taxStatus: string;
  paymentTermsDays?: number;
  discountBp: number;
  street?: string;
  houseNo?: string;
  postalCode?: string;
  city?: string;
  country?: string;
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

export interface LicenseState {
  status: string;
  plan: string | null;
  features: string[];
  expiresAt: string | null;
  lastOnlineAt: string | null;
  graceDays: number;
  checkIntervalH: number;
  deviceId: string;
}

export interface CompanySession {
  userId: string;
  licenseId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
}

export interface CompanyUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface EmailSettings {
  provider: string;
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password?: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string;
  bcc?: string;
  hasPassword: boolean;
}

export const api = {
  dashboard: () => call<DashboardData>('dashboard_data'),
  customers: (query?: string, includeArchived = false) =>
    call<Customer[]>('list_customers', { query: query || undefined, includeArchived }),
  customer: (id: string) => call<CustomerDetail | null>('get_customer', { id }),
  createCustomer: (input: CustomerInput) => call<Customer>('create_customer', { input }),
  updateCustomer: (id: string, input: CustomerInput) => call<Customer>('update_customer', { id, input }),
  archiveCustomer: (id: string) => call<string>('archive_customer', { id }),
  products: (query?: string) => call<unknown[]>('list_products', { query }),
  calculate: (input: unknown) => call<unknown>('calculate_preview', { input }),
  finalize: (invoiceId: string, input: unknown, expectedGrossCents: number) =>
    call<{ number: string; finalizedAt: string }>('finalize_invoice', { invoiceId, input, expectedGrossCents }),
  cancelInvoice: (invoiceId: string, reason: string) => call<string>('cancel_invoice', { invoiceId, reason }),

  licenseStatus: () => call<LicenseState>('license_status'),
  activateLicense: (key: string) => call<LicenseState>('activate_license', { key }),
  storedLicenseKey: () => call<string | null>('stored_license_key'),
  heartbeat: () => call<LicenseState>('license_heartbeat'),

  companySessionStatus: () => call<CompanySession | null>('company_session_status'),
  registerCompanyAccount: (licenseKey: string, email: string, password: string, displayName: string) =>
    call<CompanySession>('register_company_account', { licenseKey, email, password, displayName }),
  loginCompanyAccount: (licenseKey: string, email: string, password: string) =>
    call<CompanySession>('login_company_account', { licenseKey, email, password }),
  logoutCompanyAccount: () => call<void>('logout_company_account'),
  listCompanyUsers: () => call<CompanyUserSummary[]>('list_company_users'),
  createCompanyUser: (email: string, password: string, displayName: string, role: 'admin' | 'member') =>
    call<CompanyUserSummary>('create_company_user', { email, password, displayName, role }),

  createBackup: (targetDir: string, password?: string) =>
    call<{ path: string; sizeBytes: number; encrypted: boolean }>('create_backup', { targetDir, password }),
  inspectBackup: (path: string, password?: string) => call<Record<string, unknown>>('inspect_backup', { path, password }),
  restoreBackup: (path: string, password?: string) => call<string>('restore_backup', { path, password }),

  getEmailSettings: () => call<EmailSettings | null>('get_email_settings'),
  saveEmailSettings: (settings: EmailSettings) => call<void>('save_email_settings', { settings }),
  testEmailConnection: (host: string, port: number, security: string, username: string, password?: string) =>
    call<void>('test_email_connection', { host, port, security, username, password }),
};
