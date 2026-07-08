/**
 * Abnahmekriterien aus dem Lastenheft, Abschnitt 39.
 *
 * Diese Datei ist die verbindliche Liste: läuft sie durch, gilt das Projekt als
 * funktionsfähig. Sie fährt die echte Anwendung über den Tauri-Treiber, gegen
 * eine Wegwerf-Datenbank und einen lokal gestarteten Lizenzserver aus dem
 * Compose-Stack.
 *
 *   npm run test:e2e
 */
import { expect, test } from '@playwright/test';
import { launchApp, resetDatabase, startLicenseServer, stopAll } from './harness';

test.beforeAll(async () => {
  await resetDatabase();
  await startLicenseServer();
});

test.afterAll(stopAll);

test('1 — die Anwendung startet unter Windows', async () => {
  const app = await launchApp();
  await expect(app.window.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  expect(await app.window.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
});

test('2 — eine Firma lässt sich einrichten', async () => {
  const app = await launchApp();
  await app.window.getByRole('button', { name: 'Einrichtung erneut öffnen' }).click();
  await app.fillCompany({ name: 'Musterfirma GmbH', street: 'Lindenweg 12', postalCode: '10247', city: 'Berlin' });
  await expect(app.window.getByText('Einrichtung abschließen')).toBeVisible();
});

test('3 — ein Kunde lässt sich anlegen', async () => {
  const app = await launchApp();
  const number = await app.createCustomer({ company: 'Steinbach Elektrotechnik GmbH', city: 'Berlin' });
  expect(number).toMatch(/^KD-\d{4}$/);
});

test('4 — ein Produkt lässt sich anlegen', async () => {
  const app = await launchApp();
  await app.createProduct({ sku: 'A-1', name: 'Beratung', netPriceCents: 9500, taxRateBp: 1900 });
  await expect(app.window.getByText('Beratung')).toBeVisible();
});

test('5 — ein Rabatt lässt sich anlegen', async () => {
  const app = await launchApp();
  await app.createDiscount({ name: 'Stammkunde', kind: 'percent', valueBp: 1000 });
  await expect(app.window.getByText('10 %')).toBeVisible();
});

test('6 — eine korrekte Rechnung entsteht', async () => {
  const app = await launchApp();
  const invoice = await app.createInvoice({
    customer: 'Steinbach Elektrotechnik GmbH',
    lines: [{ description: 'Beratung', quantityMilli: 2000, unitPriceCents: 9500, taxRateBp: 1900 }],
  });
  expect(invoice.netTotalCents).toBe(19_000);
  expect(invoice.taxTotalCents).toBe(3_610);
  expect(invoice.grossTotalCents).toBe(22_610);
});

test('7 — Kleinunternehmerrechnungen kommen ohne Umsatzsteuer aus', async () => {
  const app = await launchApp();
  await app.setTaxScheme('small_business');
  const invoice = await app.createInvoice({
    customer: 'Steinbach Elektrotechnik GmbH',
    lines: [{ description: 'Beratung', quantityMilli: 1000, unitPriceCents: 10_000, taxRateBp: 1900 }],
  });
  expect(invoice.taxTotalCents).toBe(0);
  expect(invoice.grossTotalCents).toBe(10_000);
  await expect(app.window.getByText('§ 19 UStG')).toBeVisible();
  await app.setTaxScheme('standard');
});

test('8 — mehrere Steuersätze werden getrennt ausgewiesen', async () => {
  const app = await launchApp();
  const invoice = await app.createInvoice({
    customer: 'Steinbach Elektrotechnik GmbH',
    lines: [
      { description: 'Arbeit', quantityMilli: 1000, unitPriceCents: 10_000, taxRateBp: 1900 },
      { description: 'Buch', quantityMilli: 1000, unitPriceCents: 10_000, taxRateBp: 700 },
    ],
  });
  expect(invoice.taxGroups).toHaveLength(2);
  expect(invoice.taxTotalCents).toBe(2_600);
});

test('9 — Rechnungen lassen sich als PDF exportieren', async () => {
  const app = await launchApp();
  const pdf = await app.exportPdf();
  expect(pdf.pages).toBeGreaterThan(0);
  expect(pdf.sha256).toMatch(/^[0-9a-f]{64}$/);
  // Zweimal erzeugt, gleiche Prüfsumme: das PDF ist reproduzierbar.
  expect((await app.exportPdf()).sha256).toBe(pdf.sha256);
});

test('10 — eigene Logos und Vorlagen werden verwendet', async () => {
  const app = await launchApp();
  await app.uploadLogo('tests/fixtures/logo.png');
  await app.selectTemplate('Standard');
  await expect(app.window.getByRole('img', { name: /logo/i })).toBeVisible();
});

test('11 — Rechnungen gehen über den konfigurierten SMTP-Server hinaus', async () => {
  const app = await launchApp();
  await app.configureSmtp({ host: '127.0.0.1', port: 1025, security: 'none', username: 'test' });
  const result = await app.sendInvoiceByEmail();
  expect(result.status).toBe('sent');
  expect(await app.mailbox()).toHaveLength(1);
});

test('12 — Zugangsdaten liegen im Schlüsselbund, nicht in der Datenbank', async () => {
  const app = await launchApp();
  const dump = await app.dumpDatabase();
  expect(dump).not.toContain('geheimespasswort');
  expect(await app.keychainHasEntry('smtp')).toBe(true);
});

test('13 — die Anwendung spricht mit dem Lizenzserver', async () => {
  const app = await launchApp();
  const state = await app.activateLicense(process.env.TEST_LICENSE_KEY!);
  expect(state.status).toBe('valid');
});

test('14 — eine Lizenz lässt sich offline prüfen', async () => {
  const app = await launchApp();
  await app.goOffline();
  await app.restart();
  await expect(app.window.getByRole('button', { name: 'Neue Rechnung' })).toBeEnabled();
  await app.goOnline();
});

test('15 — Gerätebegrenzungen greifen', async () => {
  const app = await launchApp();
  const second = await app.activateOnFreshDevice(process.env.TEST_LICENSE_KEY!);
  expect(second.errorCode).toBe('LIC_DEVICE_LIMIT');
  await expect(app.window.getByText(/Gerät.*deaktivieren/i)).toBeVisible();
});

test('16 — eine im Admin-Panel gesperrte Lizenz wird erkannt', async () => {
  const app = await launchApp();
  await app.admin.blockLicense('Zahlung offen');
  await app.triggerHeartbeat();
  await expect(app.window.getByText('Lizenz gesperrt')).toBeVisible();
  // Entscheidend: die Daten bleiben zugänglich.
  await expect(app.window.getByRole('button', { name: 'PDF exportieren' })).toBeEnabled();
});

test('17 — Sicherungen lassen sich erstellen und wiederherstellen', async () => {
  const app = await launchApp();
  const backup = await app.createBackup({ password: 'sehr-langes-passwort' });
  expect(backup.encrypted).toBe(true);

  const preview = await app.inspectBackup(backup.path, 'sehr-langes-passwort');
  expect(preview.invoices).toBeGreaterThan(0);

  await expect(app.inspectBackup(backup.path, 'falsch')).rejects.toThrow(/Passwort/);
});

test('18 — Rechnungsdaten erreichen den Lizenzserver nicht', async () => {
  const app = await launchApp();
  const requests = await app.capturedLicenseRequests();
  const body = JSON.stringify(requests);
  for (const forbidden of ['Steinbach', 'Beratung', '22610', 'RE-2026']) {
    expect(body).not.toContain(forbidden);
  }
});

test('19 — finalisierte Rechnungen sind nicht mehr veränderbar', async () => {
  const app = await launchApp();
  const invoice = await app.createInvoice({
    customer: 'Steinbach Elektrotechnik GmbH',
    lines: [{ description: 'Beratung', quantityMilli: 1000, unitPriceCents: 5000, taxRateBp: 1900 }],
  });
  await app.finalize(invoice.id);
  await expect(app.window.getByLabel('Einzelpreis')).toBeDisabled();
  await expect(app.finalize(invoice.id)).rejects.toThrow(/finalisiert/);
});

test('20 — das Audit-Log bleibt lückenlos', async () => {
  const app = await launchApp();
  expect(await app.verifyAuditChain()).toBe(true);
});
