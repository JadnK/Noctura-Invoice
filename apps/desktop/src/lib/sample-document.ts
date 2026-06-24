/** Beispielbeleg fuer Vorschau und Testdruck. Enthaelt bewusst zwei Steuersaetze,
 *  einen Rabatt und eine lange Beschreibung — daran zeigen sich Layoutfehler. */
import type { RenderDocument } from '@noctura/doc-render';

export const SAMPLE_DOCUMENT: RenderDocument = {
  title: 'Rechnung RE-2026-00001',
  addressLines: [
    'Steinbach Elektrotechnik GmbH',
    'Frau Andrea Steinbach',
    'Hauptstraße 5',
    '10115 Berlin',
  ],
  infoRows: [
    { label: 'Rechnungsnummer', value: 'RE-2026-00001' },
    { label: 'Rechnungsdatum', value: '26.07.2026' },
    { label: 'Leistungszeitraum', value: '01.07. – 25.07.2026' },
    { label: 'Kundennummer', value: 'KD-0042' },
    { label: 'Fällig am', value: '09.08.2026' },
  ],
  items: [
    { position: 1, kind: 'item', description: 'Beratung und Aufmaß vor Ort',
      descriptionExtra: 'inklusive Anfahrt innerhalb des Stadtgebiets',
      quantity: '2,5', unit: 'Stunde', unitPrice: '95,00 €', lineTotal: '237,50 €' },
    { position: 2, kind: 'item', description: 'Installationsmaterial',
      quantity: '1', unit: 'Pauschale', unitPrice: '180,00 €', discount: '10 %', lineTotal: '162,00 €' },
    { position: 3, kind: 'item', description: 'Fachliteratur zur Anlagendokumentation',
      quantity: '1', unit: 'Stück', unitPrice: '39,00 €', taxRate: '7 %', lineTotal: '39,00 €' },
  ],
  totals: [
    { label: 'Zwischensumme', value: '456,50 €' },
    { label: 'Rabatt', value: '−18,00 €' },
    { label: 'Nettosumme', value: '438,50 €' },
    { label: 'Bruttobetrag', value: '517,64 €', emphasis: true },
  ],
  taxRows: [
    { label: '19 % Umsatzsteuer', net: '399,50 €', tax: '75,91 €' },
    { label: '7 % Umsatzsteuer', net: '39,00 €', tax: '2,73 €' },
  ],
  context: {
    'firma.name': 'Musterfirma GmbH',
    'firma.strasse': 'Lindenweg 12',
    'firma.plz': '10247',
    'firma.ort': 'Berlin',
    'firma.iban': 'DE89 3704 0044 0532 0130 00',
    'firma.bic': 'COBADEFFXXX',
    'firma.bank': 'Commerzbank',
    'firma.ustId': 'DE123456789',
    'firma.fusszeile': 'Musterfirma GmbH · Amtsgericht Berlin HRB 12345 · Geschäftsführer: Max Mustermann',
    'beleg.nummer': 'RE-2026-00001',
    'beleg.faelligAm': '09.08.2026',
    'beleg.einleitung': 'vielen Dank für Ihren Auftrag. Wir berechnen Ihnen die folgenden Leistungen:',
    'beleg.schlusstext': 'Bitte überweisen Sie den Betrag innerhalb von 14 Tagen ohne Abzug.',
    'kunde.nummer': 'KD-0042',
  },
  giroCode: 'BCD\n002\n1\nSCT\nCOBADEFFXXX\nMusterfirma GmbH\nDE89370400440532013000\nEUR517.64\n\n\nRechnung RE-2026-00001\n',
  isDraft: false,
};
