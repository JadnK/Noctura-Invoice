-- Lokal erfasste Betriebsausgaben für EÜR-/Umsatzsteuer-Auswertungen.
CREATE TABLE IF NOT EXISTS expense (
  id                 TEXT PRIMARY KEY,
  expense_date       TEXT NOT NULL,
  vendor             TEXT NOT NULL,
  description        TEXT NOT NULL,
  category           TEXT NOT NULL,
  receipt_number     TEXT,
  net_cents          INTEGER NOT NULL CHECK (net_cents >= 0),
  tax_rate_bp        INTEGER NOT NULL CHECK (tax_rate_bp >= 0 AND tax_rate_bp <= 10000),
  input_tax_cents    INTEGER NOT NULL CHECK (input_tax_cents >= 0),
  gross_cents        INTEGER NOT NULL CHECK (gross_cents >= 0),
  deductible_bp      INTEGER NOT NULL DEFAULT 10000 CHECK (deductible_bp >= 0 AND deductible_bp <= 10000),
  payment_method     TEXT NOT NULL DEFAULT 'bank',
  receipt_path       TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_date ON expense(expense_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_category ON expense(category) WHERE deleted_at IS NULL;

INSERT INTO app_migration (version, name, applied_at)
VALUES (7, '0007_steuerbereich', datetime('now'));
