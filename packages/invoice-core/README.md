# @noctura/invoice-core

Reine Rechenlogik ohne I/O, ohne Framework, ohne Abhaengigkeiten. Alles, was mit
Geld, Steuern, Rabatten, Nummern und Belegstatus zu tun hat, steht hier — und nur
hier. UI und Datenbankschicht rufen diese Funktionen auf, rechnen aber nie selbst.

## Warum getrennt

Die Rechenreihenfolge einer Rechnung ist eine fachliche Festlegung, keine
Implementierungsdetailfrage. Sie muss an einer Stelle stehen, testbar sein und
sich im Rust-Core identisch verhalten. Die Testvektoren in `tests/` sind der
Vertrag zwischen beiden Implementierungen.

## Rechenreihenfolge

1. Positionsbetrag = Menge x Einzelpreis, auf Cent gerundet
2. Positionsrabatt abziehen
3. Belegrabatt gewichtet auf die Positionen verteilen, ohne Centverlust
4. Netto ermitteln, bei Bruttopreisen je Steuergruppe herausrechnen
5. Steuer je Steuersatz auf die Gruppensumme berechnen

Schritt 5 ist der Grund, warum die Steuersumme nie von der Summe gerundeter
Positionssteuern abweicht. Ein Beleg mit drei Positionen zu 0,03 EUR weist 0,02 EUR
Steuer aus, nicht 0,03 EUR.

## Einheiten

| Groesse | Darstellung | Beispiel |
|---------|-------------|----------|
| Geld | Integer Cent | `11900` = 119,00 EUR |
| Steuersatz, Prozentrabatt | Basispunkte | `1900` = 19 % |
| Menge | Milli-Einheiten | `1500` = 1,5 |

Fliesskommazahlen kommen im Modul nicht vor. Die einzige Division mit Rundung ist
`divRound`, kaufmaennisch, halbe Werte weg von der Null.

## Tests

    npm test --workspace @noctura/invoice-core
