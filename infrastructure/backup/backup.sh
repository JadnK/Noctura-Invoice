#!/usr/bin/env bash
# Sicherung der Lizenzdatenbank und der Servergeheimnisse.
#   ./backup.sh [zielverzeichnis]
#
# Erzeugt einen komprimierten pg_dump und eine Kopie von /data/secrets,
# beides mit SHA-256-Pruefsumme. Aeltere Sicherungen werden nach
# RETENTION_DAYS entfernt.

set -euo pipefail

TARGET_DIR="${1:-/var/backups/noctura}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
COMPOSE="${COMPOSE:-docker compose}"

mkdir -p "$TARGET_DIR"

DUMP="$TARGET_DIR/noctura-db-$STAMP.sql.gz"
echo "Datenbank sichern nach $DUMP"
$COMPOSE exec -T postgres pg_dump \
  --username "${POSTGRES_USER:-noctura}" \
  --dbname "${POSTGRES_DB:-noctura}" \
  --format plain --no-owner --no-privileges \
  | gzip -9 > "$DUMP"

SECRETS="$TARGET_DIR/noctura-secrets-$STAMP.tar.gz"
echo "Geheimnisse sichern nach $SECRETS"
$COMPOSE exec -T license-api tar -czf - -C /data secrets > "$SECRETS"
chmod 600 "$SECRETS"

sha256sum "$DUMP" "$SECRETS" > "$TARGET_DIR/noctura-$STAMP.sha256"

echo "Sicherungen aelter als $RETENTION_DAYS Tage entfernen"
find "$TARGET_DIR" -name 'noctura-*' -type f -mtime "+$RETENTION_DAYS" -delete

echo "Fertig. Pruefsummen: $TARGET_DIR/noctura-$STAMP.sha256"
echo "Hinweis: Die Datei mit den Geheimnissen enthaelt den privaten Signaturschluessel."
echo "Sie gehoert an einen Ort mit demselben Schutzniveau wie der Server selbst."
