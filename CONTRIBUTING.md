# Mitwirken

## Branch-Modell

    main            nur getaggte, freigegebene Stände
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
- Geschaeftslogik hat Unit-Tests.
- Sicherheitsrelevante Aenderungen sind in `docs/security.md` oder einem ADR beschrieben.
- Keine Secrets im Repository, `.env.example` ist aktuell.
