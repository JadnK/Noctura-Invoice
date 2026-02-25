# @noctura/ui — Designsystem

## Haltung

Eine Rechnungssoftware wird stundenlang benutzt und dabei nicht bewundert. Die
Oberflaeche tritt zurueck: gedaempfte Nachtpalette mit blauem Unterton, eine
einzige kraeftige Farbe, sonst Grauwerte. Aufmerksamkeit gehoert den Zahlen.

Drei Festlegungen, die das Erscheinungsbild tragen:

**Betraege sind Daten, kein Fliesstext.** Sie stehen in IBM Plex Mono mit
Tabellenziffern, rechtsbuendig, die Nachkommastellen eine Spur gedaempft. In
einer Liste von vierzig Rechnungen liegen alle Kommastellen exakt untereinander.

**Der Belegstatus ist eine Kante, kein Etikett.** Jede Tabellenzeile und jede
Belegkarte traegt links eine 3px-Leiste in der Statusfarbe. Der Status ist damit
im Randbereich des Blicks lesbar, ohne dass Farbe die einzige Information waere —
die Textbeschriftung bleibt immer daneben stehen.

**Hoehe entsteht durch Helligkeit, nicht durch Schatten.** Auf dunklem Grund
verpufft ein Schlagschatten. Stattdessen steigt die Flaechenhelligkeit von
Canvas ueber Sidebar und Surface bis zum Dialog, dazu eine feine helle Oberkante.
Eingabefelder gehen den umgekehrten Weg: sie liegen tiefer als ihre Karte, damit
"hier wird etwas eingegeben" ohne Rahmenkontrast erkennbar ist.

## Verwendung

    import '@noctura/ui/src/tokens.css';
    // tailwind.config.js
    import preset from '@noctura/ui/src/tailwind-preset.js';
    export default { presets: [preset], content: [...] };

Werte niemals hart kodieren. Fehlt ein Token, wird es hier ergaenzt.

## Qualitaetsgrenze

- Fliesstext mindestens 7:1, Sekundaertext 4.5:1, Rahmen 3:1 gegen den Untergrund.
- Fokus ist immer sichtbar; die Regel in `tokens.css` wird nicht ueberschrieben.
- Bedienung vollstaendig ueber Tastatur, Command-Palette auf Strg + K.
- `prefers-reduced-motion` wird respektiert; zusaetzlich gibt es den Schalter
  "Animationen reduzieren" in den Einstellungen.
- Zielaufloesung ab 1280 x 720. Unter 1100px klappt die Sidebar auf Symbole ein,
  der rechte Detailbereich wird zum Overlay.

## Schriften und PDF

Inter und IBM Plex Mono werden mitgeliefert, nicht nachgeladen. Fuer Vorlagen
steht eine kuratierte, ebenfalls mitgelieferte Auswahl bereit (Inter, Source Sans 3,
Source Serif 4, IBM Plex Mono). Nur eingebettete Schriften garantieren, dass ein
PDF auf jedem Geraet gleich aussieht.
