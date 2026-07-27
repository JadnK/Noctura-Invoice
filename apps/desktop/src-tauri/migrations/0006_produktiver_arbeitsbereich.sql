-- Persistente Programmeinstellungen, die nicht in fachlichen Stammdatentabellen liegen.
CREATE TABLE IF NOT EXISTS app_setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_setting (key, value, updated_at)
VALUES ('onboarding_complete', 'false', datetime('now'));

INSERT OR IGNORE INTO app_setting (key, value, updated_at)
VALUES ('default_payment_terms_days', '14', datetime('now'));

INSERT INTO app_migration (version, name, applied_at)
VALUES (6, '0006_produktiver_arbeitsbereich', datetime('now'));
