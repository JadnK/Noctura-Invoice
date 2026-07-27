# Schriften

Diese Dateien sind **nicht im Repository**: sie werden beim Build geholt. Das
hält das Repository klein und macht die Herkunft nachvollziehbar.

    # macOS / Linux / Git Bash / WSL
    bash apps/desktop/scripts/fetch-fonts.sh

    # Windows PowerShell, ohne Git Bash oder WSL
    powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1

Benötigt werden:

| Datei | Schrift | Lizenz |
|-------|---------|--------|
| `Inter-Regular.ttf`, `Inter-SemiBold.ttf` | Inter | SIL Open Font License 1.1 |
| `IBMPlexMono-Regular.ttf` | IBM Plex Mono | SIL Open Font License 1.1 |
| `SourceSerif4-Regular.ttf` | Source Serif 4 | SIL Open Font License 1.1 |

Alle drei dürfen eingebettet und weitergegeben werden. `pdf.rs` bindet sie über
`include_bytes!` ein — deshalb bricht der Build ab, wenn sie fehlen, statt still
auf Systemschriften auszuweichen. Genau das ist gewollt: Systemschriften
unterscheiden sich je Rechner, und ein PDF soll überall gleich aussehen.
