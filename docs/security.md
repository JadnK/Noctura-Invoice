# Sicherheitskonzept

## Schutzziele

1. Geschaeftsdaten des Nutzers bleiben lokal und lesbar — auch bei ungueltiger Lizenz.
2. Zugangsdaten (SMTP, Backup-Passwort, Lizenz-Token) sind nie im Klartext auf Platte.
3. Finalisierte Belege sind nachtraeglich nicht unbemerkt veraenderbar.
4. Der Lizenzserver ist ein lohnendes Ziel und wird entsprechend eng gefuehrt.

## Geheimnisse

| Geheimnis | Ort | Verfahren |
|-----------|-----|-----------|
| SMTP-Passwort | OS-Keychain via Tauri Stronghold | Referenz `secret_ref` in SQLite, nie der Wert |
| Lizenz-Token | Stronghold | Ed25519-signiert, Signatur wird lokal geprueft |
| Backup-Passwort | nur im Speicher | Ableitung Argon2id -> AES-256-GCM |
| Privater Signaturschluessel | ausschliesslich Server, `/data/secrets` | nie im Repository, nie im Image |
| Admin-Access-Token | Server, Datei + scrypt-Hash in DB | einmalige Vollausgabe beim ersten Start |

## Desktop-Haertung

- Tauri-Allowlist minimal: kein `shell.open` mit freiem Argument, kein `fs.all`.
  Dateizugriff auf Export-, Backup- und Anhangsverzeichnis begrenzt (Scopes).
- CSP: `default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline';
  script-src 'self'; connect-src 'self' https://rechnungsapp.jadenk.de`.
- Rechnungsvorlagen sind Daten, kein Code. Das Rendering laeuft ueber einen
  Template-Interpreter mit fester Elementliste; `<script>`, `on*`-Attribute,
  `javascript:`-URLs und externe Ressourcen werden verworfen. Der Expertenmodus
  erlaubt CSS, aber nur aus einer Positivliste von Eigenschaften.
- Dateinamen werden fuer alle drei Betriebssysteme bereinigt: verbotene Zeichen,
  reservierte Namen (CON, PRN, AUX, NUL, COM1-9, LPT1-9), Laengenlimit,
  keine fuehrenden/abschliessenden Punkte oder Leerzeichen, kein `..`.
- Alle SQL-Zugriffe ueber parametrisierte SQLx-Queries. Kein String-Bau.

## Serverhaertung

- Rate-Limits: `/activate` 10/h pro IP und 20/Tag pro Lizenz, `/validate` und
  `/heartbeat` 60/h pro Geraet, Admin-Login 5 Fehlversuche pro 15 min pro IP.
- Replay-Schutz: Client schickt `nonce` (32 Byte) und `timestamp`. Der Server
  verwirft Zeitstempel ausserhalb +/- 300 s und speichert die Nonce in Redis
  fuer 600 s. Antworten enthalten die Nonce signiert zurueck.
- Sicherheitsheader: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`, restriktive CSP, `X-Frame-Options: DENY`.
- Container laufen als nicht privilegierter Nutzer, Root-Dateisystem read-only,
  `no-new-privileges`, nur benoetigte Volumes.
- Fehlerantworten enthalten Code und Fehler-ID, nie Stacktraces oder SQL.

## Geraetekennung

Ableitung aus einem beim ersten Start erzeugten Zufallswert (32 Byte, CSPRNG),
gespeichert in Stronghold, kombiniert mit einem stabilen Installations-Salt:

    device_id = base32( BLAKE3( install_random || app_id )[0..16] )

Keine MAC-Adressen, keine Seriennummern, keine CPU-IDs. Bei Neuinstallation
entsteht eine neue ID — deshalb ist im Admin-Panel das Zuruecksetzen von Geraeten
vorgesehen, und die Fehlermeldung "maximale Geraeteanzahl erreicht" nennt den Weg
zur Deaktivierung des alten Geraets.

## Manipulationserschwerung im Audit-Log

    entry_hash = SHA256( prev_hash || at || action || object_type || object_id
                         || canonical_json(old) || canonical_json(new) )

Der jeweils letzte Hash wird zusaetzlich taeglich in einer separaten Tabelle
verankert. Das verhindert kein Loeschen der gesamten Datenbank, macht aber das
punktuelle Aendern einzelner Eintraege erkennbar. Eine Integritaetspruefung ist
ueber Einstellungen -> Wartung aufrufbar.

## Ausdrueckliche Nicht-Ziele

- Kein Kopierschutz durch Obfuskation. Wer die Binaerdatei patcht, umgeht die
  Lizenzpruefung; das Verfahren schuetzt gegen versehentliche und einfache
  Umgehung, nicht gegen entschlossene Angreifer.
- Keine Remote-Code-Ausfuehrung, kein Nachladen von Skripten, auch nicht fuer Updates.
- Keine Rechts- oder Steuerberatung. Steuerlich relevante Optionen tragen einen
  Hinweis, dass die Konfiguration vom Nutzer bzw. dessen Steuerberatung zu pruefen ist.
