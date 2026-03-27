import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  // Tauri liefert die Oberflaeche aus dem Dateisystem; keine externen Quellen.
  build: { target: 'esnext', sourcemap: true, emptyOutDir: true },
});
