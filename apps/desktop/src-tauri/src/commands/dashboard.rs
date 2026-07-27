//! Dashboard-Kennzahlen. Eine einzige Abfrage-Sammlung statt vieler
//! Einzelaufrufe, damit die Seite auch mit vielen Belegen sofort steht.

use crate::commands::db;
use crate::error::ErrorPayloadWrapper;
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevenuePoint {
    pub month: String,
    pub cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProduct {
    pub name: String,
    pub quantity_milli: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub revenue_month_cents: i64,
    pub revenue_year_cents: i64,
    pub open_cents: i64,
    pub overdue_cents: i64,
    pub draft_count: i64,
    pub paid_count: i64,
    pub cancelled_count: i64,
    pub average_payment_days: i64,
    pub active_customers: i64,
    pub revenue_series: Vec<RevenuePoint>,
    pub status_split: Vec<StatusCount>,
    pub top_products: Vec<TopProduct>,
}

const MONTH_NAMES: [&str; 12] = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

#[tauri::command]
pub async fn dashboard_data() -> Result<DashboardData, ErrorPayloadWrapper> {
    let pool = db::pool();

    let revenue_month_cents: i64 = sqlx::query_scalar(
        "SELECT
           COALESCE((SELECT SUM(gross_total_cents) FROM invoice
                     WHERE deleted_at IS NULL AND status != 'draft'
                       AND strftime('%Y-%m', issue_date) = strftime('%Y-%m','now')), 0)
           -
           COALESCE((SELECT SUM(gross_total_cents) FROM credit_note
                     WHERE status != 'draft'
                       AND strftime('%Y-%m', issue_date) = strftime('%Y-%m','now')), 0)",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;
    let revenue_year_cents: i64 = sqlx::query_scalar(
        "SELECT
           COALESCE((SELECT SUM(gross_total_cents) FROM invoice
                     WHERE deleted_at IS NULL AND status != 'draft'
                       AND strftime('%Y', issue_date) = strftime('%Y','now')), 0)
           -
           COALESCE((SELECT SUM(gross_total_cents) FROM credit_note
                     WHERE status != 'draft'
                       AND strftime('%Y', issue_date) = strftime('%Y','now')), 0)",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;
    let open_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(MAX(
                   i.gross_total_cents - i.paid_cents - COALESCE(cn.credit_cents, 0), 0
                 )), 0)
         FROM invoice i
         LEFT JOIN (
           SELECT origin_invoice_id, SUM(gross_total_cents) credit_cents
           FROM credit_note WHERE status != 'draft' GROUP BY origin_invoice_id
         ) cn ON cn.origin_invoice_id = i.id
         WHERE i.deleted_at IS NULL
           AND i.status NOT IN ('draft','cancelled','paid','uncollectible','archived')",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;
    let overdue_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(MAX(
                   i.gross_total_cents - i.paid_cents - COALESCE(cn.credit_cents, 0), 0
                 )), 0)
         FROM invoice i
         LEFT JOIN (
           SELECT origin_invoice_id, SUM(gross_total_cents) credit_cents
           FROM credit_note WHERE status != 'draft' GROUP BY origin_invoice_id
         ) cn ON cn.origin_invoice_id = i.id
         WHERE i.deleted_at IS NULL
           AND i.status NOT IN ('draft','cancelled','paid','uncollectible','archived')
           AND i.due_date < date('now')",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;
    let draft_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice WHERE status = 'draft'")
        .fetch_one(pool).await.map_err(crate::error::AppError::from)?;
    let paid_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice WHERE status = 'paid'")
        .fetch_one(pool).await.map_err(crate::error::AppError::from)?;
    let cancelled_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice WHERE status = 'cancelled'")
        .fetch_one(pool).await.map_err(crate::error::AppError::from)?;

    let average_payment_days: Option<f64> = sqlx::query_scalar(
        "SELECT AVG(julianday(payments.last_paid_on) - julianday(i.issue_date))
         FROM invoice i
         JOIN (
           SELECT invoice_id, MAX(paid_on) last_paid_on, SUM(amount_cents) paid_cents
           FROM invoice_payment GROUP BY invoice_id
         ) payments ON payments.invoice_id=i.id
         WHERE payments.paid_cents >= i.gross_total_cents AND i.gross_total_cents > 0",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;

    let active_customers: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT customer_id) FROM invoice
         WHERE deleted_at IS NULL AND status != 'draft' AND issue_date >= date('now', '-12 months')",
    )
    .fetch_one(pool)
    .await
    .map_err(crate::error::AppError::from)?;

    let mut revenue_series = Vec::with_capacity(6);
    for offset in (0..6).rev() {
        let row = sqlx::query(
            "SELECT strftime('%Y-%m', date('now', ?1)) AS ym,
                    COALESCE((SELECT SUM(gross_total_cents) FROM invoice
                              WHERE deleted_at IS NULL AND status != 'draft'
                                AND strftime('%Y-%m', issue_date) = strftime('%Y-%m', date('now', ?1))), 0)
                    -
                    COALESCE((SELECT SUM(gross_total_cents) FROM credit_note
                              WHERE status != 'draft'
                                AND strftime('%Y-%m', issue_date) = strftime('%Y-%m', date('now', ?1))), 0)
                    AS cents",
        )
        .bind(format!("-{offset} months"))
        .fetch_one(pool)
        .await
        .map_err(crate::error::AppError::from)?;

        let ym: String = row.get("ym");
        let month_index: usize = ym[5..7].parse::<usize>().unwrap_or(1).saturating_sub(1).min(11);
        revenue_series.push(RevenuePoint { month: MONTH_NAMES[month_index].to_string(), cents: row.get("cents") });
    }

    let status_rows = sqlx::query("SELECT status, COUNT(*) AS n FROM invoice GROUP BY status")
        .fetch_all(pool)
        .await
        .map_err(crate::error::AppError::from)?;
    let status_split = status_rows
        .into_iter()
        .map(|row| StatusCount { status: row.get("status"), count: row.get("n") })
        .collect();

    let top_products = crate::repo::products::top_selling(pool, 5)
        .await?
        .into_iter()
        .map(|(name, quantity_milli)| TopProduct { name, quantity_milli })
        .collect();

    Ok(DashboardData {
        revenue_month_cents, revenue_year_cents, open_cents, overdue_cents,
        draft_count, paid_count, cancelled_count,
        average_payment_days: average_payment_days.unwrap_or(0.0).round() as i64,
        active_customers, revenue_series, status_split, top_products,
    })
}
