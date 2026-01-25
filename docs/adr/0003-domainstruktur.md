# ADR-0003: Ein Host mit Pfadtrennung statt Subdomains

Status: angenommen

## Kontext
Zur Wahl standen `rechnungsapp.jadenk.de` mit `/api/v1` gegen
`api.` und `admin.rechnungsapp.jadenk.de`.

## Entscheidung
Ein Host, Pfadtrennung.

## Begruendung
Das Admin-Panel ist der einzige Browser-Client der API. Auf einem Host ist die
Session ein First-Party-Cookie: keine CORS-Preflights, kein `SameSite=None`, kein
Cross-Site-Cookie, das ein Browser kuenftig einschraenken koennte. Es genuegt ein
Zertifikat und ein Proxy-Block. Die Desktop-App ist kein Browser und von CORS
ohnehin nicht betroffen.

Subdomains waeren sauberer, wenn API und Panel getrennt skaliert, getrennt
betrieben oder von Dritten genutzt wuerden. Beides trifft hier nicht zu; der
Nutzen wiegt die zusaetzliche Cookie- und CORS-Komplexitaet nicht auf.

## Konsequenzen
Sollte spaeter ein Kundenportal oder ein Partner-Zugriff hinzukommen, wird die API
auf `api.rechnungsapp.jadenk.de` gehoben. Deshalb ist der Pfad bereits versioniert
und die API kennt keine relativen Annahmen ueber ihren Mount-Punkt
(`API_BASE_PATH` als Umgebungsvariable).
