# Betrieb

## Nach jedem `git pull`: neu bauen, nicht nur neu starten

**`docker compose up -d` baut nichts neu** - es startet die vorhandenen
Images unveraendert weiter, auch wenn sich der Code seitdem geaendert hat.
Neuer Code auf dem Server ohne Rebuild zeigt sich z. B. so:
`Route POST:/api/v1/... not found` fuer einen Endpunkt, der im aktuellen
Quelltext laengst existiert - der laufende Container kennt ihn schlicht
noch nicht.

Nach jedem `git pull` deshalb immer:

    git pull
    docker compose -f docker-compose.yml -f docker-compose.prod.yml build
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

Nur `license-api` oder nur `admin-web` einzeln neu zu bauen spart etwas
Zeit, ist aber nur sicher, wenn man genau weiss, dass sich wirklich nur in
diesem einen Dienst etwas geaendert hat - eine Aenderung an der
Lizenzverwaltung betrifft z. B. haeufig beide gleichzeitig (neuer
Endpunkt in `license-api` UND die dazugehoerige Seite in `admin-web`).
Im Zweifel immer beide bauen, wie oben.

## Nach Aenderungen an `schema.prisma`: zusaetzlich das Datenbankschema abgleichen

Ein Rebuild aendert nur den *Code* im Container (und den daraus generierten
Prisma-Client), niemals die *tatsaechliche Datenbank*. Neue Modelle in
`schema.prisma` (z. B. eine neue Tabelle) existieren nach einem Rebuild im
Code, aber nicht in Postgres, bis das Schema separat abgeglichen wird.
Zeigt sich als `P2021: The table ... does not exist in the current
database` - obwohl der Rebuild fehlerfrei durchgelaufen ist.

Nach jeder Aenderung an `schema.prisma` deshalb zusaetzlich zum Rebuild:

    docker compose -f docker-compose.yml -f docker-compose.prod.yml exec license-api npx prisma db push --accept-data-loss

(`exec` statt `run --rm`, sobald der Dienst bereits gesund laeuft - siehe
Abschnitt "Erststart" weiter unten fuer den Ablauf, wenn der Dienst noch
gar nicht erfolgreich startet.)

## Erststart

**Vor dem allerersten Start:** existieren unter `apps/license-api/prisma/migrations/`
noch keine Migrationsdateien (z. B. nach Schemaaenderungen an `schema.prisma`,
die noch nie ueber `prisma migrate dev` in echte SQL-Dateien uebersetzt
wurden), scheitert der Bootstrap-Schritt: die Tabellen existieren nicht in
der Datenbank, `bootstrap.ts` bricht mit "P2021: The table ... does not
exist" ab.

**`docker compose run --rm ... prisma migrate dev` funktioniert dafuer nicht
zuverlaessig:** `--rm` loescht den Container sofort nach dem Befehl wieder -
alle darin neu erzeugten Migrationsdateien liegen nur im Container, nie im
echten Projektordner, und sind mit dem Container weg. Ausserdem kann
`migrate dev` interaktive Rueckfragen stellen, die in einem nicht-
interaktiven `run`-Aufruf ins Leere laufen.

Fuer den Erststart auf einer leeren Datenbank stattdessen `prisma db push`:
das gleicht das Schema direkt mit der Datenbank ab, ganz ohne
Migrationsdateien und ohne Rueckfragen auf einer leeren Datenbank.

    docker compose down
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
    # warten bis postgres "healthy" ist: docker compose ps
    docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm license-api npx prisma db push --accept-data-loss
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

`docker compose run --rm` startet einen einmaligen Container mit
selbstgewaehltem Befehl statt des normalen Startbefehls - Postgres und Redis
muessen dafuer schon laufen (deren Healthchecks haengen nicht an
license-api), aber der crash-loopende license-api-Dienst selbst muss dafuer
nicht laufen.

**Fuer spaetere Schemaaenderungen** (nicht mehr auf einer leeren Datenbank)
sind echte Migrationsdateien der sauberere Weg, weil sie nachvollziehbar
bleiben und sich versionieren lassen. Dafuer `prisma migrate dev` lokal auf
einem Rechner mit direktem Datenbankzugriff ausfuehren (nicht in einem
`--rm`-Container, damit die erzeugten Dateien tatsaechlich im Projektordner
landen), die entstandenen Dateien committen, und ab dann uebernimmt der
normale Startbefehl (`migrate deploy`) das automatische Anwenden bei jedem
weiteren Deploy.

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
