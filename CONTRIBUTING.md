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

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`,
`build:`, `ci:`. Scope in Klammern, z. B. `feat(invoice-core): Steuergruppierung`.

## Definition of Done

- Typecheck, Lint und Tests laufen durch.
- Geschäftslogik hat Unit-Tests.
- Sicherheitsrelevante Änderungen sind in `docs/security.md` oder einem ADR beschrieben.
- Keine Secrets im Repository, `.env.example` ist aktuell.
