# Qualitaet: Tests, Barrierefreiheit, Update, Performance

## Teststufen

| Stufe | Werkzeug | Umfang |
|-------|----------|--------|
| Rechenkern | `node --test` | Geld, Steuern, Rabatte, Nummernkreise, Status, Dateinamen |
| Rust-Kern | `cargo test` | Port derselben Regeln, gleiche Testvektoren, Audit-Kette |
| Domaene | `node --test` | IBAN, USt-IdNr., Faelligkeit, GiroCode, Mahnstufen, Zahlungen |
| Datenaustausch | `node --test` | CSV-Erkennung, Import, Validierung, Duplikate |
| Rendering | `node --test` | HTML- und Typst-Ausgabe, Escaping, CSS-Positivliste |
| Lizenz | `node --test` | Signaturen, Aktivierung, Offline-Toleranz, eingeschraenkter Modus |
| Oberflaeche | Vitest + Testing Library | Formulare, Tabellen, Tastaturbedienung |
| Ende zu Ende | Tauri-Treiber, Playwright | die 13 Ablaeufe aus Abschnitt 33 des Lastenhefts |

Die Ende-zu-Ende-Faelle laufen gegen einen Wegwerf-SQLite-Bestand und einen
lokal gestarteten Lizenzserver aus dem Compose-Stack.

## PDF-Reproduzierbarkeit

Referenz-PDFs liegen unter `tests/fixtures/pdf/`. Der Test rendert dieselben
Belegdaten erneut, rastert Seite fuer Seite und vergleicht pixelweise mit einer
Toleranz von 0,1 Prozent abweichender Pixel. Schriften sind eingebettet und
mitgeliefert; Systemschriften werden nie verwendet.

## Barrierefreiheit

- Bedienung vollstaendig ueber Tastatur, Fokusreihenfolge folgt der Lesereihenfolge.
- Sichtbarer Fokusrahmen ueberall, die Regel in `tokens.css` wird nicht ueberschrieben.
- Kontraste: Fliesstext mindestens 7:1, Sekundaertext 4.5:1, Rahmen 3:1.
- Farbe traegt nie allein Information: Belegstatus hat Farbe *und* Text.
- Tabellen mit `<th scope>`, Formularfelder mit verbundenem Label.
- Fehlermeldungen als `role="alert"`, damit Screenreader sie ansagen.
- `prefers-reduced-motion` wird respektiert, zusaetzlich gibt es einen Schalter.
- Zielgroesse fuer Klickflaechen mindestens 32 x 32 Pixel.

## Updates

- Tauri-Updater, Signatur mit eigenem Schluessel, Kanaele `stable` und `beta`.
- Vor jedem Update laeuft automatisch eine Sicherung.
- Kein erzwungenes Update waehrend eines offenen Rechnungseditors: der Hinweis
  wartet, bis der Beleg gespeichert oder verworfen ist.
- Kritische Updates werden serverseitig markiert; die App zeigt sie deutlicher,
  erzwingt sie aber nicht mitten in der Arbeit.
- Schlaegt eine Migration nach dem Update fehl, bleibt die Sicherheitskopie
  erhalten und die App bietet die Wiederherstellung an.

## Performance

Zielwerte auf einem Rechner mit SSD und vier Kernen:

| Vorgang | Ziel |
|---------|------|
| Kaltstart bis bedienbar | unter 2 s |
| Rechnungsliste mit 10.000 Belegen, gefiltert | unter 150 ms |
| Live-Neuberechnung im Editor | unter 16 ms |
| PDF einer einseitigen Rechnung | unter 500 ms |
| Backup mit 1 GB Anhaengen | unter 60 s |

Massnahmen: Indizes aus Migration 0001, virtualisierte Tabellen ab 200 Zeilen,
Berechnung ohne Zwischenobjekte, PDF-Erzeugung im Hintergrundthread.
