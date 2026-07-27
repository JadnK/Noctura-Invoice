/**
 * Typisierte Brücke zum lokalen Rust-Kern. Alle produktiven Seiten greifen
 * ausschließlich über diese Datei auf SQLite, PDF- und SMTP-Funktionen zu.
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
    throw new ApiError(
      payload?.code ?? 'E_UNKNOWN',
      payload?.message ?? String(error),
      payload?.detail,
    );
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

export interface Product {
  id: string;
  sku: string;
  name: string;
  kind: string;
  netPriceCents: number;
  taxRateBp: number;
  unitId: string | null;
  defaultDiscountBp: number;
  archivedAt: string | null;
}

export interface ProductInput {
  sku: string;
  name: string;
  kind: string;
  netPriceCents: number;
  taxRateBp: number;
  unitId?: string;
  defaultDiscountBp: number;
  shortDescription?: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  version: number;
  isDefault: boolean;
  updatedAt: string;
}

export interface TemplateDetail {
  id: string;
  name: string;
  version: number;
  isDefault: boolean;
  layoutJson: string;
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

export interface BusinessSettings {
  legalName: string;
  legalForm: string;
  ownerFirstName: string;
  ownerLastName: string;
  email: string;
  phone: string;
  website: string;
  vatId: string;
  taxNumber: string;
  creditorId: string;
  street: string;
  houseNo: string;
  postalCode: string;
  city: string;
  country: string;
  bankHolder: string;
  bankName: string;
  iban: string;
  bic: string;
  taxScheme: string;
  defaultTaxRateBp: number;
  pricesIncludeTax: boolean;
  taxationMethod: string;
  smallBusinessNote: string;
  invoicePattern: string;
  quotePattern: string;
  creditNotePattern: string;
  paymentTermsDays: number;
  logoPath: string;
}

export interface CalculationLineInput {
  id: string;
  kind: string;
  quantityMilli: number;
  unitPriceCents: number;
  taxRateBp: number;
  discountKind?: 'percent' | 'fixed';
  discountValue: number;
  hidden: boolean;
}

export interface CalculationInput {
  pricesIncludeTax: boolean;
  taxScheme: string;
  lines: CalculationLineInput[];
  documentDiscountKind?: 'percent' | 'fixed';
  documentDiscountValue: number;
  paidCents: number;
}

export interface CalculationResult {
  netTotalCents: number;
  taxTotalCents: number;
  grossTotalCents: number;
  documentDiscountCents: number;
  taxGroups: { taxRateBp: number; netCents: number; taxCents: number }[];
  openCents: number;
}

export interface DocumentLine {
  id: string;
  kind: string;
  productId?: string;
  description: string;
  descriptionExtra?: string;
  quantityMilli: number;
  unitId?: string;
  unitPriceCents: number;
  taxRateBp: number;
  discountKind?: 'percent' | 'fixed';
  discountValue: number;
  hidden: boolean;
  lineNetCents?: number;
  lineTaxCents?: number;
}

export interface InvoiceDraftInput {
  id?: string;
  customerId: string;
  issueDate: string;
  serviceDate?: string;
  dueDate: string;
  currency: string;
  templateId?: string;
  pricesIncludeTax: boolean;
  taxScheme: string;
  reference?: string;
  orderNumber?: string;
  project?: string;
  contactPerson?: string;
  introText?: string;
  outroText?: string;
  internalNote?: string;
  publicNote?: string;
  documentDiscountKind?: 'percent' | 'fixed';
  documentDiscountValue: number;
  lines: DocumentLine[];
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  issueDate: string;
  dueDate: string;
  grossTotalCents: number;
  paidCents: number;
  openCents: number;
  pdfPath: string | null;
  updatedAt: string;
}

export interface InvoiceDetail extends InvoiceDraftInput {
  id: string;
  number: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  paidCents: number;
  netTotalCents: number;
  taxTotalCents: number;
  grossTotalCents: number;
  pdfPath: string | null;
  finalizedAt: string | null;
}

export interface QuoteDraftInput {
  id?: string;
  customerId: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  templateId?: string;
  pricesIncludeTax: boolean;
  taxScheme: string;
  introText?: string;
  outroText?: string;
  internalNote?: string;
  documentDiscountKind?: 'percent' | 'fixed';
  documentDiscountValue: number;
  lines: DocumentLine[];
}

export interface QuoteSummary {
  id: string;
  number: string | null;
  status: string;
  customerName: string;
  issueDate: string;
  validUntil: string;
  grossTotalCents: number;
  convertedInvoiceId: string | null;
  pdfPath: string | null;
  updatedAt: string;
}

export interface QuoteDetail extends QuoteDraftInput {
  id: string;
  number: string | null;
  status: string;
  customerName: string;
  netTotalCents: number;
  taxTotalCents: number;
  grossTotalCents: number;
  convertedInvoiceId: string | null;
  pdfPath: string | null;
  finalizedAt: string | null;
}

export interface CreditNoteSummary {
  id: string;
  number: string | null;
  kind: string;
  status: string;
  originInvoiceId: string;
  originInvoiceNumber: string | null;
  customerName: string;
  issueDate: string;
  reason: string | null;
  grossTotalCents: number;
  pdfPath: string | null;
  templateId: string | null;
}

export interface Discount {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  kind: 'percent' | 'fixed';
  value: number;
  scope: string;
  minOrderCents: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validTo: string | null;
  combinable: boolean;
  active: boolean;
}

export interface DiscountInput {
  id?: string;
  name: string;
  code?: string;
  description?: string;
  kind: 'percent' | 'fixed';
  value: number;
  scope: string;
  minOrderCents: number;
  maxUses?: number;
  validFrom?: string;
  validTo?: string;
  combinable: boolean;
  active: boolean;
}

export interface ReportData {
  from: string;
  to: string;
  revenueGrossCents: number;
  revenueNetCents: number;
  taxCents: number;
  paidCents: number;
  outstandingCents: number;
  invoiceCount: number;
  averageInvoiceCents: number;
  monthly: { month: string; grossCents: number; netCents: number; invoiceCount: number }[];
  vat: { taxRateBp: number; netCents: number; taxCents: number }[];
  topCustomers: { customerName: string; grossCents: number; invoiceCount: number }[];
  statuses: { status: string; count: number; grossCents: number }[];
}

export interface Expense {
  id: string;
  expenseDate: string;
  vendor: string;
  description: string;
  category: string;
  receiptNumber: string | null;
  netCents: number;
  taxRateBp: number;
  inputTaxCents: number;
  grossCents: number;
  deductibleBp: number;
  paymentMethod: string;
  receiptPath: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface ExpenseInput {
  id?: string;
  expenseDate: string;
  vendor: string;
  description: string;
  category: string;
  receiptNumber?: string;
  netCents: number;
  taxRateBp: number;
  inputTaxCents: number;
  grossCents: number;
  deductibleBp: number;
  paymentMethod: string;
  receiptPath?: string;
  notes?: string;
}

export interface TaxYearSummary {
  year: number;
  taxationMethod: string;
  taxScheme: string;
  cashReceiptsGrossCents: number;
  cashReceiptsNetCents: number;
  receivedVatCents: number;
  expenseGrossCents: number;
  deductibleExpenseNetCents: number;
  deductibleInputTaxCents: number;
  cashResultCents: number;
  estimatedProfitCents: number;
  vatPayableCents: number;
  invoicedNetCents: number;
  invoicedTaxCents: number;
  creditNoteNetCents: number;
  creditNoteTaxCents: number;
  openReceivablesCents: number;
  outputTaxByRate: { taxRateBp: number; netCents: number; taxCents: number; grossCents: number }[];
  expenseCategories: { category: string; netCents: number; inputTaxCents: number; grossCents: number; deductibleCents: number }[];
  months: { month: string; receiptsCents: number; expensesCents: number; resultCents: number }[];
  openItems: { invoiceId: string; number: string; customerName: string; issueDate: string; dueDate: string; openCents: number }[];
}

export interface TaxExportResult {
  directory: string;
  files: string[];
  warnings: string[];
}

export interface OutboxEntry {
  id: string;
  kind: string;
  documentType: string | null;
  documentId: string | null;
  toAddr: string;
  subject: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface PdfExportResult {
  path: string;
  sha256: string;
  pages: number;
}

export interface SearchResult {
  id: string;
  kind: 'invoice' | 'quote' | 'customer' | 'product';
  title: string;
  subtitle: string;
}

export const api = {
  dashboard: () => call<DashboardData>('dashboard_data'),

  customers: (query?: string, includeArchived = false) =>
    call<Customer[]>('list_customers', { query: query || undefined, includeArchived }),
  customer: (id: string) => call<CustomerDetail | null>('get_customer', { id }),
  createCustomer: (input: CustomerInput) => call<Customer>('create_customer', { input }),
  updateCustomer: (id: string, input: CustomerInput) =>
    call<Customer>('update_customer', { id, input }),
  archiveCustomer: (id: string) => call<string>('archive_customer', { id }),

  products: (query?: string) => call<Product[]>('list_products', { query: query || undefined }),
  product: (id: string) => call<Product | null>('get_product', { id }),
  createProduct: (input: ProductInput) => call<Product>('create_product', { input }),
  updateProduct: (id: string, input: ProductInput) =>
    call<Product>('update_product', { id, input }),
  archiveProduct: (id: string) => call<string>('archive_product', { id }),
  units: () => call<[string, string][]>('list_units'),

  templates: () => call<TemplateSummary[]>('list_templates'),
  template: (id: string) => call<TemplateDetail | null>('get_template', { id }),
  createTemplate: (name: string, layoutJson: string) =>
    call<TemplateDetail>('create_template', { name, layoutJson }),
  updateTemplate: (id: string, name: string, layoutJson: string) =>
    call<TemplateDetail>('update_template', { id, name, layoutJson }),
  setDefaultTemplate: (id: string) => call<void>('set_default_template', { id }),
  deleteTemplate: (id: string) => call<void>('delete_template', { id }),

  calculate: (input: CalculationInput) =>
    call<CalculationResult>('calculate_preview', { input }),

  invoices: (query?: string, status?: string) =>
    call<InvoiceSummary[]>('list_invoices', { query: query || undefined, status: status || undefined }),
  invoice: (id: string) => call<InvoiceDetail | null>('get_invoice_draft', { id }),
  saveInvoice: (input: InvoiceDraftInput) => call<string>('save_invoice_draft', { input }),
  deleteInvoiceDraft: (id: string) => call<void>('delete_invoice_draft', { id }),
  finalize: (invoiceId: string, input: CalculationInput, expectedGrossCents: number) =>
    call<{ invoiceId: string; number: string; grossTotalCents: number; finalizedAt: string }>(
      'finalize_invoice',
      { invoiceId, input, expectedGrossCents },
    ),
  cancelInvoice: (invoiceId: string, reason: string) =>
    call<string>('cancel_invoice', { invoiceId, reason }),
  registerInvoicePayment: (
    invoiceId: string,
    paidOn: string,
    amountCents: number,
    method: string,
    reference?: string,
    note?: string,
  ) => call<void>('register_invoice_payment', {
    invoiceId,
    paidOn,
    amountCents,
    method,
    reference: reference || undefined,
    note: note || undefined,
  }),

  quotes: (query?: string, status?: string) =>
    call<QuoteSummary[]>('list_quotes', { query: query || undefined, status: status || undefined }),
  quote: (id: string) => call<QuoteDetail | null>('get_quote_draft', { id }),
  saveQuote: (input: QuoteDraftInput) => call<string>('save_quote_draft', { input }),
  deleteQuoteDraft: (id: string) => call<void>('delete_quote_draft', { id }),
  finalizeQuote: (id: string) => call<string>('finalize_quote', { id }),
  convertQuoteToInvoice: (id: string) => call<string>('convert_quote_to_invoice', { id }),
  updateQuoteStatus: (id: string, status: string) => call<void>('update_quote_status', { id, status }),

  creditNotes: () => call<CreditNoteSummary[]>('list_credit_notes'),
  createCreditNoteFromInvoice: (originInvoiceId: string, reason: string, templateId?: string) =>
    call<string>('create_credit_note_from_invoice', { originInvoiceId, reason, templateId }),
  finalizeCreditNote: (id: string) => call<string>('finalize_credit_note', { id }),

  discounts: () => call<Discount[]>('list_discounts'),
  saveDiscount: (input: DiscountInput) => call<string>('save_discount', { input }),
  setDiscountActive: (id: string, active: boolean) =>
    call<void>('set_discount_active', { id, active }),
  deleteDiscount: (id: string) => call<void>('delete_discount', { id }),

  reports: (from: string, to: string) => call<ReportData>('report_data', { from, to }),

  expenses: (year?: number) => call<Expense[]>('list_expenses', { year }),
  saveExpense: (input: ExpenseInput) => call<string>('save_expense', { input }),
  deleteExpense: (id: string) => call<void>('delete_expense', { id }),
  taxYearSummary: (year: number) => call<TaxYearSummary>('tax_year_summary', { year }),
  exportTaxPackage: (year: number, targetDir: string) =>
    call<TaxExportResult>('export_tax_package', { year, targetDir }),

  outbox: () => call<OutboxEntry[]>('list_outbox'),
  retryOutbox: (id: string) => call<void>('retry_outbox_item', { id }),
  cancelOutbox: (id: string) => call<void>('cancel_outbox_item', { id }),
  processOutbox: () => call<{ sent: number; failed: number }>('process_outbox_now'),
  queueInvoiceEmail: (invoiceId: string, to: string, subject: string, body: string) =>
    call<string>('queue_invoice_email', { invoiceId, to, subject, body }),

  generateDocumentPdf: (documentType: 'invoice' | 'quote' | 'credit_note', id: string) =>
    call<PdfExportResult>('generate_document_pdf', { documentType, id }),

  businessSettings: () => call<BusinessSettings>('get_business_settings'),
  saveBusinessSettings: (settings: BusinessSettings) =>
    call<void>('save_business_settings', { settings }),
  chooseCompanyLogo: () => call<string | null>('choose_company_logo'),
  removeCompanyLogo: () => call<void>('remove_company_logo'),
  companyLogoDataUrl: () => call<string | null>('company_logo_data_url'),
  onboardingStatus: () => call<boolean>('onboarding_status'),
  completeOnboarding: (settings: BusinessSettings) =>
    call<void>('complete_onboarding', { settings }),

  globalSearch: (query: string) => call<SearchResult[]>('global_search', { query }),

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
  createCompanyUser: (
    email: string,
    password: string,
    displayName: string,
    role: 'admin' | 'member',
  ) => call<CompanyUserSummary>('create_company_user', { email, password, displayName, role }),

  createBackup: (targetDir: string, password?: string) =>
    call<{ path: string; sizeBytes: number; encrypted: boolean }>('create_backup', {
      targetDir,
      password,
    }),
  inspectBackup: (path: string, password?: string) =>
    call<Record<string, unknown>>('inspect_backup', { path, password }),
  restoreBackup: (path: string, password?: string) =>
    call<string>('restore_backup', { path, password }),

  getEmailSettings: () => call<EmailSettings | null>('get_email_settings'),
  saveEmailSettings: (settings: EmailSettings) =>
    call<void>('save_email_settings', { settings }),
  testEmailConnection: (
    host: string,
    port: number,
    security: string,
    username: string,
    password?: string,
  ) => call<void>('test_email_connection', { host, port, security, username, password }),
};
