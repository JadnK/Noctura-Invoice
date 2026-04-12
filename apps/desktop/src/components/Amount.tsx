import { splitAmount } from '../lib/format';

/**
 * Betragsanzeige. Tabellenziffern, rechtsbuendig, Nachkommastellen gedaempft.
 * Negative Betraege werden eingefaerbt, nicht nur mit Minuszeichen versehen.
 */
export function Amount({ cents, currency = 'EUR' }: { cents: number; currency?: string }) {
  const { whole, fraction } = splitAmount(cents, currency);
  return (
    <span className={`n-amount${cents < 0 ? ' n-amount--negative' : ''}`}>
      {whole}
      <span className="n-amount__fraction">{fraction}</span>
    </span>
  );
}
