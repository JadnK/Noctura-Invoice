/** Testumgebung der Oberfläche: Tauri-Aufrufe werden abgefangen, nicht ausgeführt. */
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    throw new Error(`Unerwarteter Aufruf im Test: ${command}`);
  }),
}));

// Deutsche Formatierung ist Teil des Verhaltens und wird mitgetestet.
process.env.TZ = 'Europe/Berlin';
