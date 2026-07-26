# Warum dieses Repository nicht ohne Weiteres läuft

Der Quelltext ist öffentlich, das Produkt ist es nicht. Wer hier `git clone`
ausführt, hat den Code — aber keine betriebsfähige Installation. Das ist
Absicht und kein Versäumnis.

## Zuerst das Ehrliche

Quelltext, der öffentlich liegt, lässt sich technisch nicht am Nachbauen
hindern. Wer Zeit, Kenntnis und Willen hat, bekommt aus diesem Repository ein
laufendes System. Was hier beschrieben ist, erhöht die Hürde und macht die
Grenze deutlich — es ist kein Kopierschutz und wird auch nicht als solcher
ausgegeben.

Die eigentliche Grenze ist rechtlich, nicht technisch: `LICENSE` erlaubt Lesen
und Studieren, nicht den Betrieb. Wer die Software trotzdem betreibt, verletzt
das Nutzungsrecht — unabhängig davon, wie leicht oder schwer es technisch war.

## Was fehlt

| Bestandteil | Warum er fehlt | Folge |
|-------------|----------------|-------|
| Ed25519-Signaturschlüsselpaar der Lizenzen | Der private Teil liegt ausschliesslich auf dem Produktionsserver und wird nie ausgeliefert. Im Repository steht nur ein Platzhalter. | Ohne echten Schlüssel bricht der Release-Build ab (`keys/license-signing.pub`). Ein selbst erzeugtes Paar funktioniert nur mit einem selbst betriebenen Server — und der ist von der Lizenz nicht gedeckt. |
| Updater-Signaturschlüssel | Nur im privaten Schlüsselbund. | Installierte Programme nehmen keine Updates aus fremder Quelle an. |
| Betriebsanleitung mit den tatsächlichen Werten | Liegt ausserhalb des Repositories. | Reverse-Proxy-Zuschnitt, Volumes, Sicherungsziele und Rotationsabläufe sind hier bewusst nur im Prinzip beschrieben. |
| Container-Images | Die Pakete in der Registry sind privat. | `docker compose pull` scheitert ohne Berechtigung. Selbst bauen ginge, ist aber von der Lizenz nicht gedeckt. |
| Schriften | Lizenzrechtlich sauber, aber nicht eingecheckt. | `apps/desktop/scripts/fetch-fonts.sh` holt sie. Das ist die einzige Lücke, die jeder selbst schliessen kann. |

## Was ausdrücklich nicht getan wird

- **Keine Sabotage.** Es gibt keinen Code, der fremde Installationen stört,
  Daten beschädigt oder heimlich etwas meldet. Wer diesen Quelltext liest, kann
  sich darauf verlassen, dass er tut, was dasteht.
- **Keine versteckte Telemetrie.** Der Lizenzserver erhält Schlüssel-Hash,
  Geräte-ID, Programmversion und Betriebssystemfamilie. Sonst nichts. Das ist in
  `docs/adr/0002-lokale-daten.md` festgelegt und im Code nachprüfbar.
- **Keine Verschleierung als Schutzbehauptung.** Der Code ist so lesbar wie
  möglich geschrieben. Obfuskation würde nur die Wartung erschweren und niemanden
  aufhalten, der es ernst meint.

## Für den Rechteinhaber

Die vollständige Betriebsanleitung liegt unter `private/` und ist von `.gitignore`
ausgenommen — sie gehört nicht in ein öffentliches Repository. Sie enthält den
Ablauf für Erststart, Schlüsselerzeugung, Secrets, Ausrollen und Rotation.

Wer diese Datei nicht hat, hat auch die Berechtigung nicht.

## Anfragen

Interesse an einer Lizenz, an Zusammenarbeit oder an einer selbst betriebenen
Installation: Kontakt über das GitHub-Profil. Eine Einzellizenz für den
eigenen Betrieb ist verhandelbar — der Weg dahin führt über ein Gespräch, nicht
über einen Fork.
