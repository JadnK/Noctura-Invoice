//! Berechnung und Finalisierung von Rechnungen.
//!
//! `calculate_preview` liefert dieselben Zahlen wie `invoice-core` im Renderer.
//! `finalize_invoice` rechnet ein zweites Mal und schreibt nur, wenn beide
//! Ergebnisse uebereinstimmen.

use crate::error::ErrorPayloadWrapper;
use crate::money::{allocate, apply_bp, line_amount, net_from_gross, reduce_by_bp};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineInput {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub quantity_milli: i64,
    #[serde(default)]
    pub unit_price_cents: i64,
    #[serde(default)]
    pub tax_rate_bp: i64,
    #[serde(default)]
    pub discount_kind: Option<String>,
    #[serde(default)]
    pub discount_value: i64,
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub prices_include_tax: bool,
    pub tax_scheme: String,
    pub lines: Vec<LineInput>,
    #[serde(default)]
    pub document_discount_kind: Option<String>,
    #[serde(default)]
    pub document_discount_value: i64,
    #[serde(default)]
    pub paid_cents: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaxGroup {
    pub tax_rate_bp: i64,
    pub net_cents: i64,
    pub tax_cents: i64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CalculationResult {
    pub net_total_cents: i64,
    pub tax_total_cents: i64,
    pub gross_total_cents: i64,
    pub document_discount_cents: i64,
    pub tax_groups: Vec<TaxGroup>,
    pub open_cents: i64,
}

fn zero_tax(scheme: &str) -> bool {
    matches!(scheme, "small_business" | "reverse_charge" | "intra_community" | "tax_exempt")
}

fn discount_amount(base: i64, kind: Option<&str>, value: i64) -> i64 {
    match kind {
        Some("percent") => base - reduce_by_bp(base, value),
        Some("fixed") => {
            if base >= 0 { value.min(base) } else { (-value).max(base) }
        }
        _ => 0,
    }
}

pub fn calculate(input: &DocumentInput) -> CalculationResult {
    let exempt = zero_tax(&input.tax_scheme);

    let mut effective: Vec<(i64, i64)> = Vec::new(); // (Steuersatz, Betrag nach Positionsrabatt)
    for line in input.lines.iter().filter(|l| l.kind == "item" && !l.hidden) {
        let raw = line_amount(line.quantity_milli, line.unit_price_cents);
        let discount = discount_amount(raw, line.discount_kind.as_deref(), line.discount_value);
        let rate = if exempt { 0 } else { line.tax_rate_bp };
        effective.push((rate, raw - discount));
    }

    let after_line: i64 = effective.iter().map(|(_, amount)| *amount).sum();
    let document_discount = discount_amount(
        after_line,
        input.document_discount_kind.as_deref(),
        input.document_discount_value,
    );
    let weights: Vec<i64> = effective.iter().map(|(_, amount)| *amount).collect();
    let shares = allocate(document_discount, &weights);

    let mut by_rate: BTreeMap<i64, i64> = BTreeMap::new();
    for (index, (rate, amount)) in effective.iter().enumerate() {
        *by_rate.entry(*rate).or_insert(0) += amount - shares.get(index).copied().unwrap_or(0);
    }

    let mut groups = Vec::new();
    let (mut net_total, mut tax_total) = (0i64, 0i64);
    for (rate, amount) in by_rate {
        let (net, tax) = if input.prices_include_tax && !exempt {
            let net = net_from_gross(amount, rate);
            (net, amount - net)
        } else if exempt {
            (amount, 0)
        } else {
            (amount, apply_bp(amount, rate))
        };
        net_total += net;
        tax_total += tax;
        groups.push(TaxGroup { tax_rate_bp: rate, net_cents: net, tax_cents: tax });
    }

    let gross = net_total + tax_total;
    CalculationResult {
        net_total_cents: net_total,
        tax_total_cents: tax_total,
        gross_total_cents: gross,
        document_discount_cents: document_discount,
        tax_groups: groups,
        open_cents: gross - input.paid_cents,
    }
}

#[tauri::command]
pub fn calculate_preview(input: DocumentInput) -> CalculationResult {
    calculate(&input)
}

/// Finalisierung.
///
/// Der Vergleich mit den Werten aus der Oberfläche ist die eigentliche
/// Sicherung: stimmen sie nicht überein, wird nichts geschrieben. Danach
/// übernimmt `repo::invoices::finalize` in einer einzigen Transaktion.
#[tauri::command]
pub async fn finalize_invoice(
    invoice_id: String,
    input: DocumentInput,
    expected_gross_cents: i64,
) -> Result<crate::repo::invoices::FinalizeResult, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("invoices.finalize").await?;
    let device_id = crate::commands::license::device_id().await?;

    let result = crate::repo::invoices::finalize(
        crate::commands::db::pool(),
        crate::repo::invoices::FinalizeContext {
            invoice_id: &invoice_id,
            input: &input,
            expected_gross_cents,
            user_id: "local",
            device_id: &device_id,
        },
    )
    .await?;

    Ok(result)
}

/// Storniert einen finalisierten Beleg. Der Beleg bleibt bestehen; daneben
/// tritt eine Stornorechnung mit eigenem Nummernkreis.
#[tauri::command]
pub async fn cancel_invoice(
    invoice_id: String,
    reason: String,
) -> Result<String, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("invoices.cancel").await?;
    let device_id = crate::commands::license::device_id().await?;
    Ok(crate::repo::invoices::cancel(
        crate::commands::db::pool(),
        &invoice_id,
        &reason,
        "local",
        &device_id,
    )
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(id: &str, qty: i64, price: i64, rate: i64) -> LineInput {
        LineInput {
            id: id.into(), kind: "item".into(), quantity_milli: qty, unit_price_cents: price,
            tax_rate_bp: rate, discount_kind: None, discount_value: 0, hidden: false,
        }
    }

    fn doc(lines: Vec<LineInput>, scheme: &str) -> DocumentInput {
        DocumentInput {
            prices_include_tax: false, tax_scheme: scheme.into(), lines,
            document_discount_kind: None, document_discount_value: 0, paid_cents: 0,
        }
    }

    // Gleiche Testvektoren wie packages/invoice-core/tests/calculate.test.ts
    #[test]
    fn einfache_nettorechnung() {
        let r = calculate(&doc(vec![line("a", 2000, 5000, 1900)], "standard"));
        assert_eq!(r.net_total_cents, 10_000);
        assert_eq!(r.tax_total_cents, 1_900);
        assert_eq!(r.gross_total_cents, 11_900);
    }

    #[test]
    fn steuer_je_gruppe_statt_je_position() {
        let lines = vec![line("a", 1000, 3, 1900), line("b", 1000, 3, 1900), line("c", 1000, 3, 1900)];
        let r = calculate(&doc(lines, "standard"));
        assert_eq!(r.net_total_cents, 9);
        assert_eq!(r.tax_total_cents, 2);
    }

    #[test]
    fn kleinunternehmer_ohne_umsatzsteuer() {
        let r = calculate(&doc(vec![line("a", 1000, 10_000, 1900)], "small_business"));
        assert_eq!(r.tax_total_cents, 0);
        assert_eq!(r.gross_total_cents, 10_000);
    }

    #[test]
    fn mehrere_steuersaetze() {
        let lines = vec![line("a", 1000, 10_000, 1900), line("b", 1000, 10_000, 700)];
        let r = calculate(&doc(lines, "standard"));
        assert_eq!(r.tax_total_cents, 2_600);
        assert_eq!(r.tax_groups.len(), 2);
    }
}
