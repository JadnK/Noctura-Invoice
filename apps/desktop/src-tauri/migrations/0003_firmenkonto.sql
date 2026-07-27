-- Migration 0003: lokale Sitzung des Firmenkontos.
--
-- Getrennt von license_cache: die Lizenz selbst und das Firmenkonto, das
-- sich in der App anmeldet, sind zwei verschiedene Dinge. Ein Geraet hat
-- eine Lizenz, aber jede Person am Geraet meldet sich mit ihrem eigenen
-- Konto an.

PRAGMA foreign_keys = ON;

CREATE TABLE company_session (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  user_id      TEXT NOT NULL,
  license_id   TEXT NOT NULL,
  email        TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  token        TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

INSERT INTO app_migration (version, name, applied_at)
  VALUES (3, '0003_firmenkonto', datetime('now'));
