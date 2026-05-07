-- Migration 0002: Angebote, Gutschriften, Vorlagen, E-Mail, Anhaenge,
-- Tags, benutzerdefinierte Felder, Benutzer und Rollen, wiederkehrende Rechnungen.

PRAGMA foreign_keys = ON;

CREATE TABLE quote (
  id                 TEXT PRIMARY KEY,
  number             TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','finalized','sent','accepted','rejected','expired','converted','archived')),
  customer_id        TEXT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  issue_date         TEXT NOT NULL,
  valid_until        TEXT NOT NULL,
  converted_invoice_id TEXT REFERENCES invoice(id) ON DELETE SET NULL,
  version            INTEGER NOT NULL DEFAULT 1,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  prices_include_tax INTEGER NOT NULL DEFAULT 0,
  tax_scheme         TEXT NOT NULL DEFAULT 'standard',
  intro_text         TEXT, outro_text TEXT, internal_note TEXT,
  document_discount_kind TEXT CHECK (document_discount_kind IN ('percent','fixed')),
  document_discount_value INTEGER,
  net_total_cents    INTEGER NOT NULL DEFAULT 0,
  tax_total_cents    INTEGER NOT NULL DEFAULT 0,
  gross_total_cents  INTEGER NOT NULL DEFAULT 0,
  company_snapshot_json TEXT, customer_snapshot_json TEXT,
  pdf_path TEXT, pdf_checksum TEXT,
  finalized_at TEXT, deleted_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX quote_number_unique ON quote(number) WHERE number IS NOT NULL;

CREATE TABLE quote_item (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quote(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'item',
  product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
  description TEXT, description_extra TEXT,
  quantity_milli INTEGER NOT NULL DEFAULT 0,
  unit_id TEXT REFERENCES unit(id) ON DELETE RESTRICT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  discount_kind TEXT, discount_value INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  line_net_cents INTEGER NOT NULL DEFAULT 0,
  line_tax_cents INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX quote_item_position ON quote_item(quote_id, position);

CREATE TABLE credit_note (
  id TEXT PRIMARY KEY,
  number TEXT,
  kind TEXT NOT NULL DEFAULT 'credit_note' CHECK (kind IN ('credit_note','cancellation')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','finalized','sent','settled','archived')),
  -- Eine Gutschrift ohne Bezug zur Ursprungsrechnung ist fachlich wertlos.
  origin_invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  issue_date TEXT NOT NULL,
  reason TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_scheme TEXT NOT NULL DEFAULT 'standard',
  net_total_cents INTEGER NOT NULL DEFAULT 0,
  tax_total_cents INTEGER NOT NULL DEFAULT 0,
  gross_total_cents INTEGER NOT NULL DEFAULT 0,
  company_snapshot_json TEXT, customer_snapshot_json TEXT,
  pdf_path TEXT, pdf_checksum TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX credit_note_number_unique ON credit_note(number) WHERE number IS NOT NULL;
CREATE INDEX credit_note_origin ON credit_note(origin_invoice_id);

CREATE TABLE credit_note_item (
  id TEXT PRIMARY KEY,
  credit_note_id TEXT NOT NULL REFERENCES credit_note(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  origin_item_id TEXT,
  description TEXT,
  quantity_milli INTEGER NOT NULL DEFAULT 0,
  unit_id TEXT REFERENCES unit(id) ON DELETE RESTRICT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  line_net_cents INTEGER NOT NULL DEFAULT 0,
  line_tax_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE document_template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  doc_types TEXT NOT NULL DEFAULT 'invoice,quote,credit_note',
  is_default INTEGER NOT NULL DEFAULT 0,
  layout_json TEXT NOT NULL,
  custom_css TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX template_one_default ON document_template(is_default) WHERE is_default = 1;

CREATE TABLE document_template_version (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES document_template(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (template_id, version)
);

CREATE TABLE email_account (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'custom',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  security TEXT NOT NULL DEFAULT 'starttls' CHECK (security IN ('tls','starttls','none')),
  username TEXT NOT NULL,
  -- Nur die Referenz in den Schluesselbund. Das Passwort steht nie in SQLite.
  secret_ref TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  reply_to TEXT, bcc TEXT,
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  max_attachment_mb INTEGER NOT NULL DEFAULT 10,
  is_default INTEGER NOT NULL DEFAULT 1,
  last_test_at TEXT, last_test_result TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE email_template (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE
    CHECK (kind IN ('invoice','quote','reminder','dunning_1','dunning_2','dunning_3','credit_note','payment_confirmation')),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE email_queue_item (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  document_type TEXT, document_id TEXT,
  to_addr TEXT NOT NULL, cc_addr TEXT, bcc_addr TEXT,
  subject TEXT NOT NULL, body_text TEXT NOT NULL, body_html TEXT,
  attachments_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT, last_error_detail TEXT,
  created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX email_queue_due ON email_queue_item(status, next_attempt_at);

CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  queue_item_id TEXT REFERENCES email_queue_item(id) ON DELETE SET NULL,
  at TEXT NOT NULL,
  recipients TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE dunning_level (
  id TEXT PRIMARY KEY,
  step INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  days_after_due INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  interest_rate_bp INTEGER NOT NULL DEFAULT 0,
  email_template_kind TEXT
);

CREATE TABLE dunning_history (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  interest_cents INTEGER NOT NULL DEFAULT 0,
  pdf_path TEXT
);
CREATE INDEX dunning_history_invoice ON dunning_history(invoice_id, step);

CREATE TABLE attachment (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('customer','invoice','quote','product','payment','credit_note')),
  object_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX attachment_object ON attachment(object_type, object_id);

CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#7C6BF5'
);
CREATE TABLE tag_link (
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  PRIMARY KEY (tag_id, object_type, object_id)
);

CREATE TABLE custom_field (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('customer','product','invoice')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','date','boolean','select')),
  options_json TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (object_type, key)
);
CREATE TABLE custom_field_value (
  field_id TEXT NOT NULL REFERENCES custom_field(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (field_id, object_id)
);

CREATE TABLE app_user (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'administrator'
    CHECK (role IN ('administrator','accounting','employee','read_only')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE role_permission (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE recurring_invoice (
  id TEXT PRIMARY KEY,
  template_invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly')),
  interval_count INTEGER NOT NULL DEFAULT 1,
  next_run_date TEXT NOT NULL,
  end_date TEXT,
  auto_finalize INTEGER NOT NULL DEFAULT 0,
  auto_send INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_id TEXT REFERENCES customer(id) ON DELETE SET NULL,
  cost_center TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE backup_record (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  app_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  validated_at TEXT
);

CREATE TABLE import_job (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customers','products','invoices')),
  source_file TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  report_json TEXT,
  -- Ermoeglicht das Rueckgaengigmachen: alle in diesem Lauf erzeugten IDs.
  created_ids_json TEXT,
  undone_at TEXT
);

INSERT INTO dunning_level (id, step, name, days_after_due, fee_cents, interest_rate_bp, email_template_kind) VALUES
  ('dl-0', 0, 'Zahlungserinnerung', 3, 0, 0, 'reminder'),
  ('dl-1', 1, 'Erste Mahnung', 10, 0, 0, 'dunning_1'),
  ('dl-2', 2, 'Zweite Mahnung', 20, 500, 0, 'dunning_2'),
  ('dl-3', 3, 'Letzte Mahnung', 30, 1000, 0, 'dunning_3');

INSERT INTO role_permission (role, permission) VALUES
  ('administrator','*'),
  ('accounting','invoices.create'), ('accounting','invoices.finalize'),
  ('accounting','invoices.send'), ('accounting','invoices.cancel'),
  ('accounting','payments.edit'), ('accounting','customers.edit'),
  ('accounting','products.edit'), ('accounting','exports.run'),
  ('accounting','audit.view'),
  ('employee','invoices.create'), ('employee','customers.edit'), ('employee','products.edit'),
  ('read_only','invoices.read'), ('read_only','customers.read'), ('read_only','products.read');

INSERT INTO app_migration (version, name, applied_at)
  VALUES (2, '0002_belege_und_kommunikation', datetime('now'));
