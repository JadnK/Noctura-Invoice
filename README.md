# Noctura Invoice

[![CI](https://github.com/JadnK/Noctura-Invoice/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JadnK/Noctura-Invoice/actions/workflows/ci.yml)
[![Lizenz](https://img.shields.io/badge/Lizenz-Source--available-blue)](LICENSE)

Rechnungssoftware für kleine Unternehmen: eine Windows-Desktop-App, in der die
Daten lokal bleiben, dazu ein eigener Lizenz- und Verwaltungsserver.

> **Quelltext einsehbar, Nutzung vorbehalten.** Dieses Repository ist offen
> lesbar, damit Kunden, Interessierte und Fachkolleginnen die Umsetzung
> nachvollziehen können. Es ist **keine** Open-Source-Software: Betrieb,
> Weitergabe und abgeleitete Werke sind nicht gestattet. Siehe [`LICENSE`](LICENSE).
> Warum ein Klon nicht ohne Weiteres läuft, steht in
> [`docs/veroeffentlichung.md`](docs/veroeffentlichung.md).

## Inhalt

- [Aufbau des Repositories](#aufbau-des-repositories)
- [Was die Software macht](#was-die-software-macht)
- [Ein paar Entscheidungen, die das Ganze tragen](#ein-paar-entscheidungen-die-das-ganze-tragen)
- [Code lesen](#code-lesen)
- [Bauen und Betreiben](#bauen-und-betreiben)
- [Historie](#historie)
- [Kontakt](#kontakt)

## Aufbau des Repositories

```
apps/desktop            Windows-App: Tauri 2, React, SQLite, PDF, SMTP
apps/license-api        Lizenz-API: Fastify, Prisma, Ed25519-Tokens
apps/admin-web          Admin-Panel: Next.js, nur Dark Mode
packages/invoice-core   Geld, Steuern, Rabatte, Nummernkreise — ohne I/O
packages/domain         IBAN, USt-IdNr., Fälligkeiten, GiroCode
packages/doc-render     Vorlagenmodell, HTML-Vorschau, Typst-PDF
packages/mail           SMTP-Vorgaben, Warteschlange, Mahnwesen, Zahlungen
packages/data-io        CSV-Import und -Export mit Formaterkennung
packages/license-client Lizenzzustand, Offline-Toleranz, eingeschränkter Modus
packages/ui             Designsystem, Tokens, Tailwind-Preset
infrastructure/         Docker, Reverse Proxy, Sicherung
docs/                   Architektur, Datenmodell, Sicherheit, Lizenzfluss, ADRs
```

## Was die Software macht

Rechnungen, Angebote und Gutschriften schreiben, versenden, mahnen und
auswerten — für Betriebe, die keine Cloud-Buchhaltung wollen. Rechnungs- und
Kundendaten liegen in einer lokalen SQLite-Datenbank und verlassen den Rechner
nicht. Der Server kennt ausschliesslich Lizenzen: Schlüssel-Hash, Geräte-ID,
Programmversion, Betriebssystemfamilie. Keine Belege, keine Beträge, keine
Kundennamen (siehe [`docs/adr/0002-lokale-daten.md`](docs/adr/0002-lokale-daten.md)).

Vollständig umgesetzt: Firmenprofil und Onboarding, Kunden- und
Produktverwaltung, Rabattsystem, Rechnungseditor mit Live-Berechnung,
Nummernkreise, PDF-Erzeugung, visueller Vorlageneditor, SMTP-Versand mit
Warteschlange, Mahnwesen, Zahlungen, CSV-Import, verschlüsselte Sicherung,
Lizenzsystem mit Offline-Toleranz, Admin-Panel.

Bewusst als eigene Module offen: DATEV, ZUGFeRD/Factur-X, XRechnung.

## Ein paar Entscheidungen, die das Ganze tragen

**Kein Fließkomma bei Geld.** Beträge sind ganzzahlige Cent, Steuersätze und
Prozentrabatte Basispunkte, Mengen Milli-Einheiten. Es gibt genau eine
Rundungsfunktion, kaufmännisch, in `packages/invoice-core/src/money.ts`.
Begründung in [`docs/adr/0001-geldarithmetik.md`](docs/adr/0001-geldarithmetik.md).

**Steuer wird je Steuersatz berechnet, nicht je Position.** Drei Positionen zu
0,03 € ergeben 0,02 € Steuer, nicht 0,03 €. Der Rust-Kern rechnet vor dem
Finalisieren erneut; weichen die Ergebnisse ab, wird nichts geschrieben und
keine Rechnungsnummer verbraucht.

**Finalisierte Belege sind unveränderlich.** Korrekturen laufen über Storno oder
Gutschrift. Das Audit-Log ist über Hashes verkettet, sodass nachträgliche
Änderungen an einzelnen Einträgen auffallen.

**Vorlagen sind Daten, kein Code.** Ein Layoutmodell, zwei Renderer: HTML für
die Vorschau, Typst für das PDF. Vorschau und Ausdruck können nicht
auseinanderlaufen, und es gibt nichts, was eine Vorlage ausführen könnte.
Siehe [`docs/adr/0004-pdf-engine.md`](docs/adr/0004-pdf-engine.md).

**Eine Lizenz sperrt niemals die eigenen Daten.** Auch ohne gültige Lizenz
bleiben Ansehen, Suchen, PDF-Export, Zahlungserfassung und Sicherung möglich.
Eingeschränkt wird nur das Erzeugen neuer Belege.

**Keine Steuerberatung.** Steuerlich relevante Optionen sind konfigurierbar und
tragen den Hinweis, dass die Einrichtung vom Nutzer beziehungsweise dessen
Steuerberatung zu prüfen ist.

## Code lesen

Wer sich einen Eindruck verschaffen will, findet die interessanten Stellen hier:

| Frage | Datei |
|-------|-------|
| Wie wird gerechnet? | `packages/invoice-core/src/calculate.ts` |
| Wie wird gerundet? | `packages/invoice-core/src/money.ts` |
| Wie sieht das Datenmodell aus? | `apps/desktop/src-tauri/migrations/0001_init.sql` |
| Wie läuft eine Finalisierung ab? | `apps/desktop/src-tauri/src/repo/invoices.rs` |
| Wie funktioniert die Lizenzprüfung? | `apps/license-api/src/lib/license-token.ts` |
| Was passiert offline? | `packages/license-client/src/state.ts` |
| Wie wird eine Vorlage gerendert? | `packages/doc-render/src/html.ts` |

Die Tests sind der schnellste Weg, das Verhalten zu verstehen — 191 Stück, ohne
Netzwerk und ohne Datenbank lauffähig:

    npm install
    npm test

Das funktioniert auch ohne die zurückgehaltenen Bestandteile: die
Geschäftslogik ist bewusst frei von I/O.

## Bauen und Betreiben

Für den Rechteinhaber. Ohne das private Schlüsselmaterial führt keiner dieser
Schritte zu einer nutzbaren Installation, und ohne Lizenz wäre der Betrieb
ohnehin nicht gestattet.

**Windows-App.** Tag setzen, `release-desktop.yml` baut auf einem
Windows-Runner NSIS-Installer, MSI, Updater-Signaturen und Prüfsummen. Nötige
Secrets: `LICENSE_PUBLIC_KEY`, `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_KEY_PASSWORD`, `NOCTURA_ADMIN_TOKEN`. Fehlt der Lizenzschlüssel,
bricht der Build ab — eine App mit Platzhalter könnte keine Lizenz prüfen.

Lokal auf einem Windows-Rechner mit Node 22, Rust (msvc), WebView2 und Visual
Studio Build Tools:

    npm install
    powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1
    npm run tauri:build --workspace @noctura/desktop

(Mit Git Bash oder WSL stattdessen `bash apps/desktop/scripts/fetch-fonts.sh`.)

**Server.** `release-server.yml` baut zwei Images in die Container-Registry; die
Pakete sind privat. Der vollständige Ablauf für Erststart, Schlüsselerzeugung,
Ausrollen, Reverse Proxy, Sicherung und Rotation steht in `private/BETRIEB.md` —
diese Datei ist nicht Teil des Repositories.

## Historie

`main` trägt freigegebene Stände, `develop` ist der Integrationsbranch,
gearbeitet wird in `feature/*` und mit `--no-ff` gemergt. Die Historie ist
absichtlich kleinteilig: sie zeigt, in welcher Reihenfolge das entstanden ist.

## Kontakt

Interesse an einer Lizenz, an einer Installation oder an Zusammenarbeit: über
das GitHub-Profil. Sicherheitshinweise über den Weg in [`SECURITY.md`](SECURITY.md).
