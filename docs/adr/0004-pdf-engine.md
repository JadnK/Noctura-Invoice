# ADR-0004: Ein Layoutmodell, zwei Renderer — Vorschau in HTML, PDF ueber Typst

Status: angenommen

## Kontext
Der Master-Prompt nennt HTML-Vorlagen mit PDF-Rendering. Die Anforderung
"PDFs sehen unabhaengig vom Endgeraet gleich aus" vertraegt sich schlecht mit
HTML-nach-PDF ueber die Systemwebview: WebView2, WebKit und WebKitGTK
unterscheiden sich in Zeilenumbruch, Schriftersetzung und Seitenumbruch. Ein
Chromium mitzuliefern kostet ueber 100 MB und bringt eine eigene Update- und
Angriffsflaeche mit.

## Entscheidung
Eine Vorlage ist ein deklaratives Layoutmodell (JSON), kein HTML-Dokument.
Daraus erzeugen zwei Renderer:

- **HTML** fuer die Live-Vorschau im visuellen Editor — schnell, im Fenster.
- **Typst** fuer das PDF — reine Rust-Bibliothek, deterministisches Layout,
  eingebettete Schriften, PDF/A-faehig.

Der visuelle Editor bearbeitet das Modell. Wer HTML-Vorlagen mitbringt, kann sie
importieren; der Import erzeugt daraus das Modell.

## Begruendung
Ein Modell statt zweier Vorlagensprachen heisst: Vorschau und PDF koennen nicht
auseinanderlaufen. Typst rendert ohne Browser, ohne Netzwerk und ohne externen
Prozess, was zugleich die Sicherheitsanforderung "keine beliebige
Script-Ausfuehrung in Vorlagen" erfuellt — das Modell kennt schlicht keinen Code.

## Konsequenzen
- Der CSS-Expertenmodus wirkt nur auf die HTML-Vorschau und auf eine
  Positivliste von Eigenschaften, die sich nach Typst uebersetzen lassen
  (Farbe, Schriftgroesse, Gewicht, Ausrichtung, Abstaende, Rahmen).
  Eigenschaften ausserhalb der Liste werden verworfen, nicht stillschweigend
  uebernommen: eine Vorschau, die anders aussieht als das PDF, waere schlimmer
  als eine abgelehnte Regel.
- Reproduzierbarkeitstests vergleichen erzeugte PDFs seitenweise als Bild gegen
  Referenzdateien.
- ZUGFeRD/Factur-X setzt spaeter auf demselben Weg auf: das PDF/A-3 wird um das
  XML-Anhangsprofil ergaenzt.
