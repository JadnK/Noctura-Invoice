-- Migration 0005: Feld fuer das verschluesselte SMTP-Passwort.
--
-- Urspruenglich als reine Schluesselbund-Referenz geplant (secret_ref).
-- Echte Stronghold-Anbindung ist ein eigenes, groesseres Vorhaben - als
-- Zwischenloesung liegt das Passwort AES-256-GCM-verschluesselt in dieser
-- Spalte, mit einem aus der Geraete-ID abgeleiteten Schluessel (siehe
-- commands/email_settings.rs). Kein Klartext, aber auch kein echter
-- Betriebssystem-Schluesselbund - das ausdruecklich vorgemerkt fuer eine
-- spaetere echte Stronghold-Anbindung.

ALTER TABLE email_account ADD COLUMN secret_encrypted TEXT;

INSERT INTO app_migration (version, name, applied_at)
  VALUES (5, '0005_email_secret_spalte', datetime('now'));
