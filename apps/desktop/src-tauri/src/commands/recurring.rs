//! Wiederkehrende Rechnungen.
//!
//! Nutzt die bereits vorhandene, bisher ungenutzte Tabelle `recurring_invoice`
//! (Vorlagenrechnung, Turnus, naechster Termin). Manuell ausloesbar (kein
//! Hintergrund-Zeitplaner), im selben Muster wie das Ausgangspostfach
//! (`process_outbox_now`) und der Zahlungsabgleich.
//!
//! Ein Lauf erzeugt aus der Vorlagenrechnung immer zuerst einen neuen
//! Rechnungsentwurf mit denselben Positionen. Nur wenn beim Einrichten
//! ausdruecklich "automatisch finalisieren"/"automatisch versenden" gewaehlt
//! wurde, geht der Entwurf auch tatsaechlich automatisch hinaus - der
//! sicherere Standard ist ein Entwurf zur Kontrolle.

use crate::commands::db;
use crate::commands::invoice::{calculate, DocumentInput, LineInput};
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::{Duration, Months, NaiveDate, Utc};
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringInvoiceSummary {
    pub id: String,
    pub template_invoice_number: String,
    pub customer_name: String,
    pub frequency: String,
    pub interval_count: i64,
    pub next_run_date: String,
    pub end_date: Option<String>,
    pub auto_finalize: bool,
    pub auto_send: bool,
    pub active: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringRunResult {
    pub created: i64,
}

#[tauri::command]
pub async fn create_recurring_invoice(
    template_invoice_id: String,
    frequency: String,
    interval_count: i64,
    next_run_date: String,
    end_date: Option<String>,
    auto_finalize: bool,
    auto_send: bool,
) -> Result<String, ErrorPayloadWrapper> {
    if !matches!(frequency.as_str(), "monthly" | "quarterly" | "yearly") {
        return Err(AppError::MissingFields("gültigen Turnus (monatlich/vierteljährlich/jährlich)".into()).into());
    }
    if interval_count < 1 {
        return Err(AppError::MissingFields("Intervall von mindestens 1".into()).into());
    }
    if NaiveDate::parse_from_str(&next_run_date, "%Y-%m-%d").is_err() {
        return Err(AppError::MissingFields("gültiges Datum für den nächsten Lauf".into()).into());
    }

    let template = sqlx::query("SELECT customer_id FROM invoice WHERE id=?1 AND deleted_at IS NULL")
        .bind(&template_invoice_id)
        .fetch_optional(db::pool())
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::MissingFields("vorhandene Vorlagenrechnung".into()))?;
    let customer_id: String = template.get("customer_id");

    let item_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice_item WHERE invoice_id=?1 AND kind='item'")
        .bind(&template_invoice_id)
        .fetch_one(db::pool())
        .await
        .map_err(AppError::from)?;
    if item_count == 0 {
        return Err(AppError::MissingFields("mindestens eine Position auf der Vorlagenrechnung".into()).into());
    }

    let id = uuid::Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO recurring_invoice
           (id, template_invoice_id, customer_id, frequency, interval_count, next_run_date, end_date,
            auto_finalize, auto_send, active, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10)",
    )
    .bind(&id)
    .bind(&template_invoice_id)
    .bind(customer_id)
    .bind(&frequency)
    .bind(interval_count)
    .bind(&next_run_date)
    .bind(end_date)
    .bind(auto_finalize as i64)
    .bind(auto_send as i64)
    .bind(Utc::now().to_rfc3339())
    .execute(db::pool())
    .await
    .map_err(AppError::from)?;

    Ok(id)
}

#[tauri::command]
pub async fn list_recurring_invoices() -> Result<Vec<RecurringInvoiceSummary>, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT r.id, r.frequency, r.interval_count, r.next_run_date, r.end_date,
                r.auto_finalize, r.auto_send, r.active,
                i.number AS template_number,
                COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name
         FROM recurring_invoice r
         JOIN invoice i ON i.id = r.template_invoice_id
         JOIN customer c ON c.id = r.customer_id
         ORDER BY r.created_at DESC",
    )
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| RecurringInvoiceSummary {
            id: row.get("id"),
            template_invoice_number: row.try_get::<Option<String>, _>("template_number").ok().flatten().unwrap_or_default(),
            customer_name: row.get("customer_name"),
            frequency: row.get("frequency"),
            interval_count: row.get("interval_count"),
            next_run_date: row.get("next_run_date"),
            end_date: row.get("end_date"),
            auto_finalize: row.get::<i64, _>("auto_finalize") != 0,
            auto_send: row.get::<i64, _>("auto_send") != 0,
            active: row.get::<i64, _>("active") != 0,
        })
        .collect())
}

