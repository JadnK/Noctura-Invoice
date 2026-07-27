//! Auswertungen aus echten SQLite-Belegdaten.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::NaiveDate;
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReportRow {
    pub month: String,
    pub gross_cents: i64,
    pub net_cents: i64,
    pub invoice_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VatReportRow {
    pub tax_rate_bp: i64,
    pub net_cents: i64,
    pub tax_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerReportRow {
    pub customer_name: String,
    pub gross_cents: i64,
    pub invoice_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusReportRow {
    pub status: String,
    pub count: i64,
    pub gross_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportData {
    pub from: String,
    pub to: String,
    pub revenue_gross_cents: i64,
    pub revenue_net_cents: i64,
    pub tax_cents: i64,
    pub paid_cents: i64,
    pub outstanding_cents: i64,
    pub invoice_count: i64,
    pub average_invoice_cents: i64,
    pub monthly: Vec<MonthlyReportRow>,
    pub vat: Vec<VatReportRow>,
    pub top_customers: Vec<CustomerReportRow>,
    pub statuses: Vec<StatusReportRow>,
}

fn parse_period(from: &str, to: &str) -> Result<(), AppError> {
    let from_date = NaiveDate::parse_from_str(from, "%Y-%m-%d")
        .map_err(|_| AppError::MissingFields("gültiges Startdatum".into()))?;
    let to_date = NaiveDate::parse_from_str(to, "%Y-%m-%d")
        .map_err(|_| AppError::MissingFields("gültiges Enddatum".into()))?;
    if from_date > to_date {
        return Err(AppError::MissingFields("Startdatum vor Enddatum".into()));
    }
    Ok(())
}


#[tauri::command]
pub async fn report_data(from: String, to: String) -> Result<ReportData, ErrorPayloadWrapper> {
    parse_period(&from, &to)?;

    let totals = sqlx::query(
        "SELECT
           COALESCE((SELECT SUM(gross_total_cents) FROM invoice
                     WHERE deleted_at IS NULL AND status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0)
           - COALESCE((SELECT SUM(gross_total_cents) FROM credit_note
                       WHERE status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0) gross,
           COALESCE((SELECT SUM(net_total_cents) FROM invoice
                     WHERE deleted_at IS NULL AND status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0)
           - COALESCE((SELECT SUM(net_total_cents) FROM credit_note
                       WHERE status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0) net,
           COALESCE((SELECT SUM(tax_total_cents) FROM invoice
                     WHERE deleted_at IS NULL AND status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0)
           - COALESCE((SELECT SUM(tax_total_cents) FROM credit_note
                       WHERE status != 'draft' AND issue_date BETWEEN ?1 AND ?2), 0) tax,
           COALESCE((SELECT COUNT(*) FROM invoice
                     WHERE deleted_at IS NULL AND status NOT IN ('draft','cancelled')
                       AND issue_date BETWEEN ?1 AND ?2), 0) invoice_count",
    )
    .bind(&from)
    .bind(&to)
    .fetch_one(db::pool())
    .await?;
    let gross: i64 = totals.get("gross");
    let invoice_count: i64 = totals.get("invoice_count");

    let paid_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents),0)
         FROM invoice_payment WHERE paid_on BETWEEN ?1 AND ?2",
    )
    .bind(&from)
    .bind(&to)
    .fetch_one(db::pool())
    .await?;

    let outstanding_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(MAX(
                   i.gross_total_cents - i.paid_cents - COALESCE(cn.credit_cents, 0), 0
                 )), 0)
         FROM invoice i
         LEFT JOIN (
           SELECT origin_invoice_id, SUM(gross_total_cents) credit_cents
           FROM credit_note WHERE status != 'draft' GROUP BY origin_invoice_id
         ) cn ON cn.origin_invoice_id=i.id
         WHERE i.deleted_at IS NULL
           AND i.status NOT IN ('draft','cancelled','paid','uncollectible','archived')
           AND i.issue_date BETWEEN ?1 AND ?2",
    )
    .bind(&from)
    .bind(&to)
    .fetch_one(db::pool())
    .await?;

    let monthly = sqlx::query(
        "SELECT month, COALESCE(SUM(gross),0) gross, COALESCE(SUM(net),0) net,
                COALESCE(SUM(invoice_count),0) invoice_count
         FROM (
           SELECT substr(issue_date,1,7) month, gross_total_cents gross,
                  net_total_cents net,
                  CASE WHEN status='cancelled' THEN 0 ELSE 1 END invoice_count
           FROM invoice
           WHERE deleted_at IS NULL AND status != 'draft' AND issue_date BETWEEN ?1 AND ?2
           UNION ALL
           SELECT substr(issue_date,1,7), -gross_total_cents, -net_total_cents, 0
           FROM credit_note
           WHERE status != 'draft' AND issue_date BETWEEN ?1 AND ?2
         ) activity
         GROUP BY month ORDER BY month",
    )
    .bind(&from)
    .bind(&to)
    .fetch_all(db::pool())
    .await?
    .into_iter()
    .map(|row| MonthlyReportRow {
        month: row.get("month"),
        gross_cents: row.get("gross"),
        net_cents: row.get("net"),
        invoice_count: row.get("invoice_count"),
    })
    .collect();

    let vat = sqlx::query(
        "SELECT tax_rate_bp, COALESCE(SUM(net),0) net, COALESCE(SUM(tax),0) tax
         FROM (
           SELECT s.tax_rate_bp, s.net_cents net, s.tax_cents tax
           FROM invoice_tax_summary s
           JOIN invoice i ON i.id=s.invoice_id
           WHERE i.deleted_at IS NULL AND i.status != 'draft'
             AND i.issue_date BETWEEN ?1 AND ?2
           UNION ALL
           SELECT item.tax_rate_bp, -item.line_net_cents, -item.line_tax_cents
           FROM credit_note_item item
           JOIN credit_note note ON note.id=item.credit_note_id
           WHERE note.status != 'draft' AND note.issue_date BETWEEN ?1 AND ?2
         ) tax_activity
         GROUP BY tax_rate_bp ORDER BY tax_rate_bp DESC",
    )
    .bind(&from)
    .bind(&to)
    .fetch_all(db::pool())
    .await?
    .into_iter()
    .map(|row| VatReportRow {
        tax_rate_bp: row.get("tax_rate_bp"),
        net_cents: row.get("net"),
        tax_cents: row.get("tax"),
    })
    .collect();

    let top_customers = sqlx::query(
        "SELECT customer_name, COALESCE(SUM(gross),0) gross,
                COALESCE(SUM(invoice_count),0) invoice_count
         FROM (
           SELECT i.customer_id,
                  COALESCE(NULLIF(TRIM(c.company),''),
                           NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''),
                           c.number) customer_name,
                  i.gross_total_cents gross,
                  CASE WHEN i.status='cancelled' THEN 0 ELSE 1 END invoice_count
           FROM invoice i JOIN customer c ON c.id=i.customer_id
           WHERE i.deleted_at IS NULL AND i.status != 'draft'
             AND i.issue_date BETWEEN ?1 AND ?2
           UNION ALL
           SELECT note.customer_id,
                  COALESCE(NULLIF(TRIM(c.company),''),
                           NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''),
                           c.number),
                  -note.gross_total_cents, 0
           FROM credit_note note JOIN customer c ON c.id=note.customer_id
           WHERE note.status != 'draft' AND note.issue_date BETWEEN ?1 AND ?2
         ) activity
         GROUP BY customer_id, customer_name
         HAVING SUM(gross) != 0
         ORDER BY gross DESC LIMIT 10",
    )
    .bind(&from)
    .bind(&to)
    .fetch_all(db::pool())
    .await?
    .into_iter()
    .map(|row| CustomerReportRow {
        customer_name: row.get("customer_name"),
        gross_cents: row.get("gross"),
        invoice_count: row.get("invoice_count"),
    })
    .collect();

    let statuses = sqlx::query(
        "SELECT CASE
                   WHEN status NOT IN ('paid','cancelled','archived','draft')
                        AND due_date < date('now') THEN 'overdue'
                   ELSE status
                END effective_status,
                COUNT(*) count, COALESCE(SUM(gross_total_cents),0) gross
         FROM invoice
         WHERE deleted_at IS NULL AND issue_date BETWEEN ?1 AND ?2
         GROUP BY effective_status ORDER BY count DESC",
    )
    .bind(&from)
    .bind(&to)
    .fetch_all(db::pool())
    .await?
    .into_iter()
    .map(|row| StatusReportRow {
        status: row.get("effective_status"),
        count: row.get("count"),
        gross_cents: row.get("gross"),
    })
    .collect();

    Ok(ReportData {
        from,
        to,
        revenue_gross_cents: gross,
        revenue_net_cents: totals.get("net"),
        tax_cents: totals.get("tax"),
        paid_cents,
        outstanding_cents,
        invoice_count,
        average_invoice_cents: if invoice_count == 0 { 0 } else { gross / invoice_count },
        monthly,
        vat,
        top_customers,
        statuses,
    })
}
