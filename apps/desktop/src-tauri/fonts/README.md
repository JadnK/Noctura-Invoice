# Schriften

Diese Dateien sind **nicht im Repository**: sie werden beim Build geholt. Das
hält das Repository klein und macht die Herkunft nachvollziehbar.

    # macOS / Linux / Git Bash / WSL
    bash apps/desktop/scripts/fetch-fonts.sh

    # Windows PowerShell, ohne Git Bash oder WSL
    powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\fetch-fonts.ps1

**Ehrlicher Hinweis:** Die in den Skripten hinterlegten Pfade wurden ohne
Netzzugriff zusammengestellt und nicht gegen die tatsächlichen Repositories
geprüft. Schlägt der automatische Download fehl — falsche URL, Firmenproxy,
abgelaufener Tag-Name — hilft nur der manuelle Weg unten.

## Manuell besorgen

Die vier Dateien von den offiziellen Quellen laden und unter
`apps/desktop/src-tauri/fonts/` mit exakt diesem Dateinamen ablegen.

| Datei | Offizielle Quelle |
|-------|--------------------|
| `Inter-Regular.ttf`, `Inter-SemiBold.ttf` | https://rsms.me/inter/ → "Download" → ZIP entpacken, aus `Inter Desktop/` |
| `IBMPlexMono-Regular.ttf` | https://github.com/IBM/plex/releases → aktuellstes Release → `IBM-Plex-Mono.zip` → `fonts/complete/ttf/` |
| `SourceSerif4-Regular.ttf` | https://github.com/adobe-fonts/source-serif/releases → aktuellstes Release → `.zip` → `TTF/` |

Alle drei stehen unter der SIL Open Font License 1.1 und dürfen eingebettet
und weitergegeben werden. Der genaue Dateiname ist wichtig — `pdf.rs` bindet
sie über `include_bytes!` mit fest verdrahtetem Pfad ein, Groß-/Kleinschreibung
eingeschlossen. Danach erkennt `build.rs` die Dateien automatisch beim
nächsten Build.

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
