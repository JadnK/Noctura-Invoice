# Sicherheitshinweise melden

Wer eine Schwachstelle findet, darf und soll sie melden. Das gilt unabhängig
davon, dass die Lizenz den Betrieb der Software nicht erlaubt: eine Meldung ist
willkommen, eine laufende Installation Dritter nicht.

## Weg

Nicht als öffentliches Issue. Stattdessen über den privaten Meldeweg dieses
Repositories (GitHub → Security → Report a vulnerability). Falls nicht
verfügbar, per E-Mail an die im Profil hinterlegte Adresse.

Hilfreich in der Meldung:

- betroffene Datei oder Endpunkt
- was ein Angreifer damit erreichen könnte
- ein möglichst kleiner Reproduktionsweg

## Was zusagt wird

- Eingangsbestätigung, sobald die Meldung gelesen wurde.
- Rückmeldung zur Einschätzung, auch wenn der Befund nicht bestätigt wird.
- Nennung im Changelog, wenn gewünscht.

Es gibt kein Bug-Bounty und keine Frist-Zusage. Dies ist ein Ein-Personen-Projekt.

## Bereits bekannt und beabsichtigt

- **Die Lizenzprüfung lässt sich umgehen, wer die Binärdatei verändert.**
  Das steht so in `docs/security.md` unter „Nicht-Ziele". Das Verfahren schützt
  gegen versehentliche und einfache Umgehung, nicht gegen entschlossene
  Angreifer. Meldungen dazu sind keine Neuigkeit.
- **Dieses Repository ist ohne die zurückgehaltenen Bestandteile nicht
  lauffähig.** Fehlende Schlüssel und Konfiguration sind Absicht, kein Fehler.
  Siehe `docs/veroeffentlichung.md`.
