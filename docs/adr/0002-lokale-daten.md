# ADR-0002: Rechnungsdaten bleiben lokal

Status: angenommen

## Kontext
Der Lizenzserver ist erreichbar und koennte Telemetrie oder Backups aufnehmen. Das
waere bequem, verschiebt aber die Verantwortung fuer personenbezogene und
steuerlich relevante Daten zum Betreiber.

## Entscheidung
Der Lizenzserver empfaengt ausschliesslich: Lizenzschluessel-Hash, Geraete-ID,
App-Version, Betriebssystemfamilie, Zeitstempel, Nonce. Kein Firmenname, keine
Kundendaten, keine Betraege, keine Dateinamen. Telemetrie ist standardmaessig aus
und ohne ausdrueckliche Zustimmung nicht aktiv.

## Konsequenzen
- Kein serverseitiges Backup, kein Cloud-Sync in v1. Datensicherung ist lokal und
  liegt in der Verantwortung des Nutzers; die App macht es ihm leicht.
- Ein Kundenportal waere ein eigenes, getrennt zu betreibendes Modul mit eigener
  Datenhaltung und eigener Datenschutzbetrachtung. Das Datenmodell ist vorbereitet,
  die Umsetzung nicht Teil von v1.
