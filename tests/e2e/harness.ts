/**
 * Prüfstand für die Ende-zu-Ende-Tests.
 *
 * Startet die gebaute Anwendung über tauri-driver, dazu einen SMTP-Fänger und
 * den Lizenzserver aus dem Compose-Stack. Jeder Lauf beginnt mit einer leeren
 * Datenbank in einem temporären Verzeichnis — Tests dürfen niemals gegen echte
 * Geschäftsdaten laufen.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Harness {
  window: import('@playwright/test').Page;
  [key: string]: unknown;
}

let dataDir: string | null = null;

export async function resetDatabase(): Promise<void> {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = await mkdtemp(join(tmpdir(), 'noctura-e2e-'));
  process.env.NOCTURA_DATA_DIR = dataDir;
}

export async function startLicenseServer(): Promise<void> {
  // Der Stack läuft mit eigenem Volume und eigener Datenbank auf Port 3999.
  spawn('docker', [
    'compose', '-f', 'docker-compose.yml', '-p', 'noctura-e2e', 'up', '-d', '--wait',
  ], { stdio: 'inherit', env: { ...process.env, PORT: '3999' } });
}

export async function launchApp(): Promise<Harness> {
  throw new Error(
    'Der Prüfstand benötigt tauri-driver und einen Release-Build. '
    + 'Siehe docs/qualitaet.md, Abschnitt „Ende zu Ende".',
  );
}

export async function stopAll(): Promise<void> {
  spawn('docker', ['compose', '-p', 'noctura-e2e', 'down', '-v'], { stdio: 'inherit' });
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}
