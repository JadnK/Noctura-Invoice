# Changelog

## 0.3.0 — 2026-07-26

Alle Meilensteine umgesetzt. Der Rechenkern ist mit der Datenbank verdrahtet,
die PDF-Erzeugung läuft, der Vorlageneditor steht, die Oberfläche ist vollständig
bedienbar.

### Neu

- **Vorlageneditor (M7)**: visuelles Bearbeiten mit Live-Vorschau im selben
  Renderer, der auch das PDF speist; Rückgängig-Verlauf, Umsortieren per Maus
  und per Tastatur, Layoutprüfung vor dem Speichern, Import und Export von
  Vorlagen mit Verwerfen unbekannter Bausteine
- **Finalisierung**: eine Transaktion für Nummernvergabe, Firmen- und
  Kundenschnappschuss, Steuerübersicht und verketteten Audit-Eintrag. Weicht die
  Neuberechnung von der Anzeige ab, wird nichts geschrieben und keine Nummer
  verbraucht
- **Stornierung**: der Beleg bleibt bestehen, eine Stornorechnung mit eigenem
  Nummernkreis tritt daneben
- **PDF über Typst**: eingebettete Schriften, kein Browser, kein externer
  Prozess; Dokumente greifen nur auf ausdrücklich übergebene Dateien zu
- **SMTP-Warteschlange in Rust**: Zähler wird vor dem Sendeversuch
  festgeschrieben, dauerhafte Fehler werden nicht wiederholt
- **Sicherung**: `VACUUM INTO` für einen konsistenten Stand, ZIP mit Manifest und
  Prüfsummen, optional AES-256-GCM mit Argon2id; Vorschau vor der
  Wiederherstellung, Sicherheitskopie davor
- **Lizenzaktivierung**: echte Ed25519-Prüfung gegen den eingebetteten
  Schlüssel, datenschutzfreundliche Geräte-ID, Heartbeat, lokale Ablaufprüfung
- **Oberfläche**: Dashboard, Kundenliste und -formular, Einstellungen mit
  sofortiger IBAN-, USt-IdNr.- und SMTP-Prüfung, Lizenzseite, E-Mail-Ausgang,
  Hilfe, Command-Palette, globale Tastenkürzel, Fehleranzeige mit Ursache,
  Lösungsweg und aufklappbaren Details
- **Abnahme**: die zwanzig Kriterien aus dem Lastenheft als
  Ende-zu-Ende-Spezifikation, dazu Prüfstand und Vitest-Einrichtung

### Tests

191 automatisierte Tests. Neu unter anderem: Editoroperationen samt
Unveränderlichkeit der Vorgängerzustände, Layoutprüfung, Vorlagenimport.

### Vor dem Release-Build

`bash apps/desktop/scripts/fetch-fonts.sh` holt die vier eingebetteten
Schriften. Ohne sie bricht der Build ab — gewollt, denn Systemschriften
unterscheiden sich je Rechner und ein PDF soll überall gleich aussehen.

## 0.2.0 — 2026-07-26

Alle Meilensteine angearbeitet: die Geschaeftslogik jedes Bereichs ist
implementiert und getestet, dazu die vollstaendige Build- und Ausrollkette.

### Neu

- **Stammdaten (M2)**: IBAN-Pruefung nach ISO 13616, USt-IdNr.-Formatpruefung
  mit Vorschlag zum Steuerschema, Faelligkeits- und Skontoberechnung,
  Verzugszinsen, GiroCode nach EPC069-12, Migration 0002, Kunden- und
  Produkt-Repository in Rust, Einrichtungsassistent
- **Belege und PDF (M3)**: Vorlagen als Layoutmodell mit zwei Renderern —
  HTML fuer die Vorschau, Typst fuer das PDF (ADR-0004), CSS-Positivliste,
  Platzhalteraufloesung, Rechnungseditor mit Live-Summen
- **Lizenz (M4)**: Zustandslogik der App mit Offline-Toleranz, Warnstufe und
  eingeschraenktem Modus, Admin-Panel mit Token-Login und Lizenzuebersicht
- **Kommunikation (M5)**: SMTP-Anbietervorgaben mit Konfigurationspruefung,
  Versandwarteschlange mit Backoff und Unterscheidung dauerhafter Fehler,
  Mahnstufen mit Gebuehren, Zahlungsverbuchung und Sammelzahlungen
- **Daten (M6)**: CSV-Import mit Erkennung von Trennzeichen, Zeichensatz,
  Zahlen- und Datumsformat, Spaltenzuordnung, Duplikatpruefung, Fehlerbericht;
  Export- und Backup-Konzept
- **Qualitaet (M8)**: Tastenkuerzel mit Kontexterkennung, Fehlerkatalog mit
  Ursache und Loesungsweg, Qualitaets- und Barrierefreiheitskonzept
- **Auslieferung**: Workflow fuer den Windows-Installer (.exe und .msi mit
  Updater-Signaturen), Workflow fuer die Server-Images in der GitHub Container
  Registry, Deploy-Skript mit Sicherung und Bereitschaftspruefung

### Tests

170 automatisierte Tests ueber Rechenkern, Domaene, Rendering, Kommunikation,
Datenaustausch, Lizenz und Oberflaechenlogik.

### Offen

M7 (visueller Vorlageneditor) sowie die Verdrahtung der fertigen Logik mit
Datenbank und Oberflaeche in mehreren Bereichen. Stellen sind im Code mit der
Meilensteinnummer markiert.

## 0.1.0-alpha — 2026-07-26

Erste lauffaehige Grundlage. Planung abgeschlossen, Rechenkern und Lizenzlogik
fertig und getestet, Gerueste fuer Desktop-App und Server stehen.

### Enthalten

- Phase-1-Dokumentation: Architektur, Datenmodell, Sicherheitskonzept,
  Lizenzfluss, API-Konzept, Meilensteine, drei ADRs
- `invoice-core`: Geldarithmetik in Cent, Belegberechnung mit Steuergruppen,
  Rabattverteilung ohne Centverlust, Nummernkreise, Statusuebergaenge,
  plattformsichere Dateinamen — 47 Tests
- `license-api`: Ed25519-Lizenztokens, Aktivierungsregeln mit Geraetelimit,
  Replay-Schutz, Admin-Sessions mit CSRF, Prisma-Schema — 37 Tests
- Rust-Kern: Port der Geldarithmetik mit denselben Testvektoren, verkettetes
  Audit-Log, Tauri-Konfiguration mit CSP und minimalen Berechtigungen
- Designsystem: Dark-Mode-Tokens, Tailwind-Preset, Betrags- und Statusdarstellung
- SQLite-Migration 0001 mit Constraints, Indizes und Startdaten
- Docker-Stack mit Healthchecks, Reverse-Proxy-Vorlagen, Backup und Restore
- Automatische Erzeugung von Admin-Access-Token und Signaturschluessel beim Erststart

### Noch nicht enthalten

Onboarding, Rechnungseditor, PDF-Erzeugung, Vorlageneditor, SMTP-Versand,
Mahnwesen, Import und Export, Admin-Weboberflaeche. Zuordnung zu Meilensteinen
in `docs/roadmap.md`.

### Vor dem ersten Release-Build

1. Lizenzserver starten und Signaturschluessel erzeugen lassen.
2. `license-signing.pub` nach `apps/desktop/src-tauri/keys/` kopieren.
3. Tauri-Updater-Schluessel erzeugen und in `tauri.conf.json` eintragen.
