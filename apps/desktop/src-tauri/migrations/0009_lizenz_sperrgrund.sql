-- Migration 0009: Sperrgrund fuer Lizenzen speichern.
--
-- Der Heartbeat kann vom Lizenzserver eine ausdrueckliche Ablehnung erhalten
-- (gesperrte Lizenz, deaktiviertes Geraet, abgelaufene Lizenz). Bisher wurde
-- jede Fehlantwort des Heartbeats wie eine gewoehnliche Verbindungsstoerung
-- behandelt, und die Offline-Kulanzfrist lief einfach weiter - eine
-- ausdruecklich gesperrte Lizenz soll aber sofort erkannt werden, nicht erst
-- nach Ablauf der Offline-Toleranz von bis zu 30 Tagen.

ALTER TABLE license_cache ADD COLUMN blocked_reason TEXT;

INSERT INTO app_migration (version, name, applied_at)
  VALUES (9, '0009_lizenz_sperrgrund', datetime('now'));
