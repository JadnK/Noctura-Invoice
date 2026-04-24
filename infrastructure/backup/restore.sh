#!/usr/bin/env bash
# Wiederherstellung. Ueberschreibt Daten und fragt vorher nach.
#   ./restore.sh noctura-db-2026-07-26T10-00-00Z.sql.gz [secrets.tar.gz]

set -euo pipefail

DUMP="${1:?Pfad zum Datenbank-Dump fehlt}"
SECRETS="${2:-}"
COMPOSE="${COMPOSE:-docker compose}"

if [ -f "${DUMP%.sql.gz}.sha256" ]; then
  echo "Pruefsumme wird verifiziert"
  sha256sum -c "${DUMP%.sql.gz}.sha256"
fi

echo "ACHTUNG: Die aktuelle Datenbank wird ersetzt."
read -r -p "Zum Fortfahren 'ja' eingeben: " CONFIRM
[ "$CONFIRM" = "ja" ] || { echo "Abgebrochen."; exit 1; }

$COMPOSE stop license-api admin-web

gunzip -c "$DUMP" | $COMPOSE exec -T postgres psql \
  --username "${POSTGRES_USER:-noctura}" \
  --dbname "${POSTGRES_DB:-noctura}"

if [ -n "$SECRETS" ]; then
  echo "Geheimnisse wiederherstellen"
  $COMPOSE exec -T license-api tar -xzf - -C /data < "$SECRETS"
fi

$COMPOSE start license-api admin-web
echo "Wiederherstellung abgeschlossen. Bitte /ready pruefen."
