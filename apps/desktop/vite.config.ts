import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Ohne diese Zeile beobachtet Vite das komplette Projektverzeichnis,
      // einschliesslich src-tauri/target/ - dem Rust-Build-Ordner mit der
      // gerade laufenden .exe darin. Unter Windows ist eine laufende .exe
      // gesperrt; Vite versucht trotzdem, sie zu beobachten, und bricht mit
      // EBUSY ab. Das ist kein Sonderfall, sondern das offizielle Tauri-
      // Vite-Muster: der Rust-Build-Ordner gehoert nie zur Beobachtung der
      // Oberflaeche.
      ignored: ['**/src-tauri/**'],
    },
  },

  // Tauri setzt beim Start eine feste Umgebungsvariable; sie an Vite
  // durchreichen, damit dev und build dieselbe Portkonfiguration sehen,
  // auch wenn TAURI_DEV_HOST einen anderen Port erzwingt (z. B. fuer
  // Mobil-Vorschauen spaeter).
  envPrefix: ['VITE_', 'TAURI_'],

  // Tauri liefert die Oberflaeche aus dem Dateisystem; keine externen Quellen.
  build: { target: 'esnext', sourcemap: true, emptyOutDir: true },
});
