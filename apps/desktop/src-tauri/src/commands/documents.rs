//! Produktive Belegverwaltung für Rechnungen, Angebote und Gutschriften.

use crate::commands::db;
use crate::commands::invoice::{calculate, DocumentInput, LineInput};
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::{Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLine {
    pub id: String,
    pub kind: String,
    pub product_id: Option<String>,
    pub description: String,
    pub description_extra: Option<String>,
    pub quantity_milli: i64,
    pub unit_id: Option<String>,
    pub unit_price_cents: i64,
    pub tax_rate_bp: i64,
    pub discount_kind: Option<String>,
    pub discount_value: i64,
    pub hidden: bool,
    #[serde(default)]
    pub line_net_cents: i64,
    #[serde(default)]
    pub line_tax_cents: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceDraftInput {
    pub id: Option<String>,
    pub customer_id: String,
    pub issue_date: String,
    pub service_date: Option<String>,
    pub due_date: String,
    pub currency: String,
    pub template_id: Option<String>,
    pub prices_include_tax: bool,
    pub tax_scheme: String,
    pub reference: Option<String>,
    pub order_number: Option<String>,
    pub project: Option<String>,
    pub contact_person: Option<String>,
    pub intro_text: Option<String>,
    pub outro_text: Option<String>,
    pub internal_note: Option<String>,
    pub public_note: Option<String>,
    pub document_discount_kind: Option<String>,
    pub document_discount_value: i64,
    pub lines: Vec<DocumentLine>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceSummary {
    pub id: String,
    pub number: Option<String>,
    pub status: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub issue_date: String,
    pub due_date: String,
    pub gross_total_cents: i64,
    pub paid_cents: i64,
    pub open_cents: i64,
    pub pdf_path: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceDetail {
    pub id: String,
    pub number: Option<String>,
    pub status: String,
    pub customer_id: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub issue_date: String,
    pub service_date: Option<String>,
    pub due_date: String,
    pub currency: String,
    pub template_id: Option<String>,
    pub prices_include_tax: bool,
    pub tax_scheme: String,
    pub reference: Option<String>,
    pub order_number: Option<String>,
    pub project: Option<String>,
    pub contact_person: Option<String>,
    pub intro_text: Option<String>,
    pub outro_text: Option<String>,
    pub internal_note: Option<String>,
    pub public_note: Option<String>,
    pub document_discount_kind: Option<String>,
    pub document_discount_value: i64,
    pub lines: Vec<DocumentLine>,
    pub paid_cents: i64,
    pub net_total_cents: i64,
    pub tax_total_cents: i64,
    pub gross_total_cents: i64,
    pub pdf_path: Option<String>,
    pub finalized_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteDraftInput {
    pub id: Option<String>,
    pub customer_id: String,
    pub issue_date: String,
    pub valid_until: String,
    pub currency: String,
    pub template_id: Option<String>,
    pub prices_include_tax: bool,
    pub tax_scheme: String,
    pub intro_text: Option<String>,
    pub outro_text: Option<String>,
    pub internal_note: Option<String>,
    pub document_discount_kind: Option<String>,
    pub document_discount_value: i64,
    pub lines: Vec<DocumentLine>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub id: String,
    pub number: Option<String>,
    pub status: String,
    pub customer_name: String,
    pub issue_date: String,
    pub valid_until: String,
    pub gross_total_cents: i64,
    pub converted_invoice_id: Option<String>,
    pub pdf_path: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteDetail {
    pub id: String,
    pub number: Option<String>,
    pub status: String,
    pub customer_id: String,
    pub customer_name: String,
    pub issue_date: String,
    pub valid_until: String,
    pub currency: String,
    pub template_id: Option<String>,
    pub prices_include_tax: bool,
    pub tax_scheme: String,
    pub intro_text: Option<String>,
    pub outro_text: Option<String>,
    pub internal_note: Option<String>,
    pub document_discount_kind: Option<String>,
    pub document_discount_value: i64,
    pub lines: Vec<DocumentLine>,
    pub net_total_cents: i64,
    pub tax_total_cents: i64,
    pub gross_total_cents: i64,
    pub converted_invoice_id: Option<String>,
    pub pdf_path: Option<String>,
    pub finalized_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditNoteSummary {
    pub id: String,
    pub number: Option<String>,
    pub kind: String,
    pub status: String,
    pub origin_invoice_id: String,
    pub origin_invoice_number: Option<String>,
    pub customer_name: String,
    pub issue_date: String,
    pub reason: Option<String>,
    pub gross_total_cents: i64,
    pub pdf_path: Option<String>,
    pub template_id: Option<String>,
}

fn customer_name(row: &sqlx::sqlite::SqliteRow) -> String {
    row.try_get::<String, _>("customer_name")
        .unwrap_or_else(|_| "Unbekannter Kunde".into())
}

fn effective_status(row: &sqlx::sqlite::SqliteRow) -> String {
    row.get("effective_status")
}

fn option_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    })
}

fn as_document_input(
    prices_include_tax: bool,
    tax_scheme: &str,
    lines: &[DocumentLine],
    discount_kind: Option<&str>,
    discount_value: i64,
    paid_cents: i64,
) -> DocumentInput {
    DocumentInput {
        prices_include_tax,
        tax_scheme: tax_scheme.to_string(),
        lines: lines
            .iter()
            .map(|line| LineInput {
                id: line.id.clone(),
                kind: line.kind.clone(),
                quantity_milli: line.quantity_milli,
                unit_price_cents: line.unit_price_cents,
                tax_rate_bp: line.tax_rate_bp,
                discount_kind: line.discount_kind.clone(),
                discount_value: line.discount_value,
                hidden: line.hidden,
            })
            .collect(),
        document_discount_kind: discount_kind.map(str::to_string),
        document_discount_value: discount_value,
        paid_cents,
    }
}

fn parse_date(value: &str, field: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::MissingFields(format!("gültiges {field}")))
}

fn validate_document_options(
    tax_scheme: &str,
    currency: &str,
    discount_kind: Option<&str>,
    discount_value: i64,
) -> Result<(), AppError> {
    if !matches!(
        tax_scheme,
        "standard" | "small_business" | "reverse_charge" | "intra_community" | "tax_exempt"
    ) {
        return Err(AppError::MissingFields("gültige Steuerregel".into()));
    }
    let currency = currency.trim();
    if currency.len() != 3 || !currency.chars().all(|character| character.is_ascii_alphabetic()) {
        return Err(AppError::MissingFields("gültiger dreistelliger Währungscode".into()));
    }
    match discount_kind {
        Some("percent") if !(0..=10_000).contains(&discount_value) => {
            return Err(AppError::MissingFields(
                "Dokumentrabatt zwischen 0 und 100 Prozent".into(),
            ));
        }
        Some("fixed") if discount_value < 0 => {
            return Err(AppError::MissingFields("nichtnegativer Dokumentrabatt".into()));
        }
        Some(kind) if kind != "percent" && kind != "fixed" => {
            return Err(AppError::MissingFields("gültige Dokumentrabattart".into()));
        }
        None if discount_value != 0 => {
            return Err(AppError::MissingFields(
                "Rabattart für den Dokumentrabatt".into(),
            ));
        }
        _ => {}
    }
    Ok(())
}

fn validate_lines(lines: &[DocumentLine]) -> Result<(), AppError> {
    let mut ids = HashSet::new();
    let mut visible_item_count = 0usize;

    for line in lines {
        if line.id.trim().is_empty() || !ids.insert(line.id.trim()) {
            return Err(AppError::MissingFields("eindeutige Positions-ID".into()));
        }
        if !matches!(
            line.kind.as_str(),
            "item" | "heading" | "text" | "subtotal" | "page_break"
        ) {
            return Err(AppError::MissingFields("gültiger Positionstyp".into()));
        }
        if matches!(line.kind.as_str(), "item" | "heading" | "text")
            && !line.hidden
            && line.description.trim().is_empty()
        {
            return Err(AppError::MissingFields("Positionsbeschreibung".into()));
        }
        if line.kind != "item" {
            continue;
        }
        if !line.hidden {
            visible_item_count += 1;
        }
        if line.quantity_milli <= 0 {
            return Err(AppError::MissingFields("Menge größer als null".into()));
        }
        if line.unit_price_cents < 0 {
            return Err(AppError::MissingFields("nichtnegativer Einzelpreis".into()));
        }
        if !(0..=10_000).contains(&line.tax_rate_bp) {
            return Err(AppError::MissingFields("gültiger Steuersatz".into()));
        }
        match line.discount_kind.as_deref() {
            Some("percent") if !(0..=10_000).contains(&line.discount_value) => {
                return Err(AppError::MissingFields(
                    "Positionsrabatt zwischen 0 und 100 Prozent".into(),
                ));
            }
            Some("fixed") if line.discount_value < 0 => {
                return Err(AppError::MissingFields("nichtnegativer Positionsrabatt".into()));
            }
            Some(kind) if kind != "percent" && kind != "fixed" => {
                return Err(AppError::MissingFields("gültige Rabattart".into()));
            }
            None if line.discount_value != 0 => {
                return Err(AppError::MissingFields("Rabattart für Positionsrabatt".into()));
            }
            _ => {}
        }
    }

    if visible_item_count == 0 {
        return Err(AppError::MissingFields("mindestens eine sichtbare Position".into()));
    }
    Ok(())
}

async fn ensure_customer(customer_id: &str) -> Result<(), AppError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer WHERE id=?1 AND deleted_at IS NULL AND archived_at IS NULL",
    )
    .bind(customer_id)
    .fetch_one(db::pool())
    .await?;
    if count == 0 {
        return Err(AppError::MissingFields("gültiger Kunde".into()));
    }
    Ok(())
}

async fn replace_invoice_lines(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    invoice_id: &str,
    lines: &[DocumentLine],
    prices_include_tax: bool,
    tax_scheme: &str,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM invoice_item WHERE invoice_id=?1")
        .bind(invoice_id)
        .execute(&mut **tx)
        .await?;

    for (position, line) in lines.iter().enumerate() {
        let single = calculate(&as_document_input(
            prices_include_tax,
            tax_scheme,
            std::slice::from_ref(line),
            None,
            0,
            0,
        ));
        sqlx::query(
            "INSERT INTO invoice_item
               (id, invoice_id, position, kind, product_id, description, description_extra,
                quantity_milli, unit_id, unit_price_cents, tax_rate_bp, discount_kind,
                discount_value, hidden, line_net_cents, line_tax_cents)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
        )
        .bind(&line.id)
        .bind(invoice_id)
        .bind(position as i64 + 1)
        .bind(&line.kind)
        .bind(&line.product_id)
        .bind(line.description.trim())
        .bind(option_text(line.description_extra.clone()))
        .bind(line.quantity_milli)
        .bind(&line.unit_id)
        .bind(line.unit_price_cents)
        .bind(line.tax_rate_bp)
        .bind(&line.discount_kind)
        .bind(line.discount_value)
        .bind(if line.hidden { 1_i64 } else { 0_i64 })
        .bind(single.net_total_cents)
        .bind(single.tax_total_cents)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn replace_quote_lines(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    quote_id: &str,
    lines: &[DocumentLine],
    prices_include_tax: bool,
    tax_scheme: &str,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM quote_item WHERE quote_id=?1")
        .bind(quote_id)
        .execute(&mut **tx)
        .await?;
    for (position, line) in lines.iter().enumerate() {
        let single = calculate(&as_document_input(
            prices_include_tax,
            tax_scheme,
            std::slice::from_ref(line),
            None,
            0,
            0,
        ));
        sqlx::query(
            "INSERT INTO quote_item
               (id, quote_id, position, kind, product_id, description, description_extra,
                quantity_milli, unit_id, unit_price_cents, tax_rate_bp, discount_kind,
                discount_value, hidden, line_net_cents, line_tax_cents)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
        )
        .bind(&line.id)
        .bind(quote_id)
        .bind(position as i64 + 1)
        .bind(&line.kind)
        .bind(&line.product_id)
        .bind(line.description.trim())
        .bind(option_text(line.description_extra.clone()))
        .bind(line.quantity_milli)
        .bind(&line.unit_id)
        .bind(line.unit_price_cents)
        .bind(line.tax_rate_bp)
        .bind(&line.discount_kind)
        .bind(line.discount_value)
        .bind(if line.hidden { 1_i64 } else { 0_i64 })
        .bind(single.net_total_cents)
        .bind(single.tax_total_cents)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

fn map_invoice_summary(row: sqlx::sqlite::SqliteRow) -> InvoiceSummary {
    let gross: i64 = row.get("gross_total_cents");
    let paid: i64 = row.get("paid_cents");
    InvoiceSummary {
        id: row.get("id"),
        number: row.get("number"),
        status: effective_status(&row),
        customer_name: customer_name(&row),
        customer_email: row.get("customer_email"),
        issue_date: row.get("issue_date"),
        due_date: row.get("due_date"),
        gross_total_cents: gross,
        paid_cents: paid,
        open_cents: (gross - paid).max(0),
        pdf_path: row.get("pdf_path"),
        updated_at: row.get("updated_at"),
    }
}

#[tauri::command]
pub async fn list_invoices(
    query: Option<String>,
    status: Option<String>,
) -> Result<Vec<InvoiceSummary>, ErrorPayloadWrapper> {
    let search = query.map(|value| format!("%{}%", value.trim())).unwrap_or_else(|| "%".into());
    let rows = sqlx::query(
        "SELECT i.id, i.number,
                CASE WHEN date(i.due_date) < date('now')
                       AND i.status IN ('finalized','sent','delivered','partially_paid')
                       AND i.paid_cents < i.gross_total_cents
                     THEN 'overdue' ELSE i.status END AS effective_status,
                COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name,
                c.email AS customer_email, i.issue_date, i.due_date, i.gross_total_cents,
                i.paid_cents, i.pdf_path, i.updated_at
         FROM invoice i JOIN customer c ON c.id=i.customer_id
         WHERE i.deleted_at IS NULL
           AND (COALESCE(i.number,'') LIKE ?1 OR COALESCE(c.company,'') LIKE ?1
                OR COALESCE(c.first_name,'') LIKE ?1 OR COALESCE(c.last_name,'') LIKE ?1)
         ORDER BY i.issue_date DESC, i.created_at DESC",
    )
    .bind(search)
    .fetch_all(db::pool())
    .await?;
    let mut mapped: Vec<_> = rows.into_iter().map(map_invoice_summary).collect();
    if let Some(filter) = status.filter(|value| !value.is_empty()) {
        mapped.retain(|row| row.status == filter);
    }
    Ok(mapped)
}

#[tauri::command]
pub async fn get_invoice_draft(id: String) -> Result<Option<InvoiceDetail>, ErrorPayloadWrapper> {
    let Some(row) = sqlx::query(
        "SELECT i.*,
                CASE WHEN date(i.due_date) < date('now')
                       AND i.status IN ('finalized','sent','delivered','partially_paid')
                       AND i.paid_cents < i.gross_total_cents
                     THEN 'overdue' ELSE i.status END AS effective_status,
                COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name,
                c.email AS customer_email
         FROM invoice i JOIN customer c ON c.id=i.customer_id
         WHERE i.id=?1 AND i.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(db::pool())
    .await?
    else {
        return Ok(None);
    };
    let lines = load_invoice_lines(&id).await?;
    Ok(Some(InvoiceDetail {
        id: row.get("id"),
        number: row.get("number"),
        status: effective_status(&row),
        customer_id: row.get("customer_id"),
        customer_name: customer_name(&row),
        customer_email: row.get("customer_email"),
        issue_date: row.get("issue_date"),
        service_date: row.get("service_date"),
        due_date: row.get("due_date"),
        currency: row.get("currency"),
        template_id: row.get("template_id"),
        prices_include_tax: row.get::<i64, _>("prices_include_tax") != 0,
        tax_scheme: row.get("tax_scheme"),
        reference: row.get("reference"),
        order_number: row.get("order_number"),
        project: row.get("project"),
        contact_person: row.get("contact_person"),
        intro_text: row.get("intro_text"),
        outro_text: row.get("outro_text"),
        internal_note: row.get("internal_note"),
        public_note: row.get("public_note"),
        document_discount_kind: row.get("document_discount_kind"),
        document_discount_value: row.try_get::<Option<i64>, _>("document_discount_value").ok().flatten().unwrap_or(0),
        lines,
        paid_cents: row.get("paid_cents"),
        net_total_cents: row.get("net_total_cents"),
        tax_total_cents: row.get("tax_total_cents"),
        gross_total_cents: row.get("gross_total_cents"),
        pdf_path: row.get("pdf_path"),
        finalized_at: row.get("finalized_at"),
    }))
}

async fn load_invoice_lines(invoice_id: &str) -> Result<Vec<DocumentLine>, AppError> {
    let rows = sqlx::query(
        "SELECT id, kind, product_id, description, description_extra, quantity_milli,
                unit_id, unit_price_cents, tax_rate_bp, discount_kind, discount_value,
                hidden, line_net_cents, line_tax_cents
         FROM invoice_item WHERE invoice_id=?1 ORDER BY position",
    )
    .bind(invoice_id)
    .fetch_all(db::pool())
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| DocumentLine {
            id: row.get("id"),
            kind: row.get("kind"),
            product_id: row.get("product_id"),
            description: row.try_get::<Option<String>, _>("description").ok().flatten().unwrap_or_default(),
            description_extra: row.get("description_extra"),
            quantity_milli: row.get("quantity_milli"),
            unit_id: row.get("unit_id"),
            unit_price_cents: row.get("unit_price_cents"),
            tax_rate_bp: row.get("tax_rate_bp"),
            discount_kind: row.get("discount_kind"),
            discount_value: row.try_get::<Option<i64>, _>("discount_value").ok().flatten().unwrap_or(0),
            hidden: row.get::<i64, _>("hidden") != 0,
            line_net_cents: row.get("line_net_cents"),
            line_tax_cents: row.get("line_tax_cents"),
        })
        .collect())
}

#[tauri::command]
pub async fn save_invoice_draft(input: InvoiceDraftInput) -> Result<String, ErrorPayloadWrapper> {
    ensure_customer(&input.customer_id).await?;
    let issue_date = parse_date(&input.issue_date, "Rechnungsdatum")?;
    let due_date = parse_date(&input.due_date, "Fälligkeitsdatum")?;
    if due_date < issue_date {
        return Err(AppError::MissingFields("Fälligkeitsdatum ab Rechnungsdatum".into()).into());
    }
    let service_date = input.service_date.as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::MissingFields("Leistungsdatum".into()))?;
    parse_date(service_date, "Leistungsdatum")?;
    let currency = if input.currency.trim().is_empty() {
        "EUR".to_string()
    } else {
        input.currency.trim().to_ascii_uppercase()
    };
    validate_document_options(
        &input.tax_scheme,
        &currency,
        input.document_discount_kind.as_deref(),
        input.document_discount_value,
    )?;
    validate_lines(&input.lines)?;
    let id = input.id.clone().unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    if let Some(existing_status) = sqlx::query_scalar::<_, String>("SELECT status FROM invoice WHERE id=?1")
        .bind(&id)
        .fetch_optional(db::pool())
        .await?
    {
        if existing_status != "draft" {
            return Err(AppError::AlreadyFinalized.into());
        }
    }
    let document = as_document_input(
        input.prices_include_tax,
        &input.tax_scheme,
        &input.lines,
        input.document_discount_kind.as_deref(),
        input.document_discount_value,
        0,
    );
    let totals = calculate(&document);
    let now = Utc::now().to_rfc3339();
    let mut tx = db::pool().begin().await?;
    sqlx::query(
        "INSERT INTO invoice
           (id, status, customer_id, issue_date, service_date, due_date, currency, template_id,
            prices_include_tax, tax_scheme, reference, order_number, project, contact_person,
            intro_text, outro_text, internal_note, public_note, document_discount_kind,
            document_discount_value, net_total_cents, tax_total_cents, gross_total_cents,
            discount_total_cents, created_at, updated_at)
         VALUES (?1,'draft',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?24)
         ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,
           issue_date=excluded.issue_date, service_date=excluded.service_date,
           due_date=excluded.due_date, currency=excluded.currency, template_id=excluded.template_id,
           prices_include_tax=excluded.prices_include_tax, tax_scheme=excluded.tax_scheme,
           reference=excluded.reference, order_number=excluded.order_number, project=excluded.project,
           contact_person=excluded.contact_person, intro_text=excluded.intro_text,
           outro_text=excluded.outro_text, internal_note=excluded.internal_note,
           public_note=excluded.public_note, document_discount_kind=excluded.document_discount_kind,
           document_discount_value=excluded.document_discount_value,
           net_total_cents=excluded.net_total_cents, tax_total_cents=excluded.tax_total_cents,
           gross_total_cents=excluded.gross_total_cents,
           discount_total_cents=excluded.discount_total_cents, updated_at=excluded.updated_at",
    )
    .bind(&id)
    .bind(&input.customer_id)
    .bind(&input.issue_date)
    .bind(option_text(input.service_date))
    .bind(&input.due_date)
    .bind(&currency)
    .bind(option_text(input.template_id))
    .bind(if input.prices_include_tax { 1_i64 } else { 0_i64 })
    .bind(&input.tax_scheme)
    .bind(option_text(input.reference))
    .bind(option_text(input.order_number))
    .bind(option_text(input.project))
    .bind(option_text(input.contact_person))
    .bind(option_text(input.intro_text))
    .bind(option_text(input.outro_text))
    .bind(option_text(input.internal_note))
    .bind(option_text(input.public_note))
    .bind(&input.document_discount_kind)
    .bind(input.document_discount_value)
    .bind(totals.net_total_cents)
    .bind(totals.tax_total_cents)
    .bind(totals.gross_total_cents)
    .bind(totals.document_discount_cents)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    replace_invoice_lines(&mut tx, &id, &input.lines, input.prices_include_tax, &input.tax_scheme).await?;
    tx.commit().await?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_invoice_draft(id: String) -> Result<(), ErrorPayloadWrapper> {
    let result = sqlx::query("DELETE FROM invoice WHERE id=?1 AND status='draft'")
        .bind(&id)
        .execute(db::pool())
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::AlreadyFinalized.into());
    }
    Ok(())
}

#[tauri::command]
pub async fn register_invoice_payment(
    invoice_id: String,
    paid_on: String,
    amount_cents: i64,
    method: String,
    reference: Option<String>,
    note: Option<String>,
) -> Result<(), ErrorPayloadWrapper> {
    if amount_cents <= 0 {
        return Err(AppError::MissingFields("Zahlungsbetrag größer als null".into()).into());
    }
    parse_date(&paid_on, "Zahlungsdatum")?;
    if !matches!(method.as_str(), "transfer" | "cash" | "paypal" | "card" | "direct_debit" | "other") {
        return Err(AppError::MissingFields("gültige Zahlungsart".into()).into());
    }
    let mut tx = db::pool().begin().await?;
    let row = sqlx::query("SELECT status, gross_total_cents, paid_cents FROM invoice WHERE id=?1")
        .bind(&invoice_id)
        .fetch_one(&mut *tx)
        .await?;
    let status: String = row.get("status");
    if matches!(status.as_str(), "draft" | "cancelled" | "archived") {
        return Err(AppError::MissingFields("zahlbare finalisierte Rechnung".into()).into());
    }
    let gross: i64 = row.get("gross_total_cents");
    let already_paid: i64 = row.get("paid_cents");
    let outstanding = gross.saturating_sub(already_paid);
    if outstanding <= 0 {
        return Err(AppError::MissingFields("offener Rechnungsbetrag".into()).into());
    }
    if amount_cents > outstanding {
        return Err(AppError::MissingFields(format!(
            "Zahlungsbetrag höchstens {} Cent (offener Betrag)", outstanding
        )).into());
    }
    sqlx::query(
        "INSERT INTO invoice_payment (id, invoice_id, paid_on, amount_cents, method, reference, note, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(&invoice_id)
    .bind(&paid_on)
    .bind(amount_cents)
    .bind(&method)
    .bind(option_text(reference))
    .bind(option_text(note))
    .bind(Utc::now().to_rfc3339())
    .execute(&mut *tx)
    .await?;
    let paid: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount_cents),0) FROM invoice_payment WHERE invoice_id=?1")
        .bind(&invoice_id)
        .fetch_one(&mut *tx)
        .await?;
    let new_status = if paid >= gross { "paid" } else { "partially_paid" };
    sqlx::query("UPDATE invoice SET paid_cents=?2, status=?3, updated_at=?4 WHERE id=?1")
        .bind(&invoice_id)
        .bind(paid)
        .bind(new_status)
        .bind(Utc::now().to_rfc3339())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    if new_status == "paid" {
        if let Err(error) = crate::commands::outbox::queue_payment_confirmation(&invoice_id).await {
            tracing::warn!(?error, "Zahlungsbestaetigung konnte nicht eingereiht werden");
        }
    }

    Ok(())
}

fn map_quote_summary(row: sqlx::sqlite::SqliteRow) -> QuoteSummary {
    QuoteSummary {
        id: row.get("id"), number: row.get("number"), status: row.get("status"),
        customer_name: customer_name(&row), issue_date: row.get("issue_date"),
        valid_until: row.get("valid_until"), gross_total_cents: row.get("gross_total_cents"),
        converted_invoice_id: row.get("converted_invoice_id"), pdf_path: row.get("pdf_path"),
        updated_at: row.get("updated_at"),
    }
}

#[tauri::command]
pub async fn list_quotes(query: Option<String>, status: Option<String>) -> Result<Vec<QuoteSummary>, ErrorPayloadWrapper> {
    let search = query.map(|value| format!("%{}%", value.trim())).unwrap_or_else(|| "%".into());
    let rows = sqlx::query(
        "SELECT q.id, q.number, q.status,
                COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name,
                q.issue_date, q.valid_until, q.gross_total_cents, q.converted_invoice_id,
                q.pdf_path, q.updated_at
         FROM quote q JOIN customer c ON c.id=q.customer_id
         WHERE q.deleted_at IS NULL
           AND (COALESCE(q.number,'') LIKE ?1 OR COALESCE(c.company,'') LIKE ?1
                OR COALESCE(c.first_name,'') LIKE ?1 OR COALESCE(c.last_name,'') LIKE ?1)
         ORDER BY q.issue_date DESC, q.created_at DESC",
    )
    .bind(search)
    .fetch_all(db::pool())
    .await?;
    let mut result: Vec<_> = rows.into_iter().map(map_quote_summary).collect();
    if let Some(filter) = status.filter(|value| !value.is_empty()) {
        result.retain(|row| row.status == filter);
    }
    Ok(result)
}

async fn load_quote_lines(quote_id: &str) -> Result<Vec<DocumentLine>, AppError> {
    let rows = sqlx::query(
        "SELECT id, kind, product_id, description, description_extra, quantity_milli,
                unit_id, unit_price_cents, tax_rate_bp, discount_kind, discount_value,
                hidden, line_net_cents, line_tax_cents
         FROM quote_item WHERE quote_id=?1 ORDER BY position",
    )
    .bind(quote_id)
    .fetch_all(db::pool())
    .await?;
    Ok(rows.into_iter().map(|row| DocumentLine {
        id: row.get("id"), kind: row.get("kind"), product_id: row.get("product_id"),
        description: row.try_get::<Option<String>, _>("description").ok().flatten().unwrap_or_default(),
        description_extra: row.get("description_extra"), quantity_milli: row.get("quantity_milli"),
        unit_id: row.get("unit_id"), unit_price_cents: row.get("unit_price_cents"),
        tax_rate_bp: row.get("tax_rate_bp"), discount_kind: row.get("discount_kind"),
        discount_value: row.try_get::<Option<i64>, _>("discount_value").ok().flatten().unwrap_or(0),
        hidden: row.get::<i64, _>("hidden") != 0, line_net_cents: row.get("line_net_cents"),
        line_tax_cents: row.get("line_tax_cents"),
    }).collect())
}

#[tauri::command]
pub async fn get_quote_draft(id: String) -> Result<Option<QuoteDetail>, ErrorPayloadWrapper> {
    let Some(row) = sqlx::query(
        "SELECT q.*, COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name
         FROM quote q JOIN customer c ON c.id=q.customer_id WHERE q.id=?1 AND q.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(db::pool())
    .await?
    else { return Ok(None) };
    Ok(Some(QuoteDetail {
        id: row.get("id"), number: row.get("number"), status: row.get("status"),
        customer_id: row.get("customer_id"), customer_name: customer_name(&row),
        issue_date: row.get("issue_date"), valid_until: row.get("valid_until"),
        currency: row.get("currency"), template_id: row.get("template_id"),
        prices_include_tax: row.get::<i64, _>("prices_include_tax") != 0,
        tax_scheme: row.get("tax_scheme"), intro_text: row.get("intro_text"),
        outro_text: row.get("outro_text"), internal_note: row.get("internal_note"),
        document_discount_kind: row.get("document_discount_kind"),
        document_discount_value: row.try_get::<Option<i64>, _>("document_discount_value").ok().flatten().unwrap_or(0),
        lines: load_quote_lines(&id).await?, net_total_cents: row.get("net_total_cents"),
        tax_total_cents: row.get("tax_total_cents"), gross_total_cents: row.get("gross_total_cents"),
        converted_invoice_id: row.get("converted_invoice_id"), pdf_path: row.get("pdf_path"),
        finalized_at: row.get("finalized_at"),
    }))
}

#[tauri::command]
pub async fn save_quote_draft(input: QuoteDraftInput) -> Result<String, ErrorPayloadWrapper> {
    ensure_customer(&input.customer_id).await?;
    let issue_date = parse_date(&input.issue_date, "Angebotsdatum")?;
    let valid_until = parse_date(&input.valid_until, "Gültigkeitsdatum")?;
    if valid_until < issue_date {
        return Err(AppError::MissingFields("Gültigkeitsdatum ab Angebotsdatum".into()).into());
    }
    let currency = if input.currency.trim().is_empty() {
        "EUR".to_string()
    } else {
        input.currency.trim().to_ascii_uppercase()
    };
    validate_document_options(
        &input.tax_scheme,
        &currency,
        input.document_discount_kind.as_deref(),
        input.document_discount_value,
    )?;
    validate_lines(&input.lines)?;
    let id = input.id.clone().unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    if let Some(existing_status) = sqlx::query_scalar::<_, String>("SELECT status FROM quote WHERE id=?1")
        .bind(&id).fetch_optional(db::pool()).await?
    {
        if existing_status != "draft" { return Err(AppError::AlreadyFinalized.into()); }
    }
    let totals = calculate(&as_document_input(
        input.prices_include_tax, &input.tax_scheme, &input.lines,
        input.document_discount_kind.as_deref(), input.document_discount_value, 0,
    ));
    let now = Utc::now().to_rfc3339();
    let mut tx = db::pool().begin().await?;
    sqlx::query(
        "INSERT INTO quote
           (id,status,customer_id,issue_date,valid_until,currency,template_id,prices_include_tax,tax_scheme,
            intro_text,outro_text,internal_note,document_discount_kind,document_discount_value,
            net_total_cents,tax_total_cents,gross_total_cents,created_at,updated_at)
         VALUES (?1,'draft',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)
         ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,
           issue_date=excluded.issue_date, valid_until=excluded.valid_until,
           currency=excluded.currency, template_id=excluded.template_id,
           prices_include_tax=excluded.prices_include_tax, tax_scheme=excluded.tax_scheme, intro_text=excluded.intro_text,
           outro_text=excluded.outro_text, internal_note=excluded.internal_note,
           document_discount_kind=excluded.document_discount_kind,
           document_discount_value=excluded.document_discount_value,
           net_total_cents=excluded.net_total_cents, tax_total_cents=excluded.tax_total_cents,
           gross_total_cents=excluded.gross_total_cents, updated_at=excluded.updated_at",
    )
    .bind(&id).bind(&input.customer_id).bind(&input.issue_date).bind(&input.valid_until)
    .bind(&currency).bind(&input.template_id)
    .bind(if input.prices_include_tax { 1_i64 } else { 0_i64 }).bind(&input.tax_scheme)
    .bind(option_text(input.intro_text)).bind(option_text(input.outro_text))
    .bind(option_text(input.internal_note)).bind(&input.document_discount_kind)
    .bind(input.document_discount_value).bind(totals.net_total_cents)
    .bind(totals.tax_total_cents).bind(totals.gross_total_cents).bind(&now)
    .execute(&mut *tx).await?;
    replace_quote_lines(&mut tx, &id, &input.lines, input.prices_include_tax, &input.tax_scheme).await?;
    tx.commit().await?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_quote_draft(id: String) -> Result<(), ErrorPayloadWrapper> {
    let result = sqlx::query("DELETE FROM quote WHERE id=?1 AND status='draft'")
        .bind(&id).execute(db::pool()).await?;
    if result.rows_affected() == 0 { return Err(AppError::AlreadyFinalized.into()); }
    Ok(())
}

async fn snapshot_company(executor: &mut sqlx::SqliteConnection) -> Result<String, AppError> {
    let row = sqlx::query(
        "SELECT p.legal_name, p.email, p.phone, p.website, p.vat_id, p.tax_number,
                a.street, a.house_no, a.addition, a.postal_code, a.city, a.country,
                b.iban, b.bic
         FROM company_profile p LEFT JOIN company_address a ON a.company_id=p.id AND a.kind='main'
         LEFT JOIN bank_account b ON b.company_id=p.id AND b.is_default=1 LIMIT 1",
    )
    .fetch_one(&mut *executor).await?;
    Ok(serde_json::json!({
        "legalName": row.get::<String,_>("legal_name"),
        "email": row.get::<Option<String>, _>("email"),
        "phone": row.get::<Option<String>, _>("phone"),
        "website": row.get::<Option<String>, _>("website"),
        "iban": row.get::<Option<String>, _>("iban"),
        "bic": row.get::<Option<String>, _>("bic"), "vatId": row.get::<Option<String>,_>("vat_id"),
        "taxNumber": row.get::<Option<String>,_>("tax_number"), "street": row.get::<Option<String>,_>("street"),
        "houseNo": row.get::<Option<String>,_>("house_no"), "addressRecipient": row.get::<Option<String>,_>("addition"),
        "postalCode": row.get::<Option<String>,_>("postal_code"),
        "city": row.get::<Option<String>,_>("city"), "country": row.get::<Option<String>,_>("country"),
    }).to_string())
}

async fn snapshot_customer(executor: &mut sqlx::SqliteConnection, customer_id: &str) -> Result<String, AppError> {
    let row = sqlx::query(
        "SELECT c.number,c.company,c.first_name,c.last_name,c.vat_id,c.tax_status,
                a.street,a.house_no,a.postal_code,a.city,a.country
         FROM customer c LEFT JOIN customer_address a ON a.customer_id=c.id AND a.kind='billing'
         WHERE c.id=?1",
    )
    .bind(customer_id).fetch_one(&mut *executor).await?;
    Ok(serde_json::json!({
        "number": row.get::<String,_>("number"), "company": row.get::<Option<String>,_>("company"),
        "firstName": row.get::<Option<String>,_>("first_name"), "lastName": row.get::<Option<String>,_>("last_name"),
        "vatId": row.get::<Option<String>,_>("vat_id"), "taxStatus": row.get::<String,_>("tax_status"),
        "street": row.get::<Option<String>,_>("street"), "houseNo": row.get::<Option<String>,_>("house_no"),
        "postalCode": row.get::<Option<String>,_>("postal_code"), "city": row.get::<Option<String>,_>("city"),
        "country": row.get::<Option<String>,_>("country"),
    }).to_string())
}

#[tauri::command]
pub async fn finalize_quote(id: String) -> Result<String, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("quotes.finalize").await?;
    let mut tx = db::pool().begin().await?;
    let row = sqlx::query("SELECT status, customer_id, issue_date, valid_until FROM quote WHERE id=?1")
        .bind(&id).fetch_one(&mut *tx).await?;
    if row.get::<String,_>("status") != "draft" { return Err(AppError::AlreadyFinalized.into()); }
    let item_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM quote_item WHERE quote_id=?1 AND kind='item'")
        .bind(&id).fetch_one(&mut *tx).await?;
    if item_count == 0 { return Err(AppError::MissingFields("mindestens eine Position".into()).into()); }
    let customer_id: String = row.get("customer_id");
    let customer_number: String = sqlx::query_scalar("SELECT number FROM customer WHERE id=?1")
        .bind(&customer_id).fetch_one(&mut *tx).await?;
    let number = crate::repo::numbering::next_number(&mut tx, "quote", Some(&customer_number)).await?;
    let company_snapshot = snapshot_company(&mut tx).await?;
    let customer_snapshot = snapshot_customer(&mut tx, &customer_id).await?;
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE quote SET number=?2,status='finalized',company_snapshot_json=?3,
          customer_snapshot_json=?4,finalized_at=?5,updated_at=?5 WHERE id=?1 AND status='draft'",
    )
    .bind(&id).bind(&number).bind(company_snapshot).bind(customer_snapshot).bind(&now)
    .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(number)
}

#[tauri::command]
pub async fn update_quote_status(id: String, status: String) -> Result<(), ErrorPayloadWrapper> {
    if !matches!(status.as_str(), "sent" | "accepted" | "rejected" | "expired" | "archived") {
        return Err(AppError::MissingFields("gültiger Angebotsstatus".into()).into());
    }
    let result = sqlx::query(
        "UPDATE quote SET status=?2,updated_at=?3 WHERE id=?1 AND status NOT IN ('draft','converted')",
    )
    .bind(&id).bind(&status).bind(Utc::now().to_rfc3339()).execute(db::pool()).await?;
    if result.rows_affected() == 0 { return Err(AppError::MissingFields("finalisiertes Angebot".into()).into()); }
    Ok(())
}

#[tauri::command]
pub async fn convert_quote_to_invoice(id: String) -> Result<String, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("quotes.convert").await?;
    let mut tx = db::pool().begin().await?;
    let row = sqlx::query("SELECT * FROM quote WHERE id=?1")
        .bind(&id).fetch_one(&mut *tx).await?;
    let status: String = row.get("status");
    if !matches!(status.as_str(), "finalized" | "sent" | "accepted") {
        return Err(AppError::MissingFields("finalisiertes oder angenommenes Angebot".into()).into());
    }
    if row.try_get::<Option<String>,_>("converted_invoice_id").ok().flatten().is_some() {
        return Err(AppError::MissingFields("Angebot wurde bereits umgewandelt".into()).into());
    }
    let terms: i64 = crate::commands::workspace_settings::get_setting("default_payment_terms_days")
        .await?.and_then(|value| value.parse().ok()).unwrap_or(14);
    let issue_date = Utc::now().date_naive();
    let due_date = issue_date + Duration::days(terms);
    let invoice_id = uuid::Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO invoice
           (id,status,customer_id,issue_date,service_date,due_date,currency,template_id,prices_include_tax,tax_scheme,
            intro_text,outro_text,internal_note,document_discount_kind,document_discount_value,
            net_total_cents,tax_total_cents,gross_total_cents,created_at,updated_at)
         VALUES (?1,'draft',?2,?3,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)",
    )
    .bind(&invoice_id).bind(row.get::<String,_>("customer_id"))
    .bind(issue_date.to_string()).bind(due_date.to_string())
    .bind(row.get::<String,_>("currency")).bind(row.get::<Option<String>,_>("template_id"))
    .bind(row.get::<i64,_>("prices_include_tax")).bind(row.get::<String,_>("tax_scheme")).bind(row.get::<Option<String>,_>("intro_text"))
    .bind(row.get::<Option<String>,_>("outro_text")).bind(row.get::<Option<String>,_>("internal_note"))
    .bind(row.get::<Option<String>,_>("document_discount_kind"))
    .bind(row.try_get::<Option<i64>,_>("document_discount_value").ok().flatten().unwrap_or(0))
    .bind(row.get::<i64,_>("net_total_cents")).bind(row.get::<i64,_>("tax_total_cents"))
    .bind(row.get::<i64,_>("gross_total_cents")).bind(&now)
    .execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO invoice_item
           (id,invoice_id,position,kind,product_id,description,description_extra,quantity_milli,
            unit_id,unit_price_cents,tax_rate_bp,discount_kind,discount_value,hidden,line_net_cents,line_tax_cents)
         SELECT lower(hex(randomblob(16))),?1,position,kind,product_id,description,description_extra,
                quantity_milli,unit_id,unit_price_cents,tax_rate_bp,discount_kind,discount_value,
                hidden,line_net_cents,line_tax_cents FROM quote_item WHERE quote_id=?2",
    )
    .bind(&invoice_id).bind(&id).execute(&mut *tx).await?;
    sqlx::query("UPDATE quote SET status='converted',converted_invoice_id=?2,updated_at=?3 WHERE id=?1")
        .bind(&id).bind(&invoice_id).bind(&now).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(invoice_id)
}

