# API-Konzept — license-api v1

Basis: `https://rechnungsapp.jadenk.de/api/v1`. Alle Antworten JSON, UTF-8.
Fehler einheitlich:

    { "error": { "code": "LIC_DEVICE_LIMIT", "message": "...", "id": "err_01J..." } }

## Oeffentliche Endpunkte

| Methode | Pfad | Body | Antwort |
|---------|------|------|---------|
| POST | `/licenses/activate` | `key, device_id, app_version, os, nonce, ts` | `token, signature, expires_at, features` |
| POST | `/licenses/validate` | `token, nonce, ts` | `valid, status, expires_at` |
| POST | `/licenses/heartbeat` | `token, device_id, app_version, nonce, ts` | erneuertes `token, signature` |
| POST | `/licenses/deactivate-device` | `key, device_id` | `deactivated: true` |
| GET | `/app/latest-version?channel=stable` | – | `version, critical, min_version, published_at` |
| GET | `/app/release-notes?version=` | – | `version, notes_md` |
| GET | `/health` | – | `status: "ok"` |
| GET | `/ready` | – | `db, redis, signing_key` |

Alle Eingaben werden mit Zod validiert; unbekannte Felder werden verworfen.
`ts` ausserhalb +/- 300 s => `LIC_CLOCK_SKEW`. Verbrauchte Nonce => `LIC_REPLAY`.

## Admin-Endpunkte (`/admin`, Session-Cookie + CSRF-Token)

    POST   /admin/session            Login mit Access-Token, setzt HttpOnly-Cookie
    DELETE /admin/session            Logout
    GET    /admin/licenses           Liste, Filter: status, plan, query, expiring
    POST   /admin/licenses           erstellen
    GET    /admin/licenses/:id       Detail inkl. Geraete und Aktivierungen
    PATCH  /admin/licenses/:id       bearbeiten
    POST   /admin/licenses/:id/block        Grund erforderlich
    POST   /admin/licenses/:id/unblock
    POST   /admin/licenses/:id/extend       neues Ablaufdatum
    POST   /admin/licenses/:id/reset-devices
    DELETE /admin/licenses/:id       archivieren, nicht physisch loeschen
    GET    /admin/devices            Filter nach Lizenz
    POST   /admin/devices/:id/deactivate
    GET    /admin/activations
    GET    /admin/audit-log
    GET    /admin/stats
    POST   /admin/token/rotate       neuer Access-Token, Datei wird neu geschrieben
    GET    /admin/releases           App-Versionen
    POST   /admin/releases
    PATCH  /admin/releases/:id

Der Lizenzschluessel wird nach dem Erstellen genau einmal vollstaendig
zurueckgegeben. Danach nur noch Praefix und Hash.

## OpenAPI

`apps/license-api/openapi.yaml` wird aus den Zod-Schemata erzeugt
(`npm run openapi:generate`) und im Admin-Panel unter `/docs` ausgeliefert.
