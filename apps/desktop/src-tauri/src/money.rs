//! Port der Geldarithmetik aus `packages/invoice-core`.
//!
//! Der Rust-Kern rechnet vor dem Finalisieren erneut und vergleicht das
//! Ergebnis mit dem, was die Oberflaeche geschickt hat. Weichen die Werte ab,
//! wird nichts geschrieben. Beide Implementierungen teilen sich die
//! Testvektoren aus `packages/invoice-core/tests`.

pub const BP_SCALE: i64 = 10_000;
pub const QTY_SCALE: i64 = 1_000;

/// Kaufmaennische Rundung: halbe Werte weg von der Null.
pub fn div_round(numerator: i128, denominator: i128) -> i64 {
    assert!(denominator != 0, "Division durch null");
    let negative = (numerator < 0) != (denominator < 0);
    let abs_num = numerator.abs();
    let abs_den = denominator.abs();
    let quotient = abs_num / abs_den;
    let remainder = abs_num % abs_den;
    let rounded = if remainder * 2 >= abs_den { quotient + 1 } else { quotient };
    let value = if negative { -rounded } else { rounded };
    i64::try_from(value).expect("Betrag verlaesst den darstellbaren Bereich")
}

pub fn mul_div_round(a: i64, b: i64, d: i64) -> i64 {
    div_round(a as i128 * b as i128, d as i128)
}

pub fn apply_bp(amount_cents: i64, bp: i64) -> i64 {
    mul_div_round(amount_cents, bp, BP_SCALE)
}

pub fn reduce_by_bp(amount_cents: i64, bp: i64) -> i64 {
    assert!((0..=BP_SCALE).contains(&bp), "Rabatt ausserhalb 0..100 %");
    mul_div_round(amount_cents, BP_SCALE - bp, BP_SCALE)
}

pub fn net_from_gross(gross_cents: i64, tax_rate_bp: i64) -> i64 {
    mul_div_round(gross_cents, BP_SCALE, BP_SCALE + tax_rate_bp)
}

pub fn line_amount(quantity_milli: i64, unit_price_cents: i64) -> i64 {
    mul_div_round(quantity_milli, unit_price_cents, QTY_SCALE)
}

/// Groesster-Rest-Verfahren. Die Summe der Rueckgabe ist exakt `total_cents`.
pub fn allocate(total_cents: i64, weights: &[i64]) -> Vec<i64> {
    if weights.is_empty() {
        return Vec::new();
    }
    let weight_sum: i128 = weights.iter().map(|w| *w as i128).sum();
    if weight_sum == 0 {
        let even = total_cents / weights.len() as i64;
        let mut parts = vec![even; weights.len()];
        let mut rest = total_cents - even * weights.len() as i64;
        let step = if rest < 0 { -1 } else { 1 };
        let mut i = 0usize;
        while rest != 0 {
            parts[i % parts.len()] += step;
            rest -= step;
            i += 1;
        }
        return parts;
    }

    let mut parts = Vec::with_capacity(weights.len());
    let mut remainders: Vec<(usize, i128)> = Vec::with_capacity(weights.len());
    let mut assigned: i64 = 0;
    for (i, w) in weights.iter().enumerate() {
        let exact = total_cents as i128 * *w as i128;
        let share = (exact / weight_sum) as i64;
        parts.push(share);
        assigned += share;
        remainders.push((i, (exact - share as i128 * weight_sum).abs()));
    }
    let mut leftover = total_cents - assigned;
    let step = if leftover < 0 { -1 } else { 1 };
    remainders.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let mut cursor = 0usize;
    while leftover != 0 {
        parts[remainders[cursor % remainders.len()].0] += step;
        leftover -= step;
        cursor += 1;
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rundet_halbe_werte_von_der_null_weg() {
        assert_eq!(div_round(5, 2), 3);
        assert_eq!(div_round(-5, 2), -3);
        assert_eq!(div_round(1, 3), 0);
    }

    #[test]
    fn steuer_auf_hundert_euro() {
        assert_eq!(apply_bp(10_000, 1900), 1900);
        assert_eq!(net_from_gross(11_900, 1900), 10_000);
    }

    #[test]
    fn verteilung_verliert_keinen_cent() {
        let parts = allocate(100, &[1, 1, 1]);
        assert_eq!(parts.iter().sum::<i64>(), 100);
        assert_eq!(parts, vec![34, 33, 33]);
    }

    #[test]
    fn menge_mal_preis_rundet_erst_am_ende() {
        assert_eq!(line_amount(1500, 3333), 5000);
    }
}
