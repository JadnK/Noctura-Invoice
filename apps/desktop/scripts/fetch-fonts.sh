#!/usr/bin/env bash
# Holt die eingebetteten Schriften fuer lokale Builds und CI.
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/fonts"
mkdir -p "$DEST"
MIN_BYTES=2048

valid_font() {
  [ -f "$1" ] && [ "$(wc -c < "$1")" -ge "$MIN_BYTES" ]
}

fetch_file() {
  local url="$1" name="$2" target="$DEST/$name" temporary="$DEST/.${name}.download"

  if valid_font "$target"; then
    echo "vorhanden: $name"
    return
  fi

  echo "lade: $name"
  rm -f "$temporary"
  if ! curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 "$url" -o "$temporary"; then
    rm -f "$temporary"
    echo "Download fehlgeschlagen: $name" >&2
    exit 1
  fi
  if ! valid_font "$temporary"; then
    rm -f "$temporary"
    echo "Antwort fuer $name ist zu klein fuer eine echte Schriftdatei." >&2
    exit 1
  fi
  mv "$temporary" "$target"
}

fetch_inter() {
  local regular="$DEST/Inter-Regular.ttf"
  local semibold="$DEST/Inter-SemiBold.ttf"

  if valid_font "$regular" && valid_font "$semibold"; then
    echo "vorhanden: Inter-Regular.ttf"
    echo "vorhanden: Inter-SemiBold.ttf"
    return
  fi

  command -v unzip >/dev/null 2>&1 || {
    echo "unzip fehlt; bitte installieren, damit Inter entpackt werden kann." >&2
    exit 1
  }

  local temporary
  temporary="$(mktemp -d)"
  trap 'rm -rf "$temporary"' RETURN

  echo "lade: Inter 4.0"
  curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 \
    "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" \
    -o "$temporary/inter.zip"

  local regular_entry semibold_entry
  regular_entry="$(unzip -Z1 "$temporary/inter.zip" | grep -E '(^|/)Inter-Regular\.ttf$' | head -n 1)"
  semibold_entry="$(unzip -Z1 "$temporary/inter.zip" | grep -E '(^|/)Inter-SemiBold\.ttf$' | head -n 1)"

  if [ -z "$regular_entry" ] || [ -z "$semibold_entry" ]; then
    echo "Inter-Archiv enthaelt die erwarteten TTF-Dateien nicht." >&2
    exit 1
  fi

  unzip -p "$temporary/inter.zip" "$regular_entry" > "$temporary/Inter-Regular.ttf"
  unzip -p "$temporary/inter.zip" "$semibold_entry" > "$temporary/Inter-SemiBold.ttf"

  if ! valid_font "$temporary/Inter-Regular.ttf" || ! valid_font "$temporary/Inter-SemiBold.ttf"; then
    echo "Inter-Dateien im Archiv sind ungueltig oder unvollstaendig." >&2
    exit 1
  fi

  mv "$temporary/Inter-Regular.ttf" "$regular"
  mv "$temporary/Inter-SemiBold.ttf" "$semibold"
  rm -rf "$temporary"
  trap - RETURN
}

fetch_inter
fetch_file \
  "https://raw.githubusercontent.com/IBM/plex/v6.4.0/IBM-Plex-Mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf" \
  "IBMPlexMono-Regular.ttf"
fetch_file \
  "https://raw.githubusercontent.com/adobe-fonts/source-serif/4.005R/TTF/SourceSerif4-Regular.ttf" \
  "SourceSerif4-Regular.ttf"

echo "Alle Schriften liegen unter $DEST."
