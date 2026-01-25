# Architekturuebersicht — Noctura Invoice

Stand: Phase 1. Aenderungen an diesem Dokument erfolgen ueber ADRs in `docs/adr/`.

## 1. Systemgrenzen

Zwei getrennte Systeme, die sich ausschliesslich ueber eine schmale, klar
definierte Lizenz-API kennen.

    +-------------------------------------------+      +-----------------------------+
    |  Desktop (Tauri 2, Windows/macOS/Linux)   |      |  rechnungsapp.jadenk.de     |
    |                                           |      |                             |
    |  React 18 + TS  ── Tauri IPC ──  Rust Core|      |  Fastify Lizenz-API         |
    |       │                            │      |      |       │                     |
    |  TanStack Query               SQLite (WAL)|      |  Prisma ─ PostgreSQL 16     |
    |  Zustand (UI-State)           Stronghold  |      |  Redis (Rate-Limit, Session)|
    |       │                            │      |      |  Admin-Web (Next.js)        |
    |  PDF-Renderer (HTML -> PDF)   Keychain    |      |                             |
    +-------------------------------------------+      +-----------------------------+
                  │                                                 ▲
                  └───── HTTPS, nur Lizenz-Payloads ────────────────┘
                         (Key-Hash, Geraete-ID, App-Version, Nonce)

Regel ohne Ausnahme: Rechnungs-, Kunden- und Produktdaten verlassen das Geraet
nicht. Der Lizenzserver kennt weder Betraege noch Kundennamen des Endkunden.

## 2. Schichten der Desktop-App

| Schicht        | Ort                          | Verantwortung |
|----------------|------------------------------|---------------|
| UI             | `apps/desktop/src`           | Darstellung, Eingabe, Navigation. Keine Rechenlogik. |
| Anwendungslogik| `packages/invoice-core`      | Betraege, Steuern, Rabatte, Nummernkreise, Statusuebergaenge. Rein, ohne I/O. |
| Validierung    | `packages/validation`        | Zod-Schemata, geteilt von UI, Rust-Bridge und Import. |
| Persistenz     | `src-tauri/src/db`           | SQLite via SQLx, Migrationen, Transaktionen. |
| Sicherheit     | `src-tauri/src/secrets`      | Stronghold/Keychain, Lizenz-Token, SMTP-Passwoerter. |
| Infrastruktur  | `src-tauri/src/{pdf,mail,fs}`| PDF-Erzeugung, SMTP-Warteschlange, Dateisystem. |

`invoice-core` ist bewusst eine reine TypeScript-Bibliothek ohne Abhaengigkeiten.
Sie ist die einzige Quelle der Wahrheit fuer Geldarithmetik und wird sowohl im
Renderer als auch beim PDF-Rendering benutzt. Rust validiert die Ergebnisse vor
dem Finalisieren erneut (Port `invoice_core.rs`, gleiche Testvektoren aus
`packages/invoice-core/tests/vectors.json`) — doppelte Rechnung, ein Vertrag.

## 3. Datenfluss: Rechnung finalisieren

    UI "Finalisieren"
      -> Zod-Validierung (Pflichtfelder, Kunde, Positionen)
      -> invoice-core.calculate() im Renderer, Anzeige der Summen
      -> Tauri-Command `invoice_finalize(draft_id)`
         -> Rust: erneute Berechnung, Vergleich mit uebergebenen Summen
            -> Abweichung => Fehler E_CALC_MISMATCH, kein Schreibvorgang
         -> Transaktion:
            1. Nummer aus NumberSequence ziehen (SELECT ... FOR UPDATE-Aequivalent)
            2. Invoice.status = finalized, Snapshot der Firmen- und Kundendaten
            3. InvoiceTaxSummary schreiben
            4. AuditLog-Eintrag, verkettet mit Hash des Vorgaengers
         -> PDF rendern, SHA-256 in Invoice.pdf_checksum
      -> UI: Erfolg, PDF-Vorschau

Der Snapshot ist zentral: eine finalisierte Rechnung zeigt die Firmenanschrift
und den Steuerstatus zum Zeitpunkt der Finalisierung, nicht den heutigen Stand.

## 4. Datenfluss: Versand

    Rechnung -> EmailQueueItem (status=queued, attempt=0)
      -> Worker im Rust-Core, Backoff 1/5/15/60 min, max. 5 Versuche
      -> SMTP-Zugangsdaten aus Keychain, nie aus SQLite
      -> Erfolg: EmailLog + Invoice.status=sent
      -> Fehler: klassifiziert (auth, tls, dns, timeout, size) -> verstaendliche Meldung

Die Warteschlange ist persistent. Ein Absturz waehrend des Versands fuehrt nicht
zu doppeltem Versand, weil vor dem Sendeversuch `attempt` erhoeht und committet wird.

## 5. Lizenzfluss (Kurzfassung, Details in `docs/license-flow.md`)

    App: Key eingeben -> Geraete-ID ableiten -> POST /licenses/activate
    Server: Status/Ablauf/Geraetelimit pruefen -> Ed25519-signiertes Token
    App: Signatur mit eingebettetem Public Key pruefen -> Token in Stronghold
    Danach: Heartbeat alle 24 h, Offline-Toleranz 7 Tage, Warnung ab Tag 5

## 6. Server-Architektur

    Reverse Proxy (Caddy/Traefik, TLS)
      /            -> admin-web   (Next.js, SSR, nur Dark Mode)
      /api/v1/*    -> license-api (Fastify)
                        ├── Zod-Validierung aller Eingaben
                        ├── Rate-Limit (Redis, pro IP und pro Lizenzschluessel)
                        ├── Ed25519-Signatur (privater Schluessel nur hier)
                        └── Prisma -> PostgreSQL
      /health, /ready -> license-api, ohne Auth, ohne Datenbankgeheimnisse

Admin-Zugang ausschliesslich ueber Login-Formular mit Access-Token, danach
HttpOnly-Session-Cookie. Kein Token im Browser-Storage, nie in der URL.

## 7. Technologieentscheidungen mit Abweichung vom Master-Prompt

| Punkt | Entscheidung | Begruendung |
|-------|--------------|-------------|
| API-Framework | Fastify statt NestJS | Kleiner Schnittstellenumfang, schnellerer Kaltstart, weniger Abhaengigkeiten. NestJS lohnt erst bei vielen Modulen. |
| Domain-Struktur | `rechnungsapp.jadenk.de` + `/api/v1` | Ein Zertifikat, keine CORS-Preflights, ein Reverse-Proxy-Block. Details in ADR-0003. |
| Signatur | Ed25519 statt RSA | Kompakte Tokens, schnelle Offline-Pruefung, in Rust und Node ohne Zusatzbibliothek verfuegbar. |
| Geldtyp | Integer in kleinster Waehrungseinheit | Siehe ADR-0001. Keine Fliesskommazahlen, nirgends. |
| State | Zustand statt Redux Toolkit | Der Serverzustand liegt in TanStack Query; global bleibt wenig uebrig. Redux waere Overhead. |
