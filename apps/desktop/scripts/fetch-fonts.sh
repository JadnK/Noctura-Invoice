#!/usr/bin/env bash
# Holt die eingebetteten Schriften. Läuft lokal und im Release-Workflow.
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/fonts"
mkdir -p "$DEST"

# Eine Schriftdatei ist nie kleiner als ein paar KB. Kommt stattdessen eine
# Fehlerseite zurueck, faellt das hier auf statt still eine kaputte Datei
# abzulegen, die erst beim Kompilieren als raetselhafter Fehler auftaucht.
MIN_BYTES=2048

fetch() {
  local url="$1" name="$2" target="$DEST/$name"

  if [ -f "$target" ] && [ "$(wc -c < "$target")" -ge "$MIN_BYTES" ]; then
    echo "vorhanden: $name"
    return
  fi

  echo "lade: $name"
  if ! curl -fsSL --connect-timeout 10 "$url" -o "$target"; then
    rm -f "$target"
    echo ""
    echo "  Download fehlgeschlagen: $name" >&2
    echo "  Moegliche Ursachen: kein Netzzugriff auf GitHub, oder die hinterlegte" >&2
    echo "  URL stimmt nicht mehr. Manueller Weg: siehe" >&2
    echo "  apps/desktop/src-tauri/fonts/README.md, Abschnitt 'Manuell besorgen'." >&2
    echo "" >&2
    exit 1
  fi

  if [ "$(wc -c < "$target")" -lt "$MIN_BYTES" ]; then
    rm -f "$target"
    echo "Antwort fuer $name ist zu klein fuer eine echte Schriftdatei (vermutlich eine Fehlerseite)." >&2
    echo "URL pruefen oder manuell besorgen, siehe fonts/README.md." >&2
    exit 1
  fi
}

INTER=https://github.com/rsms/inter/raw/v4.0/docs/font-files
PLEX=https://github.com/IBM/plex/raw/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf
SERIF=https://github.com/adobe-fonts/source-serif/raw/4.005R/TTF

fetch "$INTER/Inter-Regular.ttf"        Inter-Regular.ttf
fetch "$INTER/Inter-SemiBold.ttf"       Inter-SemiBold.ttf
fetch "$PLEX/IBMPlexMono-Regular.ttf"   IBMPlexMono-Regular.ttf
fetch "$SERIF/SourceSerif4-Regular.ttf" SourceSerif4-Regular.ttf

echo "Alle Schriften liegen unter $DEST."
