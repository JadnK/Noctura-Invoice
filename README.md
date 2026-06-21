# Noctura Invoice

Rechnungssoftware aus zwei Teilen:

- **Windows-Desktop-App** (Tauri 2 + React) — die eigentliche Arbeit. Rechnungs-,
  Kunden- und Produktdaten liegen lokal in SQLite und verlassen den Rechner nicht.
- **Lizenz- und Admin-Server** (Fastify + PostgreSQL + Next.js) — läuft unter
  `rechnungsapp.jadenk.de` im Docker-Stack und kennt nur Lizenzen, keine Belege.

```
apps/desktop            Windows-App: Tauri, React, SQLite, PDF, SMTP
apps/license-api        Lizenz-API: Fastify, Prisma, Ed25519-Tokens
apps/admin-web          Admin-Panel: Next.js, nur Dark Mode
packages/invoice-core   Geld, Steuern, Rabatte, Nummernkreise — ohne I/O
packages/domain         IBAN, USt-IdNr., Fälligkeiten, GiroCode
packages/doc-render     Vorlagenmodell, HTML-Vorschau, Typst-PDF
packages/mail           SMTP-Vorgaben, Versandwarteschlange, Mahnwesen, Zahlungen
packages/data-io        CSV-Import und -Export mit Formaterkennung
packages/license-client Lizenzzustand, Offline-Toleranz, eingeschränkter Modus
packages/ui             Designsystem, Tokens, Tailwind-Preset
infrastructure/         Docker, Reverse Proxy, Backup, Deploy
docs/                   Architektur, Datenmodell, Sicherheit, Lizenzfluss, API, ADRs
```

---

## Bauen und Ausliefern

Der Kern der Sache: **Windows-App und Server werden getrennt gebaut.** Die App
wird zur `.exe`, der Server zu zwei Docker-Images, die du auf dem Server nur noch
ziehst. Auf dem Server wird nichts kompiliert.

### A. Windows-App als .exe

**Per Workflow (empfohlen).** Tag setzen, GitHub baut auf einem Windows-Runner:

```bash
git tag v0.2.0
git push origin v0.2.0
```

`\.github/workflows/release-desktop.yml` läuft und legt an:

| Datei | Zweck |
|-------|-------|
| `Noctura Invoice_0.2.0_x64-setup.exe` | NSIS-Installer, das ist die „exe" zum Weitergeben |
| `Noctura Invoice_0.2.0_x64_de-DE.msi` | MSI, falls per Gruppenrichtlinie verteilt wird |
| `*.sig` | Signaturen für den eingebauten Updater |
| `checksums.txt` | SHA-256 zum Vergleichen |

Zu finden unter *Actions → Release Desktop → Artifacts*, bei einem Tag zusätzlich
als Entwurf unter *Releases*. Der Workflow meldet die neue Version danach an
deinen Lizenzserver, damit installierte Apps das Update finden.

Ohne Tag, nur zum Ausprobieren: *Actions → Release Desktop → Run workflow*.

**Benötigte Repository-Secrets** (*Settings → Secrets and variables → Actions*):

| Secret | Woher |
|--------|-------|
| `LICENSE_PUBLIC_KEY` | Inhalt von `/data/secrets/license-signing.pub` vom Server, nach dem ersten Serverstart |
| `TAURI_SIGNING_PRIVATE_KEY` | `npm run tauri signer generate` — privater Teil |
| `TAURI_SIGNING_KEY_PASSWORD` | Passwort dazu |
| `NOCTURA_ADMIN_TOKEN` | Admin-Access-Token des Lizenzservers |

Der öffentliche Tauri-Schlüssel gehört in `apps/desktop/src-tauri/tauri.conf.json`
unter `plugins.updater.pubkey`. Fehlt `LICENSE_PUBLIC_KEY`, bricht der Build ab —
eine App mit Platzhalterschlüssel könnte keine Lizenz prüfen.

**Lokal auf einem Windows-Rechner:**

```powershell
# Einmalig: Node 22, Rust (stable, msvc), WebView2 Runtime, Visual Studio Build Tools
npm install
bash apps/desktop/scripts/fetch-fonts.sh   # Schriften werden ins PDF eingebettet
npm test
npm run tauri:build --workspace @noctura/desktop
```

Ergebnis unter:

```
apps\desktop\src-tauri\target\release\bundle\nsis\*.exe
apps\desktop\src-tauri\target\release\bundle\msi\*.msi
```

Zum Entwickeln mit heißem Neuladen: `npm run desktop:dev`.

### B. Server ausrollen

**Images baut GitHub, nicht der Server.** Bei jedem Push auf `main` und bei jedem
Tag baut `release-server.yml` zwei Images und legt sie in der GitHub Container
Registry ab:

```
ghcr.io/<dein-nutzer>/noctura-invoice/license-api:latest
ghcr.io/<dein-nutzer>/noctura-invoice/admin-web:latest
```

**Erstmalige Einrichtung auf dem Server:**

```bash
git clone https://github.com/<dein-nutzer>/noctura-invoice.git
cd noctura-invoice
cp .env.example .env
# alle Platzhalter ersetzen; Zufallswerte: openssl rand -base64 48
nano .env

# Bei privatem Repository einmalig anmelden:
echo "$GHCR_TOKEN" | docker login ghcr.io -u <dein-nutzer> --password-stdin

./infrastructure/scripts/deploy.sh
docker compose logs -f license-api
```

Beim ersten Start erzeugt der Container selbst:

- das **Ed25519-Schlüsselpaar** für Lizenztokens (`/data/secrets/license-signing.key` und `.pub`)
- den **Admin-Access-Token** (`/data/secrets/admin-access-token`, Rechte 0600)

