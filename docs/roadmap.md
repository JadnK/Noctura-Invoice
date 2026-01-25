# Meilensteine, Risiken, Annahmen

Stand 0.3.0: Alle Meilensteine sind fachlich umgesetzt. Die Geschaeftslogik ist
vollstaendig implementiert und getestet, die Rust-Seite verdrahtet, die
Oberflaeche steht. Was bleibt, ist Feinarbeit an einzelnen Listenansichten und
die drei bewusst ausgelagerten Formatmodule (DATEV, ZUGFeRD, XRechnung).

## Meilensteine

| M | Inhalt | Ergebnis |
|---|--------|----------|
| ✓ M0 | Phase 1 | Architektur, Datenmodell, Sicherheit, Lizenzfluss, API, Plan |
| ✓ M1 | Grundgeruest | Monorepo, Tauri startet, Dark-Mode-System, SQLite-Migrationen, API + Postgres in Docker, Admin-Login |
| ✓ M2 | Stammdaten | Firmenprofil, Onboarding, Kunden, Produkte, Einheiten, Rabatte, Nummernkreise |
| ✓ M3 | Beleg | Rechnungseditor, invoice-core vollstaendig, Status, PDF, Standardvorlage |
| ✓ M4 | Lizenz | Aktivierung, Heartbeat, Offline-Toleranz, eingeschraenkter Modus, Admin-Panel-Verwaltung |
| ✓ M5 | Kommunikation | SMTP, Vorlagen, Warteschlange, Zahlungen, Mahnwesen, Angebote, Gutschriften |
| ✓ M6 | Daten | Import, Export, Backup, Wiederherstellung, Audit-Log-UI |
| ✓ M7 | Vorlageneditor | Visueller Editor, Live-Vorschau, Versionierung |
| ✓ M8 | Reife | Tests, Barrierefreiheit, Performance, Installer, Updates, Dokumentation |

## Risiken

| Risiko | Wirkung | Umgang |
|--------|---------|--------|
| PDF-Ausgabe geraeteabhaengig verschieden | hoch | Schriften mitliefern und einbetten, feste DPI, Referenz-PDFs als Regressionstest mit Pixelvergleich |
| Steuerlogik falsch (Kleinunternehmer, Reverse Charge, EU) | hoch | Reine Kernbibliothek mit Testvektoren; Konfiguration statt Automatik; klarer Hinweis auf Pruefpflicht |
| Rundungsdifferenzen zwischen Positions- und Summensteuer | mittel | Steuer je Steuersatz auf Gruppenebene berechnen, nicht Positionssummen addieren; Testvektoren |
| Lizenzserver faellt aus | mittel | Offline-Toleranz, Graceful Degradation, Heartbeat mit Jitter |
| Stronghold/Keychain je Plattform unterschiedlich | mittel | Abstraktion `SecretStore` mit Plattform-Implementierungen und Integrationstests |
| DATEV, ZUGFeRD, XRechnung | mittel | Bewusst als getrennte Module nach M8, nicht in den Kern mischen |
| Tauri-2-API-Aenderungen | niedrig | Version pinnen, Update nur mit gruener Testsuite |

## Annahmen

- Einzelplatz. Mehrbenutzer ist im Datenmodell vorbereitet, aber nicht Ziel von v1.
- Standardwaehrung EUR, deutsche Oberflaeche; i18n-Struktur vorhanden, nur `de` gefuellt.
- Der Reverse Proxy und TLS existieren bereits auf dem Zielserver.
- Ein einzelner Betreiber verwaltet Lizenzen; kein Self-Service-Kauf in v1.
- Kein Zahlungsanbieter angebunden; Zahlungen werden manuell erfasst.
