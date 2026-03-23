-- Noctura Invoice, lokale Datenbank, Migration 0001
-- Geldbetraege: INTEGER in Cent. Steuersaetze und Rabatte: Basispunkte.
-- Mengen: Milli-Einheiten. Nirgends REAL.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE company_profile (
  id                TEXT PRIMARY KEY,
  legal_name        TEXT NOT NULL,
  legal_form        TEXT,
  owner_first_name  TEXT,
  owner_last_name   TEXT,
  phone             TEXT,
  mobile            TEXT,
  email             TEXT,
  website           TEXT,
  support_email     TEXT,
  register_court    TEXT,
  register_number   TEXT,
  managing_director TEXT,
  vat_id            TEXT,
  tax_number        TEXT,
  creditor_id       TEXT,
  logo_path         TEXT,
  stamp_path        TEXT,
  signature_path    TEXT,
  accent_color      TEXT NOT NULL DEFAULT '#7C6BF5',
  footer_text       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE company_address (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES company_profile(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('main','billing','shipping')),
  street      TEXT, house_no TEXT, addition TEXT,
  postal_code TEXT, city TEXT, state TEXT,
  country     TEXT NOT NULL DEFAULT 'DE'
);

CREATE TABLE bank_account (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES company_profile(id) ON DELETE CASCADE,
  holder     TEXT NOT NULL,
  bank_name  TEXT,
  iban       TEXT NOT NULL,
  bic        TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1))
);
CREATE UNIQUE INDEX bank_account_one_default
  ON bank_account(company_id) WHERE is_default = 1;

CREATE TABLE tax_setting (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES company_profile(id) ON DELETE CASCADE,
  scheme              TEXT NOT NULL DEFAULT 'standard'
                        CHECK (scheme IN ('standard','small_business','reverse_charge','intra_community','tax_exempt')),
  default_rate_bp     INTEGER NOT NULL DEFAULT 1900 CHECK (default_rate_bp BETWEEN 0 AND 10000),
  prices_include_tax  INTEGER NOT NULL DEFAULT 0 CHECK (prices_include_tax IN (0,1)),
  taxation_method     TEXT NOT NULL DEFAULT 'actual' CHECK (taxation_method IN ('actual','accrual')),
  show_line_tax       INTEGER NOT NULL DEFAULT 1,
  show_tax_summary    INTEGER NOT NULL DEFAULT 1,
  custom_tax_note     TEXT,
  small_business_note TEXT NOT NULL DEFAULT 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  default_country     TEXT NOT NULL DEFAULT 'DE'
);

