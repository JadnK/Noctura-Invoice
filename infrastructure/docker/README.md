# Betrieb

## Erststart

    cp .env.example .env
    # alle Platzhalter ersetzen, Zufallswerte: openssl rand -base64 48
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    docker compose logs -f license-api

Im Log erscheint genau einmal der Admin-Access-Token. Er steht zusaetzlich in
`/data/secrets/admin-access-token` im Volume `license-secrets` (Rechte 0600).
Ebenfalls beim Erststart erzeugt: das Ed25519-Schluesselpaar. Der oeffentliche
Teil (`license-signing.pub`) muss vor dem Release-Build der Desktop-App nach
`apps/desktop/src-tauri/keys/` kopiert werden; der private Teil verlaesst den
Server nicht.

## Token rotieren

    docker compose exec license-api npm run admin-token:rotate

Bestehende Sitzungen werden dabei widerrufen. Mit `-- --keep-sessions` bleiben sie.

## Reverse Proxy

Der Stack veroeffentlicht keine Ports nach aussen. Vorlagen fuer Caddy und Nginx
liegen unter `infrastructure/reverse-proxy/`. Empfohlen ist Caddy: es verwaltet
TLS selbst und die Konfiguration bleibt kurz.

## Sicherung

    infrastructure/backup/backup.sh /var/backups/noctura

Ein Cron-Eintrag taeglich um 03:15 ist ein sinnvoller Ausgangspunkt. Die
Wiederherstellung fragt vor dem Ueberschreiben nach.

## Healthchecks

- `GET /health` — antwortet, solange der Prozess laeuft.
- `GET /ready` — prueft Datenbank und Signaturschluessel, antwortet sonst mit 503.

Der Compose-Healthcheck nutzt `/health`; ein externes Monitoring sollte `/ready`
abfragen.
