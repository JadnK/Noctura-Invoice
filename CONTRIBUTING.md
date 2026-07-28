# Mitwirken

**Externe Beiträge werden nicht angenommen.** Dieses Repository ist einsehbar,
aber nicht offen: es gibt keine Pull-Request-Annahme, keinen Support und keine
Zusagen zu Fehlerbehebung oder Weiterentwicklung. Siehe `LICENSE`.

Fehlermeldungen und Sicherheitshinweise sind trotzdem willkommen — der Weg
dafür steht in `SECURITY.md`.

Der folgende Teil beschreibt die interne Arbeitsweise. Er steht hier, weil er
zum Verständnis der Historie gehört.

## Branch-Modell

    main            nur freigegebene Stände
    develop         Integrationsbranch, immer grün
    feature/<topic> Arbeit an einem abgegrenzten Thema
    release/<ver>   Stabilisierung, nur noch Fixes
    hotfix/<topic>  aus main, zurück in main und develop

Feature-Branches werden ausschliesslich mit `--no-ff` gemergt, damit die
Themenhistorie im Graphen sichtbar bleibt.

## Commit-Konvention

Verbindlich für jeden Commit, ohne Ausnahme: [Conventional Commits](https://www.conventionalcommits.org/).

### Format

    type(scope): beschreibung

- **type** — einer der unten stehenden acht Typen, auf Englisch, klein geschrieben.
- **scope** — optional, in runden Klammern, ohne Leerzeichen davor. Betrifft die
  Änderung genau ein Paket oder eine App, ist der Scope dessen Verzeichnisname
  (siehe Liste unten). Betrifft sie mehrere Bereiche oder das Repository als
  Ganzes (Root-`package.json`, CI-Workflows, repositoryweite Doku, Tooling), entfällt
  der Scope entweder ganz oder es wird `repo` eingesetzt — beides ist gültig,
  im Zweifel ohne Scope.
- **beschreibung** — auf Deutsch, Infinitiv oder Imperativ Präsens („ergänzt“,
  nicht „ergänzt hat“ oder „ergänzen“), klein geschrieben, kein Punkt am Ende.

### Typen

| Typ | Bedeutung |
|-----|-----------|
| `feat` | neue Funktionalität für Nutzende |
| `fix` | Fehlerbehebung |
| `docs` | ausschliesslich Dokumentation (README, CONTRIBUTING, CHANGELOG, `docs/**`) |
| `refactor` | Codeumbau ohne Verhaltensänderung |
| `chore` | Wartung: Abhängigkeiten, Build- und CI-Konfiguration, Tooling |
| `test` | Tests hinzufügen, anpassen oder reparieren, ohne Produktionscode zu ändern |
| `style` | reine Formatierung (Whitespace, Formatter, Linter-Autofix), keine Logikänderung |
| `perf` | Änderung, die ausschliesslich der Performance dient |

### Scopes

Ein Scope je Commit, passend zum Monorepo-Layout:

    desktop          apps/desktop
    license-api      apps/license-api
    admin-web        apps/admin-web
    invoice-core     packages/invoice-core
    domain           packages/domain
    doc-render       packages/doc-render
    mail             packages/mail
    data-io          packages/data-io
    license-client   packages/license-client
    ui               packages/ui
    repo             repositoryweit / kein einzelnes Paket betroffen

### Beispiele

    feat(invoice-core): Steuergruppierung je Steuersatz statt je Position
    fix(license-api): Replay-Schutz bei gleichzeitigen Heartbeats
    docs(repo): README um CI-Badge und Inhaltsverzeichnis ergänzt
    refactor(doc-render): HTML- und Typst-Renderer auf gemeinsames Layoutmodell umgestellt
    chore(repo): Node auf 22 angehoben
    test(domain): Testvektoren für GiroCode nach EPC069-12 ergänzt
    style(ui): Tailwind-Klassen mit Prettier-Plugin sortiert
    perf(desktop): Rechnungsliste ab 200 Zeilen virtualisiert

## Definition of Done

- Typecheck, Lint und Tests laufen durch.
- Geschäftslogik hat Unit-Tests.
- Sicherheitsrelevante Änderungen sind in `docs/security.md` oder einem ADR beschrieben.
- Keine Secrets im Repository, `.env.example` ist aktuell.
