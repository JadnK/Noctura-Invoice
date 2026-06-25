#!/usr/bin/env bash
# Holt die eingebetteten Schriften. Läuft lokal und im Release-Workflow.
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/fonts"
mkdir -p "$DEST"

fetch() {
  local url="$1" name="$2"
  if [ -f "$DEST/$name" ]; then echo "vorhanden: $name"; return; fi
  echo "lade: $name"
  curl -fsSL "$url" -o "$DEST/$name"
}

INTER=https://github.com/rsms/inter/raw/v4.0/docs/font-files
PLEX=https://github.com/IBM/plex/raw/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf
SERIF=https://github.com/adobe-fonts/source-serif/raw/4.005R/TTF

fetch "$INTER/Inter-Regular.ttf"        Inter-Regular.ttf
fetch "$INTER/Inter-SemiBold.ttf"       Inter-SemiBold.ttf
fetch "$PLEX/IBMPlexMono-Regular.ttf"   IBMPlexMono-Regular.ttf
fetch "$SERIF/SourceSerif4-Regular.ttf" SourceSerif4-Regular.ttf

echo "Alle Schriften liegen unter $DEST."