#[tauri::command]
pub async fn list_credit_notes() -> Result<Vec<CreditNoteSummary>, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT cn.id,cn.number,cn.kind,cn.status,cn.origin_invoice_id,i.number AS origin_invoice_number,
                COALESCE(NULLIF(c.company,''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) AS customer_name,
                cn.issue_date,cn.reason,cn.gross_total_cents,cn.pdf_path,cn.template_id
         FROM credit_note cn JOIN invoice i ON i.id=cn.origin_invoice_id
         JOIN customer c ON c.id=cn.customer_id ORDER BY cn.issue_date DESC,cn.created_at DESC",
    )
    .fetch_all(db::pool()).await?;
    Ok(rows.into_iter().map(|row| CreditNoteSummary {
        id: row.get("id"), number: row.get("number"), kind: row.get("kind"),
        status: row.get("status"), origin_invoice_id: row.get("origin_invoice_id"),
        origin_invoice_number: row.get("origin_invoice_number"), customer_name: customer_name(&row),
        issue_date: row.get("issue_date"), reason: row.get("reason"),
        gross_total_cents: row.get("gross_total_cents"), pdf_path: row.get("pdf_path"),
        template_id: row.get("template_id"),
    }).collect())
}

#[tauri::command]
pub async fn create_credit_note_from_invoice(
    origin_invoice_id: String,
    reason: String,
    template_id: Option<String>,
) -> Result<String, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("credit_notes.create").await?;
    if reason.trim().is_empty() { return Err(AppError::MissingFields("Grund der Gutschrift".into()).into()); }
    let mut tx = db::pool().begin().await?;
    let origin = sqlx::query("SELECT * FROM invoice WHERE id=?1")
        .bind(&origin_invoice_id).fetch_one(&mut *tx).await?;
    let status: String = origin.get("status");
    if matches!(status.as_str(), "draft" | "cancelled" | "archived") {
        return Err(AppError::MissingFields("finalisierte Ursprungsrechnung".into()).into());
    }
    let existing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM credit_note WHERE origin_invoice_id=?1 AND kind='credit_note' AND status!='archived'",
    )
    .bind(&origin_invoice_id).fetch_one(&mut *tx).await?;
    if existing > 0 {
        return Err(AppError::MissingFields("Für diese Rechnung existiert bereits eine Gutschrift".into()).into());
    }
    let id = uuid::Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO credit_note
           (id,kind,status,origin_invoice_id,customer_id,issue_date,reason,currency,tax_scheme,template_id,
            net_total_cents,tax_total_cents,gross_total_cents,company_snapshot_json,
            customer_snapshot_json,created_at,updated_at)
         VALUES (?1,'credit_note','draft',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)",
    )
    .bind(&id).bind(&origin_invoice_id).bind(origin.get::<String,_>("customer_id"))
    .bind(Utc::now().date_naive().to_string()).bind(reason.trim())
    .bind(origin.get::<String,_>("currency")).bind(origin.get::<String,_>("tax_scheme"))
    .bind(template_id.or_else(|| origin.get::<Option<String>,_>("template_id")))
    .bind(origin.get::<i64,_>("net_total_cents")).bind(origin.get::<i64,_>("tax_total_cents"))
    .bind(origin.get::<i64,_>("gross_total_cents"))
    .bind(origin.get::<Option<String>,_>("company_snapshot_json"))
    .bind(origin.get::<Option<String>,_>("customer_snapshot_json"))
    .bind(&now).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO credit_note_item
           (id,credit_note_id,position,origin_item_id,description,quantity_milli,unit_id,
            unit_price_cents,tax_rate_bp,line_net_cents,line_tax_cents)
         SELECT lower(hex(randomblob(16))),?1,position,id,description,quantity_milli,unit_id,
                unit_price_cents,tax_rate_bp,line_net_cents,line_tax_cents
         FROM invoice_item WHERE invoice_id=?2 AND kind='item' AND hidden=0 ORDER BY position",
    )
    .bind(&id).bind(&origin_invoice_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(id)
}

