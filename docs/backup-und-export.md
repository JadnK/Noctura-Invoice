# Sicherung, Wiederherstellung und Export

## Backup-Format

Ein Backup ist ein ZIP mit fester Struktur:

    noctura-backup-2026-07-26T10-15-00Z.nbk
    ├── manifest.json      Schemaversion, App-Version, Zeitpunkt, SHA-256 je Datei
    ├── database.sqlite    ueber "VACUUM INTO" erzeugt, nie eine Dateikopie
    ├── attachments/       Anhaenge in Originalform
    ├── branding/          Logo, Stempel, Unterschrift
    └── templates/         Vorlagen als JSON

`VACUUM INTO` liefert einen in sich konsistenten Stand, auch wenn parallel
geschrieben wird. Eine einfache Dateikopie kann eine halb geschriebene
Transaktion enthalten und ist als Sicherung wertlos.

## Verschluesselung

Optional, aber empfohlen, weil ein Backup saemtliche Kundendaten enthaelt.

    Schluessel = Argon2id(Passwort, Salt, m=64 MiB, t=3, p=1)
    Inhalt     = AES-256-GCM je Datei, eigener Nonce, Authentifizierungs-Tag im Manifest

Ohne Passwort gibt es keine Wiederherstellung — es existiert keine Hintertuer
und keine Wiederherstellungsfrage. Der Dialog sagt das deutlich, bevor das
Passwort gesetzt wird.

## Wiederherstellung

1. Manifest lesen, Pruefsummen vergleichen.
2. Schemaversion pruefen. Aeltere Staende werden migriert, neuere abgelehnt.
3. Vorschau: Zeitpunkt, App-Version, Anzahl Rechnungen, Kunden, Anhaenge.
4. Sicherheitskopie des aktuellen Stands anlegen.
5. Erst danach ersetzen.

Vor jedem Programmupdate laeuft Schritt 4 automatisch.

## Aufbewahrung

Automatische Sicherung taeglich, Aufbewahrung konfigurierbar (Vorgabe 30 Staende).
Steuerlich relevante Dokumente werden nie automatisch geloescht, auch nicht durch
die Aufbewahrungsregel — sie gilt ausschliesslich fuer Sicherungsdateien.

## Exportformate

| Format | Zweck | Stand |
|--------|-------|-------|
| PDF | Beleg zum Versand und Ablegen | M3 |
| CSV | Kunden, Produkte, Rechnungsliste, Zahlungen | M6 |
| JSON | vollstaendige Datenuebernahme in ein anderes System | M6 |
| ZIP | Mehrfachexport von PDFs mit Indexdatei | M6 |
| Steuerberater-Paket | PDFs plus Buchungsliste als CSV, nach Zeitraum | M6 |
| DATEV | Buchungsstapel im EXTF-Format | eigenes Modul nach M8 |
| ZUGFeRD / Factur-X | PDF/A-3 mit eingebettetem XML | eigenes Modul nach M8 |
| XRechnung | XML nach EN 16931 fuer oeffentliche Auftraggeber | eigenes Modul nach M8 |

Die drei letzten Formate haben eigene Konformitaetsanforderungen und werden
bewusst nicht in den Kern gemischt: ein Fehler dort darf nie die normale
Rechnungsstellung blockieren.

## Dateinamen

Schema konfigurierbar, Vorgabe:

    {NUMMER}_{KUNDE}_{DATUM}.pdf   ->   RE-2026-00001_Musterfirma_2026-07-25.pdf

Bereinigt fuer Windows, macOS und Linux: Umlaute umschrieben, verbotene Zeichen
ersetzt, reservierte Namen entschaerft, Laenge begrenzt. Umgesetzt und getestet
in `packages/invoice-core/src/filename.ts`.
