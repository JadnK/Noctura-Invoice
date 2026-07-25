import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false, // Ein gemeinsamer Datenbestand, deshalb streng nacheinander
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../../.playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