#[tauri::command]
pub async fn set_recurring_invoice_active(id: String, active: bool) -> Result<(), ErrorPayloadWrapper> {
    sqlx::query("UPDATE recurring_invoice SET active=?2 WHERE id=?1")
        .bind(id)
        .bind(active as i64)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_recurring_invoice(id: String) -> Result<(), ErrorPayloadWrapper> {
    sqlx::query("DELETE FROM recurring_invoice WHERE id=?1")
        .bind(id)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;
    Ok(())
}

async fn create_invoice_from_template(
    template_invoice_id: &str,
    customer_id: &str,
    auto_finalize: bool,
    auto_send: bool,
) -> Result<String, AppError> {
    let template = sqlx::query(
        "SELECT currency, tax_scheme, template_id, prices_include_tax, intro_text, outro_text, internal_note,
                document_discount_kind, document_discount_value
         FROM invoice WHERE id=?1",
    )
    .bind(template_invoice_id)
    .fetch_optional(db::pool())
    .await?
    .ok_or_else(|| AppError::MissingFields("Vorlagenrechnung".into()))?;

    let items = sqlx::query(
        "SELECT position, kind, product_id, description, description_extra, quantity_milli, unit_id,
                unit_price_cents, tax_rate_bp, discount_kind, discount_value, hidden
         FROM invoice_item WHERE invoice_id=?1 ORDER BY position",
    )
    .bind(template_invoice_id)
    .fetch_all(db::pool())
    .await?;
    if items.is_empty() {
        return Err(AppError::MissingFields("Positionen der Vorlagenrechnung".into()));
    }

    let terms: i64 = crate::commands::workspace_settings::get_setting("default_payment_terms_days")
        .await?
        .and_then(|value| value.parse().ok())
        .unwrap_or(14);
    let issue_date = Utc::now().date_naive();
    let due_date = issue_date + Duration::days(terms);
    let invoice_id = uuid::Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    let prices_include_tax: i64 = template.get("prices_include_tax");
    let tax_scheme: String = template.get("tax_scheme");
    let document_discount_kind: Option<String> = template.get("document_discount_kind");
    let document_discount_value: i64 = template.try_get::<Option<i64>, _>("document_discount_value").ok().flatten().unwrap_or(0);

    let mut tx = db::pool().begin().await?;
    sqlx::query(
        "INSERT INTO invoice
           (id,status,customer_id,issue_date,service_date,due_date,currency,template_id,prices_include_tax,tax_scheme,
            intro_text,outro_text,internal_note,document_discount_kind,document_discount_value,created_at,updated_at)
         VALUES (?1,'draft',?2,?3,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)",
    )
    .bind(&invoice_id)
    .bind(customer_id)
    .bind(issue_date.to_string())
    .bind(due_date.to_string())
    .bind(template.get::<String, _>("currency"))
    .bind(template.get::<Option<String>, _>("template_id"))
    .bind(prices_include_tax)
    .bind(&tax_scheme)
    .bind(template.get::<Option<String>, _>("intro_text"))
    .bind(template.get::<Option<String>, _>("outro_text"))
    .bind(template.get::<Option<String>, _>("internal_note"))
    .bind(&document_discount_kind)
    .bind(document_discount_value)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    let mut lines = Vec::new();
    for item in &items {
        let quantity_milli: i64 = item.get("quantity_milli");
        let unit_price_cents: i64 = item.get("unit_price_cents");
        let tax_rate_bp: i64 = item.get("tax_rate_bp");
        let discount_kind: Option<String> = item.get("discount_kind");
        let discount_value: i64 = item.try_get::<Option<i64>, _>("discount_value").ok().flatten().unwrap_or(0);
        let hidden: i64 = item.get("hidden");
        let kind: String = item.get("kind");

        sqlx::query(
            "INSERT INTO invoice_item
               (id,invoice_id,position,kind,product_id,description,description_extra,quantity_milli,
                unit_id,unit_price_cents,tax_rate_bp,discount_kind,discount_value,hidden,line_net_cents,line_tax_cents)
             VALUES (lower(hex(randomblob(16))),?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,0,0)",
        )
        .bind(&invoice_id)
        .bind(item.get::<i64, _>("position"))
        .bind(&kind)
        .bind(item.get::<Option<String>, _>("product_id"))
        .bind(item.get::<Option<String>, _>("description"))
        .bind(item.get::<Option<String>, _>("description_extra"))
        .bind(quantity_milli)
        .bind(item.get::<Option<String>, _>("unit_id"))
        .bind(unit_price_cents)
        .bind(tax_rate_bp)
        .bind(&discount_kind)
        .bind(discount_value)
        .bind(hidden)
        .execute(&mut *tx)
        .await?;

        lines.push(LineInput {
            id: uuid::Uuid::now_v7().to_string(),
            kind,
            quantity_milli,
            unit_price_cents,
            tax_rate_bp,
            discount_kind,
            discount_value,
            hidden: hidden != 0,
        });
    }
    tx.commit().await?;

    if auto_finalize {
        crate::commands::license::ensure_allowed("invoices.finalize").await?;
        let input = DocumentInput {
            prices_include_tax: prices_include_tax != 0,
            tax_scheme,
            lines,
            document_discount_kind,
            document_discount_value,
            paid_cents: 0,
        };
        let expected = calculate(&input).gross_total_cents;
        let device_id = crate::commands::license::device_id().await?;
        crate::repo::invoices::finalize(
            db::pool(),
            crate::repo::invoices::FinalizeContext {
                invoice_id: &invoice_id,
                input: &input,
                expected_gross_cents: expected,
                user_id: "local",
                device_id: &device_id,
            },
        )
        .await?;

        if auto_send {
            let customer_email: Option<String> = sqlx::query_scalar("SELECT email FROM customer WHERE id=?1")
                .bind(customer_id)
                .fetch_optional(db::pool())
                .await?
                .flatten();
            if let Some(email) = customer_email.filter(|value| !value.trim().is_empty()) {
                if crate::commands::pdf_export::generate_document_pdf("invoice".into(), invoice_id.clone()).await.is_ok() {
                    let number: String = sqlx::query_scalar("SELECT number FROM invoice WHERE id=?1")
                        .bind(&invoice_id)
                        .fetch_one(db::pool())
                        .await
                        .unwrap_or_default();
                    let subject = format!("Rechnung {number}");
                    let body = "Guten Tag,\n\nanbei erhalten Sie Ihre Rechnung.\n\nMit freundlichen Grüßen".to_string();
                    let _ = crate::commands::outbox::queue_invoice_email(invoice_id.clone(), email, subject, body).await;
                }
            }
        }
    }

    Ok(invoice_id)
}

#[tauri::command]
pub async fn run_recurring_invoices() -> Result<RecurringRunResult, ErrorPayloadWrapper> {
    let rules = sqlx::query(
        "SELECT id, template_invoice_id, customer_id, frequency, interval_count, next_run_date, end_date,
                auto_finalize, auto_send
         FROM recurring_invoice
         WHERE active=1 AND date(next_run_date) <= date('now')",
    )
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?;

    let mut created = 0i64;
    for rule in rules {
        let rule_id: String = rule.get("id");
        let template_invoice_id: String = rule.get("template_invoice_id");
        let customer_id: String = rule.get("customer_id");
        let frequency: String = rule.get("frequency");
        let interval_count: i64 = rule.get("interval_count");
        let next_run_date: String = rule.get("next_run_date");
        let end_date: Option<String> = rule.get("end_date");
        let auto_finalize: bool = rule.get::<i64, _>("auto_finalize") != 0;
        let auto_send: bool = rule.get::<i64, _>("auto_send") != 0;

        match create_invoice_from_template(&template_invoice_id, &customer_id, auto_finalize, auto_send).await {
            Ok(_) => created += 1,
            Err(error) => tracing::warn!(?error, rule = %rule_id, "Wiederkehrende Rechnung konnte nicht erzeugt werden"),
        }

        // Naechsten Termin unabhaengig vom Ergebnis fortschreiben - sonst
        // wuerde ein einzelner Fehlschlag bei jedem weiteren Lauf erneut
        // versucht, ohne dass sich an der Ursache etwas aendert.
        let Ok(current) = NaiveDate::parse_from_str(&next_run_date, "%Y-%m-%d") else { continue };
        let months = match frequency.as_str() {
            "monthly" => interval_count,
            "quarterly" => interval_count * 3,
            "yearly" => interval_count * 12,
            _ => interval_count,
        };
        let Some(next) = current.checked_add_months(Months::new(months.max(0) as u32)) else { continue };
        let still_active = end_date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
            .map(|end| next <= end)
            .unwrap_or(true);

        sqlx::query("UPDATE recurring_invoice SET next_run_date=?2, active=?3 WHERE id=?1")
            .bind(&rule_id)
            .bind(next.to_string())
            .bind(still_active as i64)
            .execute(db::pool())
            .await
            .map_err(AppError::from)?;
    }

    Ok(RecurringRunResult { created })
}