Beides erscheint **genau einmal** im Log. Den öffentlichen Schlüssel brauchst du
als Secret `LICENSE_PUBLIC_KEY` für den Desktop-Build:

```bash
docker compose exec license-api cat /data/secrets/license-signing.pub
```

**Jedes weitere Ausrollen:**

```bash
git pull
NOCTURA_TAG=0.2.0 ./infrastructure/scripts/deploy.sh   # oder ohne Tag: latest
```

Das Skript sichert vorher die Datenbank, zieht die Images, startet neu und wartet
auf `/ready`. Meldet der Dienst nach 30 Sekunden keine Bereitschaft, zeigt es die
Logs und bricht mit Fehlercode ab.

**Reverse Proxy.** Der Stack macht keine Ports nach außen auf. Vorlagen für Caddy
und Nginx liegen unter `infrastructure/reverse-proxy/`. Ein Host, Pfadtrennung
(Begründung in `docs/adr/0003-domainstruktur.md`):

```
rechnungsapp.jadenk.de/         -> Admin-Panel
rechnungsapp.jadenk.de/api/v1   -> Lizenz-API
```

**Admin-Token rotieren:**

```bash
docker compose exec license-api npm run admin-token:rotate
```

**Sicherung:**

```bash
./infrastructure/backup/backup.sh /var/backups/noctura     # cron: täglich 03:15
./infrastructure/backup/restore.sh <dump.sql.gz> [secrets.tar.gz]
```

### C. Reihenfolge beim allerersten Mal

1. Server ausrollen (Abschnitt B) → Schlüssel und Admin-Token entstehen.
2. `license-signing.pub` als Secret `LICENSE_PUBLIC_KEY` im Repository hinterlegen.
3. Tauri-Updater-Schlüssel erzeugen, öffentlichen Teil in `tauri.conf.json`, privaten als Secret.
4. Im Admin-Panel eine Lizenz anlegen — der Schlüssel wird genau einmal angezeigt.
5. Tag setzen → Windows-App wird gebaut.
6. `.exe` installieren, Lizenzschlüssel eingeben, fertig.

---

## Entwickeln

Voraussetzungen: Node 22, Rust 1.77+, Docker.

```bash
npm install
npm test          # 191 Tests: Rechenkern, Domäne, Rendering, Vorlagen, Mail, Import, Lizenz, Oberfläche
npm run test:rust # Rust-Port derselben Rechenregeln
npm run desktop:dev
docker compose up -d
```

## Stand

```
✓ M0  Architektur, Datenmodell, Sicherheitskonzept, Lizenzfluss, API, Plan
✓ M1  Grundgerüst: Tauri-Shell, Designsystem, SQLite-Migrationen, API, Docker
✓ M2  Stammdaten: IBAN- und USt-IdNr.-Prüfung, Onboarding, Kunden, Produkte
✓ M3  Belege: Vorlagenmodell, HTML-Vorschau, Typst-PDF, Rechnungseditor
✓ M4  Lizenz: Aktivierung, Offline-Toleranz, eingeschränkter Modus, Admin-Panel
✓ M5  Kommunikation: SMTP-Warteschlange, Mahnstufen, Zahlungen
✓ M6  Daten: CSV-Import, Export, verschlüsselte Sicherung mit Wiederherstellung
✓ M7  Visueller Vorlageneditor mit Live-Vorschau und Versionierung
✓ M8  Tests, Tastenkürzel, Fehlerkatalog, Barrierefreiheit, Update-System
```

Bewusst als eigene Module nach hinten gestellt: DATEV, ZUGFeRD/Factur-X und
XRechnung. Sie haben eigene Konformitätsanforderungen, und ein Fehler dort darf
nie die normale Rechnungsstellung blockieren.


## Grundsätze

**Kein Fließkomma bei Geld.** Beträge sind ganzzahlige Cent, Steuersätze und
Prozentrabatte Basispunkte, Mengen Milli-Einheiten. Eine einzige Rundungsfunktion,
kaufmännisch, in `packages/invoice-core/src/money.ts`.

**Steuer wird je Steuersatz berechnet, nicht je Position.** Drei Positionen zu
0,03 € ergeben 0,02 € Steuer, nicht 0,03 €. Der Rust-Kern rechnet vor dem
Finalisieren erneut; weichen die Ergebnisse ab, wird nichts geschrieben.

**Finalisierte Belege sind unveränderlich.** Korrekturen laufen über Storno oder
Gutschrift. Das Audit-Log ist über Hashes verkettet.

**Vorlagen sind Daten, kein Code.** Ein Layoutmodell, zwei Renderer: HTML für die
Vorschau, Typst für das PDF. Damit können Vorschau und Ausdruck nicht auseinander
laufen, und es gibt nichts, was eine Vorlage ausführen könnte.

**Eine Lizenz sperrt niemals die eigenen Daten.** Auch ohne gültige Lizenz bleiben
Ansehen, Suchen, PDF-Export, Zahlungserfassung und Sicherung möglich. Eingeschränkt
wird nur das Erzeugen neuer Belege.

**Keine Steuerberatung.** Steuerlich relevante Optionen sind konfigurierbar und
tragen den Hinweis, dass die Einrichtung vom Nutzer beziehungsweise dessen
Steuerberatung zu prüfen ist.

## Branch-Modell

`main` trägt nur getaggte Stände, `develop` ist der Integrationsbranch, gearbeitet
wird in `feature/*` und mit `--no-ff` gemergt. Details in `CONTRIBUTING.md`.