#[tauri::command]
pub async fn finalize_credit_note(id: String) -> Result<String, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("credit_notes.finalize").await?;
    let mut tx = db::pool().begin().await?;
    let row = sqlx::query("SELECT status,customer_id,kind FROM credit_note WHERE id=?1")
        .bind(&id).fetch_one(&mut *tx).await?;
    if row.get::<String,_>("status") != "draft" { return Err(AppError::AlreadyFinalized.into()); }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credit_note_item WHERE credit_note_id=?1")
        .bind(&id).fetch_one(&mut *tx).await?;
    if count == 0 { return Err(AppError::MissingFields("Gutschriftpositionen".into()).into()); }
    let customer_id: String = row.get("customer_id");
    let customer_number: String = sqlx::query_scalar("SELECT number FROM customer WHERE id=?1")
        .bind(&customer_id).fetch_one(&mut *tx).await?;
    let doc_type = if row.get::<String,_>("kind") == "cancellation" { "cancellation" } else { "credit_note" };
    let number = crate::repo::numbering::next_number(&mut tx, doc_type, Some(&customer_number)).await?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE credit_note SET number=?2,status='finalized',finalized_at=?3,updated_at=?3 WHERE id=?1")
        .bind(&id).bind(&number).bind(&now).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(number)
}
