# ADR-0001: Geldbetraege als Integer in Cent

Status: angenommen

## Kontext
Rechnungen verlangen exakte Betraege. IEEE-754-Fliesskommazahlen koennen 0,1 nicht
exakt darstellen; `0.1 + 0.2 !== 0.3`. Bei Rabatten, mehreren Steuersaetzen und
Teilzahlungen summieren sich Fehler zu sichtbaren Centdifferenzen.

## Entscheidung
Alle Geldbetraege sind Integer in der kleinsten Waehrungseinheit. Steuersaetze und
Prozentrabatte sind Integer in Basispunkten. Mengen sind Integer mit drei
Nachkommastellen (`quantity_milli`). Zwischenergebnisse werden in einer skalierten
Ganzzahlarithmetik gefuehrt und erst am definierten Rundungspunkt kaufmaennisch
gerundet (halb auf, weg von der Null). Es gibt genau eine Rundungsfunktion,
in `packages/invoice-core/src/money.ts`.

## Konsequenzen
- Kein `number`-Betrag ueberschreitet Grenzen der sicheren Ganzzahlen, solange
  Betraege unter etwa 90 Billionen Cent bleiben — ausreichend, aber im Rust-Port
  wird `i64` verwendet.
- Eingaben aus der UI und aus CSV-Importen muessen an der Grenze konvertiert werden.
- Der Rundungspunkt liegt je Position (Positionsnetto) und je Steuergruppe
  (Steuerbetrag). Steuerbetraege werden nicht aus gerundeten Positionssteuern summiert.
