# App-Icons

Platzhalter, erzeugt aus einem einfachen Monogramm ("N" auf abgerundetem
Anthrazit-Quadrat mit violetter Kante, Farben aus `packages/ui/src/tokens.css`).
Reicht zum Bauen und Testen, ist aber kein gestaltetes Markenzeichen.

Vor einem echten Release ersetzen: ein 1024×1024-PNG mit transparentem
Rand gestalten lassen, dann:

    npm install -g @tauri-apps/cli
    tauri icon pfad/zum/master.png --output apps/desktop/src-tauri/icons

Das erzeugt automatisch alle hier vorhandenen Varianten (Windows .ico,
macOS .icns, Linux-PNGs, Windows-Store-Kacheln) aus einer einzigen Quelle.
