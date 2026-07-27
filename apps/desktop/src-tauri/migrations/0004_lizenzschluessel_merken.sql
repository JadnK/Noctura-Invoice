-- Migration 0004: Lizenzschluessel lokal merken.
--
-- Nach der Aktivierung kennt das Geraet nur noch das signierte Token, nicht
-- mehr den Klartextschluessel selbst - jede weitere Aktion rund um
-- Firmenkonten (Anmelden, Registrieren) musste ihn deshalb erneut abfragen.
-- Der Schluessel ist kein zusaetzliches Geheimnis: das Geraet hat mit der
-- erfolgreichen Aktivierung ohnehin bereits bewiesen, dass es ihn kennt.

ALTER TABLE license_cache ADD COLUMN raw_key TEXT;

INSERT INTO app_migration (version, name, applied_at)
  VALUES (4, '0004_lizenzschluessel_merken', datetime('now'));
