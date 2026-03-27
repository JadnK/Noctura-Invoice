/**
 * Deutsche Formatierung. Alle Anzeigen laufen hierueber, damit Datum, Zahl und
 * Betrag im gesamten Programm gleich aussehen.
 */
import { formatCents } from '@noctura/invoice-core';

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_LONG = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
const QUANTITY = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatDateLong(iso: string): string {
  return DATE_LONG.format(new Date(iso));
}

export function formatQuantity(milli: number): string {
  return QUANTITY.format(milli / 1000);
}

export { formatCents };

/**
 * Betrag in Vorkomma- und Nachkommateil zerlegen. Die Oberflaeche zeigt den
 * Nachkommateil gedaempft, damit die Blicklinie auf den Euro-Betraegen liegt.
 */
export function splitAmount(cents: number, currency = 'EUR'): { whole: string; fraction: string } {
  const full = formatCents(cents, currency);
  const match = full.match(/^(.*)([.,]\d{2})(.*)$/);
  if (!match) return { whole: full, fraction: '' };
  return { whole: match[1], fraction: `${match[2]}${match[3]}` };
}

/** Tage bis zur Faelligkeit, negativ bei Ueberfaelligkeit. */
export function daysUntil(dueIso: string, todayIso: string): number {
  const day = 86_400_000;
  return Math.round((Date.parse(dueIso.slice(0, 10)) - Date.parse(todayIso.slice(0, 10))) / day);
}
