#!/usr/bin/env bash
# Holt die eingebetteten Schriften. Läuft lokal und im Release-Workflow.
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/fonts"
mkdir -p "$DEST"
MIN_BYTES=2048

is_valid_file() {
  local target="$1"
  [ -f "$target" ] && [ "$(wc -c < "$target")" -ge "$MIN_BYTES" ]
}

validate_file() {
  local target="$1"
  local name="$2"

  if ! is_valid_file "$target"; then
    rm -f "$target"
    echo "Antwort fuer $name ist zu klein fuer eine echte Schriftdatei (vermutlich eine Fehlerseite)." >&2
    echo "URL pruefen oder manuell besorgen, siehe fonts/README.md." >&2
    exit 1
  fi
}

fetch_file() {
  local url="$1"
  local name="$2"
  local target="$DEST/$name"
  local temporary="$target.part"

  if is_valid_file "$target"; then
    echo "vorhanden: $name"
    return
  fi

  echo "lade: $name"
  rm -f "$temporary"
  if ! curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 \
      "$url" -o "$temporary"; then
    rm -f "$temporary"
    echo "Download fehlgeschlagen: $name" >&2
    echo "Manueller Weg: apps/desktop/src-tauri/fonts/README.md" >&2
    exit 1
  fi

  validate_file "$temporary" "$name"
  mv "$temporary" "$target"
}

# Inter stellt seit Version 4 die statischen TTF-Dateien nicht mehr unter dem
# früher verwendeten docs/font-files-Pfad bereit. Deshalb wird das offizielle
# Release-Archiv geladen und die benötigten Dateien unabhängig vom Unterordner
# anhand ihres Dateinamens herausgesucht.
fetch_inter() (
  local regular_target="$DEST/Inter-Regular.ttf"
  local semibold_target="$DEST/Inter-SemiBold.ttf"

  if is_valid_file "$regular_target" && is_valid_file "$semibold_target"; then
    echo "vorhanden: Inter-Regular.ttf"
    echo "vorhanden: Inter-SemiBold.ttf"
    exit 0
  fi

  if ! command -v unzip >/dev/null 2>&1; then
    echo "Zum Entpacken der Inter-Schrift wird 'unzip' benötigt." >&2
    exit 1
  fi

  local temporary_directory
  temporary_directory="$(mktemp -d)"
  trap 'rm -rf "$temporary_directory"' EXIT

  local archive="$temporary_directory/Inter-4.0.zip"
  echo "lade: Inter 4.0"
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 \
    "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" \
    -o "$archive"

  unzip -q "$archive" -d "$temporary_directory/extracted"

  local regular_source
  local semibold_source
  regular_source="$(find "$temporary_directory/extracted" -type f -name 'Inter-Regular.ttf' -print -quit)"
  semibold_source="$(find "$temporary_directory/extracted" -type f -name 'Inter-SemiBold.ttf' -print -quit)"

  if [ -z "$regular_source" ] || [ -z "$semibold_source" ]; then
    echo "Das Inter-Archiv enthält die erwarteten statischen TTF-Dateien nicht." >&2
    exit 1
  fi

  cp "$regular_source" "$regular_target"
  cp "$semibold_source" "$semibold_target"
  validate_file "$regular_target" "Inter-Regular.ttf"
  validate_file "$semibold_target" "Inter-SemiBold.ttf"
)

fetch_inter
fetch_file \
  "https://github.com/IBM/plex/raw/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf" \
  "IBMPlexMono-Regular.ttf"
fetch_file \
  "https://github.com/adobe-fonts/source-serif/raw/4.005R/TTF/SourceSerif4-Regular.ttf" \
  "SourceSerif4-Regular.ttf"

echo "Alle Schriften liegen unter $DEST."