CREATE TABLE unit (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE customer (
  id                 TEXT PRIMARY KEY,
  number             TEXT NOT NULL UNIQUE,
  type               TEXT NOT NULL DEFAULT 'business'
                       CHECK (type IN ('private','business','association','public','other')),
  company            TEXT,
  salutation         TEXT, title TEXT, first_name TEXT, last_name TEXT,
  contact_person     TEXT, department TEXT,
  email              TEXT, phone TEXT, mobile TEXT, website TEXT,
  vat_id             TEXT, tax_number TEXT,
  tax_status         TEXT NOT NULL DEFAULT 'domestic'
                       CHECK (tax_status IN ('domestic','eu_business','eu_private','third_country')),
  preferred_language TEXT NOT NULL DEFAULT 'de',
  preferred_currency TEXT NOT NULL DEFAULT 'EUR',
  payment_terms_days INTEGER,
  discount_bp        INTEGER NOT NULL DEFAULT 0 CHECK (discount_bp BETWEEN 0 AND 10000),
  default_tax_rate_bp INTEGER,
  notes              TEXT,
  archived_at        TEXT,
  deleted_at         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX customer_search ON customer(company, last_name, email);
CREATE INDEX customer_active ON customer(archived_at, deleted_at);

CREATE TABLE customer_address (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('billing','shipping')),
  company     TEXT, name TEXT, street TEXT, house_no TEXT, addition TEXT,
  postal_code TEXT, city TEXT, state TEXT,
  country     TEXT NOT NULL DEFAULT 'DE'
);

CREATE TABLE product (
  id                  TEXT PRIMARY KEY,
  sku                 TEXT NOT NULL UNIQUE,
  ean                 TEXT,
  name                TEXT NOT NULL,
  short_description   TEXT,
  description         TEXT,
  category_id         TEXT,
  kind                TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product','service')),
  net_price_cents     INTEGER NOT NULL DEFAULT 0,
  purchase_price_cents INTEGER,
  tax_rate_bp         INTEGER NOT NULL DEFAULT 1900,
  unit_id             TEXT REFERENCES unit(id) ON DELETE RESTRICT,
  quantity_step_milli INTEGER NOT NULL DEFAULT 1000,
  default_quantity_milli INTEGER NOT NULL DEFAULT 1000,
  default_discount_bp INTEGER NOT NULL DEFAULT 0,
  image_path          TEXT,
  notes               TEXT,
  archived_at         TEXT,
  deleted_at          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE discount (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  code             TEXT UNIQUE,
  description      TEXT,
  kind             TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value            INTEGER NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'document'
                     CHECK (scope IN ('document','line','customer','product','quantity')),
  min_order_cents  INTEGER NOT NULL DEFAULT 0,
  max_uses         INTEGER,
  used_count       INTEGER NOT NULL DEFAULT 0,
  valid_from       TEXT, valid_to TEXT,
  combinable       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL
);

CREATE TABLE number_sequence (
  id                 TEXT PRIMARY KEY,
  doc_type           TEXT NOT NULL UNIQUE
                       CHECK (doc_type IN ('invoice','quote','credit_note','cancellation','customer','product')),
  pattern            TEXT NOT NULL,
  next_counter       INTEGER NOT NULL DEFAULT 1,
  padding            INTEGER NOT NULL DEFAULT 5,
  reset_mode         TEXT NOT NULL DEFAULT 'yearly' CHECK (reset_mode IN ('never','yearly','monthly')),
  last_reset_period  TEXT
);

CREATE TABLE invoice (
  id                     TEXT PRIMARY KEY,
  number                 TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','finalized','sent','delivered','partially_paid',
                                             'paid','overdue','cancelled','uncollectible','archived')),
  customer_id            TEXT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  issue_date             TEXT NOT NULL,
  service_date           TEXT,
  service_period_from    TEXT,
  service_period_to      TEXT,
  due_date               TEXT NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'EUR',
  language               TEXT NOT NULL DEFAULT 'de',
  template_id            TEXT,
  prices_include_tax     INTEGER NOT NULL DEFAULT 0,
  tax_scheme             TEXT NOT NULL DEFAULT 'standard',
  company_snapshot_json  TEXT,
  customer_snapshot_json TEXT,
  reference              TEXT, order_number TEXT, project TEXT, contact_person TEXT,
  intro_text             TEXT, outro_text TEXT,
  internal_note          TEXT, public_note TEXT,
  document_discount_kind TEXT CHECK (document_discount_kind IN ('percent','fixed')),
  document_discount_value INTEGER,
  subtotal_cents         INTEGER NOT NULL DEFAULT 0,
  discount_total_cents   INTEGER NOT NULL DEFAULT 0,
  net_total_cents        INTEGER NOT NULL DEFAULT 0,
  tax_total_cents        INTEGER NOT NULL DEFAULT 0,
  gross_total_cents      INTEGER NOT NULL DEFAULT 0,
  paid_cents             INTEGER NOT NULL DEFAULT 0,
  pdf_path               TEXT,
  pdf_checksum           TEXT,
  finalized_at           TEXT,
  cancelled_by_id        TEXT REFERENCES invoice(id) ON DELETE RESTRICT,
  deleted_at             TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
-- Eine vergebene Rechnungsnummer existiert genau einmal. Entwuerfe haben keine.
CREATE UNIQUE INDEX invoice_number_unique ON invoice(number) WHERE number IS NOT NULL;
CREATE INDEX invoice_status_due ON invoice(status, due_date);
CREATE INDEX invoice_customer ON invoice(customer_id, issue_date);

CREATE TABLE invoice_item (
  id                  TEXT PRIMARY KEY,
  invoice_id          TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'item'
                        CHECK (kind IN ('item','heading','text','subtotal','page_break')),
  product_id          TEXT REFERENCES product(id) ON DELETE SET NULL,
  description         TEXT,
  description_extra   TEXT,
  quantity_milli      INTEGER NOT NULL DEFAULT 0,
  unit_id             TEXT REFERENCES unit(id) ON DELETE RESTRICT,
  unit_price_cents    INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp         INTEGER NOT NULL DEFAULT 0,
  discount_kind       TEXT CHECK (discount_kind IN ('percent','fixed')),
  discount_value      INTEGER,
  hidden              INTEGER NOT NULL DEFAULT 0,
  line_net_cents      INTEGER NOT NULL DEFAULT 0,
  line_tax_cents      INTEGER NOT NULL DEFAULT 0,
  service_date        TEXT
);
CREATE UNIQUE INDEX invoice_item_position ON invoice_item(invoice_id, position);

CREATE TABLE invoice_tax_summary (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  tax_rate_bp INTEGER NOT NULL,
  net_cents   INTEGER NOT NULL,
  tax_cents   INTEGER NOT NULL,
  UNIQUE (invoice_id, tax_rate_bp)
);

CREATE TABLE invoice_payment (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  paid_on         TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  method          TEXT NOT NULL DEFAULT 'transfer'
                    CHECK (method IN ('transfer','cash','paypal','card','direct_debit','other')),
  reference       TEXT,
  note            TEXT,
  bank_account_id TEXT REFERENCES bank_account(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX invoice_payment_invoice ON invoice_payment(invoice_id, paid_on);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  action      TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id   TEXT NOT NULL,
  old_json    TEXT,
  new_json    TEXT,
  user_id     TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  source      TEXT NOT NULL,
  prev_hash   TEXT NOT NULL,
  entry_hash  TEXT NOT NULL UNIQUE
);
CREATE INDEX audit_log_object ON audit_log(object_type, object_id, at);

CREATE TABLE license_cache (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  token_payload  TEXT,
  token_signature TEXT,
  status         TEXT NOT NULL DEFAULT 'unlicensed',
  last_online_at TEXT,
  expires_at     TEXT,
  device_id      TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE app_migration (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

INSERT INTO unit (id, code, label, is_builtin) VALUES
  ('u-stk','stk','Stück',1), ('u-h','h','Stunde',1), ('u-tag','tag','Tag',1),
  ('u-woche','woche','Woche',1), ('u-monat','monat','Monat',1), ('u-jahr','jahr','Jahr',1),
  ('u-km','km','Kilometer',1), ('u-m','m','Meter',1), ('u-m2','m2','Quadratmeter',1),
  ('u-kg','kg','Kilogramm',1), ('u-l','l','Liter',1), ('u-pausch','pausch','Pauschale',1),
  ('u-lizenz','lizenz','Lizenz',1), ('u-user','user','Benutzer',1), ('u-projekt','projekt','Projekt',1);

INSERT INTO number_sequence (id, doc_type, pattern, next_counter, padding, reset_mode) VALUES
  ('ns-invoice','invoice','RE-{YYYY}-{COUNTER}',1,5,'yearly'),
  ('ns-quote','quote','ANG-{YYYY}-{COUNTER}',1,5,'yearly'),
  ('ns-credit','credit_note','GS-{YYYY}-{COUNTER}',1,5,'yearly'),
  ('ns-cancel','cancellation','ST-{YYYY}-{COUNTER}',1,5,'yearly'),
  ('ns-customer','customer','KD-{COUNTER}',1,4,'never'),
  ('ns-product','product','PR-{COUNTER}',1,4,'never');

INSERT INTO app_migration (version, name, applied_at)
  VALUES (1, '0001_init', datetime('now'));
