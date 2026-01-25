# Lizenzfluss

## Aktivierung

    App                                  Server
     │  Key + device_id + version + nonce + ts
     ├────────── POST /api/v1/licenses/activate ─────────►
     │                                     │ key_hash bilden, Lizenz suchen
     │                                     │ Status, Ablauf, Geraetelimit pruefen
     │                                     │ Geraet anlegen oder wiederverwenden
     │                                     │ Aktivierung protokollieren
     │  ◄──── 200 { token, signature, expires_at } ──────┤
     │  Signatur mit eingebettetem Public Key pruefen
     │  Nonce vergleichen, Zeitstempel pruefen
     │  Token in Stronghold ablegen
     ▼

Token-Payload (JSON, kompakt, Base64url, Ed25519-Signatur getrennt):

    { "lic": "<license_uuid>", "dev": "<device_id>", "plan": "yearly",
      "feat": ["invoices","quotes","credit_notes","templates"],
      "exp": "2027-07-26T00:00:00Z", "iat": "...", "nonce": "...",
      "grace_days": 7, "check_interval_h": 24 }

## Laufender Betrieb

- Beim Start und danach alle 24 h: `POST /licenses/heartbeat`.
- Erfolg: neues Token, `last_ok_at` aktualisieren.
- Fehlschlag durch Netzwerk: Offlinezaehler laeuft weiter, kein Funktionsverlust.
- Ab Tag 5 ohne Kontakt: dezenter Hinweis in der Titelleiste.
- Nach Tag 7: eingeschraenkter Modus.
- Antwort `revoked` oder `expired`: sofort eingeschraenkter Modus, mit Grund.

## Eingeschraenkter Modus

| Funktion | Zustand |
|----------|---------|
| Rechnungen ansehen, suchen, filtern | erlaubt |
| PDF erneut erzeugen und exportieren | erlaubt |
| Backup erstellen und wiederherstellen | erlaubt |
| Zahlungen erfassen | erlaubt |
| Neue Rechnung finalisieren | gesperrt |
| Neues Angebot, neue Gutschrift finalisieren | gesperrt |
| E-Mail-Versand | gesperrt |

Begruendung: Ein Lizenzproblem darf nie dazu fuehren, dass jemand nicht mehr an
seine steuerlich relevanten Unterlagen kommt. Gesperrt wird nur das Erzeugen
neuer Werte, nie der Zugriff auf bestehende.

## Offline-Notaktivierung

Fuer Umgebungen ohne Internet: die App zeigt einen Request-Code (Key-Praefix,
device_id, Zeitstempel, in Base32 mit Pruefziffer). Der Betreiber gibt ihn im
Admin-Panel ein und erhaelt ein signiertes Offline-Token mit kuerzerer Laufzeit
(90 Tage), das der Nutzer abtippt oder einliest. Der Ablauf ist bewusst manuell.

## Fehlercodes

| Code | Bedeutung | Meldung in der App |
|------|-----------|--------------------|
| `LIC_NOT_FOUND` | Schluessel unbekannt | Lizenzschluessel nicht gefunden. Bitte Eingabe pruefen. |
| `LIC_EXPIRED` | abgelaufen | Lizenz am {Datum} abgelaufen. Verlaengern oder Support kontaktieren. |
| `LIC_BLOCKED` | gesperrt | Lizenz gesperrt. Grund: {Grund}. |
| `LIC_DEVICE_LIMIT` | Geraetelimit erreicht | {n} von {n} Geraeten aktiv. Altes Geraet im Kundenkonto deaktivieren. |
| `LIC_CLOCK_SKEW` | Zeitstempel unplausibel | Systemzeit weicht ab. Bitte Uhrzeit korrigieren. |
| `LIC_SIGNATURE` | Signatur ungueltig | Antwort des Lizenzservers konnte nicht geprueft werden. |
| `NET_UNREACHABLE` | kein Kontakt | Lizenzserver nicht erreichbar. Offline nutzbar bis {Datum}. |
