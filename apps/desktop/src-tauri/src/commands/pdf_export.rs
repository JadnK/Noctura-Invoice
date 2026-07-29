//! Deterministische PDF-Ausgabe für Rechnungen, Angebote und Gutschriften.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use serde::Serialize;
use serde_json::Value;
use sqlx::Row;
use std::{fs, path::PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportResult {
    pub path: String,
    pub sha256: String,
    pub pages: usize,
}

struct PdfLine {
    kind: String,
    description: String,
    description_extra: String,
    quantity_milli: i64,
    unit_price_cents: i64,
    tax_rate_bp: i64,
    discount_kind: Option<String>,
    discount_value: i64,
    unit: String,
    line_net_cents: i64,
    line_tax_cents: i64,
    line_total_cents: i64,
}

struct PdfTaxGroup {
    tax_rate_bp: i64,
    net_cents: i64,
    tax_cents: i64,
}

struct PdfDocument {
    document_type: String,
    template_id: Option<String>,
    title: String,
    status: String,
    number: String,
    issue_date: String,
    service_date: Option<String>,
    customer_number: Option<String>,
    secondary_label: String,
    secondary_date: String,
    customer_name: String,
    customer_address: Vec<String>,
    company_name: Option<String>,
    company_address: Vec<String>,
    company_footer: Option<String>,
    intro_text: String,
    outro_text: String,
    public_note: String,
    reason: String,
    currency: String,
    tax_scheme: String,
    document_discount_kind: Option<String>,
    document_discount_value: i64,
    net_total_cents: i64,
    tax_total_cents: i64,
    gross_total_cents: i64,
    tax_groups: Vec<PdfTaxGroup>,
    lines: Vec<PdfLine>,
}

fn text(value: &str) -> String {
    format!("#text({})", serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into()))
}

fn cell(value: &str) -> String {
    format!("[{}]", text(value))
}

fn money(cents: i64, currency: &str) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let cents = cents.abs();
    let major = cents / 100;
    let minor = cents % 100;
    let grouped = major
        .to_string()
        .as_bytes()
        .rchunks(3)
        .rev()
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join(".");
    format!("{sign}{grouped},{minor:02} {currency}")
}

fn quantity(milli: i64) -> String {
    if milli % 1000 == 0 {
        (milli / 1000).to_string()
    } else {
        format!("{:.3}", milli as f64 / 1000.0).replace('.', ",").trim_end_matches('0').trim_end_matches(',').to_string()
    }
}

fn date_de(value: &str) -> String {
    let mut parts = value.split('-');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(year), Some(month), Some(day)) if year.len() == 4 => format!("{day}.{month}.{year}"),
        _ => value.to_string(),
    }
}

fn file_name(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '_' })
        .collect();
    if cleaned.trim_matches('_').is_empty() { "Beleg".into() } else { cleaned }
}

fn customer_label(row: &sqlx::sqlite::SqliteRow) -> String {
    let company: Option<String> = row.try_get("customer_company").ok().flatten();
    let first: Option<String> = row.try_get("customer_first_name").ok().flatten();
    let last: Option<String> = row.try_get("customer_last_name").ok().flatten();
    company
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{} {}", first.unwrap_or_default(), last.unwrap_or_default()).trim().to_string())
}

fn address_lines(row: &sqlx::sqlite::SqliteRow) -> Vec<String> {
    let street: Option<String> = row.try_get("customer_street").ok().flatten();
    let house: Option<String> = row.try_get("customer_house_no").ok().flatten();
    let postal: Option<String> = row.try_get("customer_postal_code").ok().flatten();
    let city: Option<String> = row.try_get("customer_city").ok().flatten();
    let country: Option<String> = row.try_get("customer_country").ok().flatten();
    let mut result = Vec::new();
    let street_line = format!("{} {}", street.unwrap_or_default(), house.unwrap_or_default()).trim().to_string();
    if !street_line.is_empty() { result.push(street_line); }
    let city_line = format!("{} {}", postal.unwrap_or_default(), city.unwrap_or_default()).trim().to_string();
    if !city_line.is_empty() { result.push(city_line); }
    if let Some(country) = country.filter(|value| !value.trim().is_empty() && value != "DE") {
        result.push(country);
    }
    result
}


fn snapshot_json(row: &sqlx::sqlite::SqliteRow, column: &str) -> Option<serde_json::Value> {
    row.try_get::<Option<String>, _>(column)
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn json_address(value: &serde_json::Value) -> Vec<String> {
    let street = format!(
        "{} {}",
        json_string(value, "street").unwrap_or_default(),
        json_string(value, "houseNo").unwrap_or_default()
    )
    .trim()
    .to_string();
    let city = format!(
        "{} {}",
        json_string(value, "postalCode").unwrap_or_default(),
        json_string(value, "city").unwrap_or_default()
    )
    .trim()
    .to_string();
    // Empfaenger-Zusatz (z. B. bei gemieteter Adresse) steht zwischen Name und
    // Strasse - genau die Zeile, die eine Postzustellung tatsaechlich braucht,
    // wenn der Briefkasten auf einen anderen Namen als die Firma laeuft.
    let mut result = vec![json_string(value, "addressRecipient").unwrap_or_default(), street, city];
    if let Some(country) = json_string(value, "country").filter(|country| country != "DE") {
        result.push(country);
    }
    result.retain(|line| !line.is_empty());
    result
}

fn customer_block(row: &sqlx::sqlite::SqliteRow) -> (String, Vec<String>) {
    if let Some(snapshot) = snapshot_json(row, "customer_snapshot_json") {
        let name = json_string(&snapshot, "company").unwrap_or_else(|| {
            format!(
                "{} {}",
                json_string(&snapshot, "firstName").unwrap_or_default(),
                json_string(&snapshot, "lastName").unwrap_or_default()
            )
            .trim()
            .to_string()
        });
        if !name.is_empty() {
            return (name, json_address(&snapshot));
        }
    }
    (customer_label(row), address_lines(row))
}

#[derive(Default)]
struct SnapshotCompany {
    name: Option<String>,
    address: Vec<String>,
    footer: Option<String>,
}

fn company_snapshot_block(row: &sqlx::sqlite::SqliteRow) -> SnapshotCompany {
    let Some(snapshot) = snapshot_json(row, "company_snapshot_json") else {
        return SnapshotCompany::default();
    };
    let mut footer = Vec::new();
    for key in ["email", "phone", "website"] {
        if let Some(value) = json_string(&snapshot, key) {
            footer.push(value);
        }
    }
    if let Some(value) = json_string(&snapshot, "iban") {
        footer.push(format!("IBAN {value}"));
    }
    if let Some(value) = json_string(&snapshot, "bic") {
        footer.push(format!("BIC {value}"));
    }
    if let Some(value) = json_string(&snapshot, "vatId") {
        footer.push(format!("USt-IdNr. {value}"));
    }
    if let Some(value) = json_string(&snapshot, "taxNumber") {
        footer.push(format!("Steuernr. {value}"));
    }
    SnapshotCompany {
        name: json_string(&snapshot, "legalName"),
        address: json_address(&snapshot),
        footer: if footer.is_empty() { None } else { Some(footer.join(" · ")) },
    }
}

async fn load_document(document_type: &str, id: &str) -> Result<PdfDocument, AppError> {
    match document_type {
        "invoice" => {
            let row = sqlx::query(
                "SELECT i.number, i.status, i.issue_date, i.service_date, i.due_date, i.currency, i.tax_scheme, i.template_id,
                        i.intro_text, i.outro_text, i.public_note, i.document_discount_kind, i.document_discount_value,
                        i.company_snapshot_json, i.customer_snapshot_json,
                        i.net_total_cents, i.tax_total_cents, i.gross_total_cents,
                        c.number customer_number, c.company customer_company, c.first_name customer_first_name, c.last_name customer_last_name,
                        a.street customer_street, a.house_no customer_house_no,
                        a.postal_code customer_postal_code, a.city customer_city, a.country customer_country
                 FROM invoice i JOIN customer c ON c.id=i.customer_id
                 LEFT JOIN customer_address a ON a.customer_id=c.id AND a.kind='billing'
                 WHERE i.id=?1 AND i.deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(db::pool())
            .await?
            .ok_or_else(|| AppError::MissingFields("vorhandene Rechnung".into()))?;
            let number: Option<String> = row.get("number");
            let number = number.ok_or_else(|| AppError::MissingFields("finalisierte Rechnung".into()))?;
            let (customer_name, customer_address) = customer_block(&row);
            let company = company_snapshot_block(&row);
            let line_rows = sqlx::query(
                "SELECT item.kind, item.description, item.description_extra, item.quantity_milli,
                        COALESCE(u.label, '') unit_label, item.unit_price_cents, item.tax_rate_bp,
                        item.discount_kind, item.discount_value, item.line_net_cents, item.line_tax_cents,
                        item.line_net_cents + item.line_tax_cents line_total_cents
                 FROM invoice_item item
                 LEFT JOIN unit u ON u.id=item.unit_id
                 WHERE item.invoice_id=?1 AND item.hidden=0 ORDER BY item.position",
            )
            .bind(id)
            .fetch_all(db::pool())
            .await?;
            let tax_rows = sqlx::query(
                "SELECT tax_rate_bp, net_cents, tax_cents FROM invoice_tax_summary WHERE invoice_id=?1 ORDER BY tax_rate_bp DESC",
            )
            .bind(id)
            .fetch_all(db::pool())
            .await?;
            Ok(PdfDocument {
                document_type: "invoice".into(), template_id: row.get("template_id"), title: "Rechnung".into(), status: row.get("status"), number,
                issue_date: row.get("issue_date"), service_date: row.get("service_date"),
                customer_number: row.get("customer_number"), secondary_label: "Fällig am".into(), secondary_date: row.get("due_date"),
                customer_name, customer_address,
                company_name: company.name, company_address: company.address, company_footer: company.footer,
                intro_text: row.get::<Option<String>, _>("intro_text").unwrap_or_default(),
                outro_text: row.get::<Option<String>, _>("outro_text").unwrap_or_default(),
                public_note: row.get::<Option<String>, _>("public_note").unwrap_or_default(), reason: String::new(),
                currency: row.get("currency"), tax_scheme: row.get("tax_scheme"),
                document_discount_kind: row.get("document_discount_kind"),
                document_discount_value: row.get::<Option<i64>, _>("document_discount_value").unwrap_or(0),
                net_total_cents: row.get("net_total_cents"), tax_total_cents: row.get("tax_total_cents"),
                gross_total_cents: row.get("gross_total_cents"),
                tax_groups: tax_rows.into_iter().map(|tax| PdfTaxGroup {
                    tax_rate_bp: tax.get("tax_rate_bp"), net_cents: tax.get("net_cents"), tax_cents: tax.get("tax_cents"),
                }).collect(),
                lines: line_rows.into_iter().map(|line| PdfLine {
                    kind: line.get::<Option<String>, _>("kind").unwrap_or_else(|| "item".into()),
                    description: line.get::<Option<String>, _>("description").unwrap_or_default(),
                    description_extra: line.get::<Option<String>, _>("description_extra").unwrap_or_default(),
                    quantity_milli: line.get("quantity_milli"), unit_price_cents: line.get("unit_price_cents"),
                    tax_rate_bp: line.get("tax_rate_bp"),
                    discount_kind: line.get::<Option<String>, _>("discount_kind"),
                    discount_value: line.get::<Option<i64>, _>("discount_value").unwrap_or(0),
                    unit: line.get::<Option<String>, _>("unit_label").unwrap_or_default(),
                    line_net_cents: line.get("line_net_cents"), line_tax_cents: line.get("line_tax_cents"),
                    line_total_cents: line.get("line_total_cents"),
                }).collect(),
            })
        }
        "quote" => {
            let row = sqlx::query(
                "SELECT q.number, q.status, q.issue_date, q.valid_until, q.currency, q.tax_scheme, q.template_id,
                        q.intro_text, q.outro_text, q.document_discount_kind, q.document_discount_value, q.company_snapshot_json, q.customer_snapshot_json,
                        q.net_total_cents, q.tax_total_cents, q.gross_total_cents,
                        c.number customer_number, c.company customer_company, c.first_name customer_first_name, c.last_name customer_last_name,
                        a.street customer_street, a.house_no customer_house_no,
                        a.postal_code customer_postal_code, a.city customer_city, a.country customer_country
                 FROM quote q JOIN customer c ON c.id=q.customer_id
                 LEFT JOIN customer_address a ON a.customer_id=c.id AND a.kind='billing'
                 WHERE q.id=?1 AND q.deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(db::pool())
            .await?
            .ok_or_else(|| AppError::MissingFields("vorhandenes Angebot".into()))?;
            let number: Option<String> = row.get("number");
            let number = number.ok_or_else(|| AppError::MissingFields("finalisiertes Angebot".into()))?;
            let (customer_name, customer_address) = customer_block(&row);
            let company = company_snapshot_block(&row);
            let line_rows = sqlx::query(
                "SELECT item.kind, item.description, item.description_extra, item.quantity_milli,
                        COALESCE(u.label, '') unit_label, item.unit_price_cents, item.tax_rate_bp,
                        item.discount_kind, item.discount_value, item.line_net_cents, item.line_tax_cents,
                        item.line_net_cents + item.line_tax_cents line_total_cents
                 FROM quote_item item
                 LEFT JOIN unit u ON u.id=item.unit_id
                 WHERE item.quote_id=?1 AND item.hidden=0 ORDER BY item.position",
            )
            .bind(id)
            .fetch_all(db::pool())
            .await?;
            Ok(PdfDocument {
                document_type: "quote".into(), template_id: row.get("template_id"), title: "Angebot".into(), status: row.get("status"), number,
                issue_date: row.get("issue_date"), service_date: None, customer_number: row.get("customer_number"),
                secondary_label: "Gültig bis".into(), secondary_date: row.get("valid_until"),
                customer_name, customer_address,
                company_name: company.name, company_address: company.address, company_footer: company.footer,
                intro_text: row.get::<Option<String>, _>("intro_text").unwrap_or_default(),
                outro_text: row.get::<Option<String>, _>("outro_text").unwrap_or_default(),
                public_note: String::new(), reason: String::new(), currency: row.get("currency"),
                tax_scheme: row.get("tax_scheme"), document_discount_kind: row.get("document_discount_kind"),
                document_discount_value: row.get::<Option<i64>, _>("document_discount_value").unwrap_or(0), net_total_cents: row.get("net_total_cents"),
                tax_total_cents: row.get("tax_total_cents"), gross_total_cents: row.get("gross_total_cents"),
                tax_groups: Vec::new(),
                lines: line_rows.into_iter().map(|line| PdfLine {
                    kind: line.get::<Option<String>, _>("kind").unwrap_or_else(|| "item".into()),
                    description: line.get::<Option<String>, _>("description").unwrap_or_default(),
                    description_extra: line.get::<Option<String>, _>("description_extra").unwrap_or_default(),
                    quantity_milli: line.get("quantity_milli"), unit_price_cents: line.get("unit_price_cents"),
                    tax_rate_bp: line.get("tax_rate_bp"),
                    discount_kind: line.get::<Option<String>, _>("discount_kind"),
                    discount_value: line.get::<Option<i64>, _>("discount_value").unwrap_or(0),
                    unit: line.get::<Option<String>, _>("unit_label").unwrap_or_default(),
                    line_net_cents: line.get("line_net_cents"), line_tax_cents: line.get("line_tax_cents"),
                    line_total_cents: line.get("line_total_cents"),
                }).collect(),
            })
        }
        "credit_note" => {
            let row = sqlx::query(
                "SELECT n.number, n.kind, n.status, n.issue_date, n.currency, n.tax_scheme, n.reason, n.template_id,
                        n.net_total_cents, n.tax_total_cents, n.gross_total_cents,
                        n.company_snapshot_json, n.customer_snapshot_json, n.origin_invoice_id,
                        i.number origin_number,
                        c.number customer_number, c.company customer_company, c.first_name customer_first_name, c.last_name customer_last_name,
                        a.street customer_street, a.house_no customer_house_no,
                        a.postal_code customer_postal_code, a.city customer_city, a.country customer_country
                 FROM credit_note n JOIN invoice i ON i.id=n.origin_invoice_id
                 JOIN customer c ON c.id=n.customer_id
                 LEFT JOIN customer_address a ON a.customer_id=c.id AND a.kind='billing'
                 WHERE n.id=?1",
            )
            .bind(id)
            .fetch_optional(db::pool())
            .await?
            .ok_or_else(|| AppError::MissingFields("vorhandene Gutschrift".into()))?;
            let number: Option<String> = row.get("number");
            let number = number.ok_or_else(|| AppError::MissingFields("finalisierte Gutschrift".into()))?;
            let kind: String = row.get("kind");
            let origin: Option<String> = row.get("origin_number");
            let (customer_name, customer_address) = customer_block(&row);
            let company = company_snapshot_block(&row);
            let line_rows = sqlx::query(
                "SELECT 'item' kind, item.description, NULL description_extra, item.quantity_milli,
                        COALESCE(u.label, '') unit_label, item.unit_price_cents, item.tax_rate_bp,
                        NULL discount_kind, 0 discount_value, item.line_net_cents, item.line_tax_cents,
                        item.line_net_cents + item.line_tax_cents line_total_cents
                 FROM credit_note_item item
                 LEFT JOIN unit u ON u.id=item.unit_id
                 WHERE item.credit_note_id=?1 ORDER BY item.position",
            )
            .bind(id)
            .fetch_all(db::pool())
            .await?;
            let origin_invoice_id: String = row.get("origin_invoice_id");
            let tax_rows = sqlx::query(
                "SELECT tax_rate_bp, net_cents, tax_cents FROM invoice_tax_summary WHERE invoice_id=?1 ORDER BY tax_rate_bp DESC",
            )
            .bind(origin_invoice_id)
            .fetch_all(db::pool())
            .await?;
            Ok(PdfDocument {
                document_type: "credit_note".into(), template_id: row.get("template_id"),
                title: if kind == "cancellation" { "Stornorechnung".into() } else { "Gutschrift".into() },
                status: row.get("status"), number, issue_date: row.get("issue_date"), service_date: None,
                customer_number: row.get("customer_number"), secondary_label: "Bezug".into(),
                secondary_date: origin.unwrap_or_else(|| "Ursprungsrechnung".into()),
                customer_name, customer_address,
                company_name: company.name, company_address: company.address, company_footer: company.footer,
                intro_text: String::new(), outro_text: String::new(), public_note: String::new(),
                reason: row.get::<Option<String>, _>("reason").unwrap_or_default(),
                currency: row.get("currency"), tax_scheme: row.get("tax_scheme"),
                document_discount_kind: None, document_discount_value: 0,
                net_total_cents: row.get("net_total_cents"), tax_total_cents: row.get("tax_total_cents"),
                gross_total_cents: row.get("gross_total_cents"),
                tax_groups: tax_rows.into_iter().map(|tax| PdfTaxGroup {
                    tax_rate_bp: tax.get("tax_rate_bp"), net_cents: tax.get("net_cents"), tax_cents: tax.get("tax_cents"),
                }).collect(),
                lines: line_rows.into_iter().map(|line| PdfLine {
                    kind: line.get::<Option<String>, _>("kind").unwrap_or_else(|| "item".into()),
                    description: line.get::<Option<String>, _>("description").unwrap_or_default(),
                    description_extra: line.get::<Option<String>, _>("description_extra").unwrap_or_default(),
                    quantity_milli: line.get("quantity_milli"), unit_price_cents: line.get("unit_price_cents"),
                    tax_rate_bp: line.get("tax_rate_bp"),
                    discount_kind: line.get::<Option<String>, _>("discount_kind"),
                    discount_value: line.get::<Option<i64>, _>("discount_value").unwrap_or(0),
                    unit: line.get::<Option<String>, _>("unit_label").unwrap_or_default(),
                    line_net_cents: line.get("line_net_cents"), line_tax_cents: line.get("line_tax_cents"),
                    line_total_cents: line.get("line_total_cents"),
                }).collect(),
            })
        }
        _ => Err(AppError::MissingFields("gültiger Dokumenttyp".into())),
    }
}

async fn company_block() -> Result<(String, Vec<String>, String, Option<String>), AppError> {
    let row = sqlx::query(
        "SELECT p.legal_name, p.legal_form, p.owner_first_name, p.owner_last_name,
                p.email, p.phone, p.website, p.vat_id, p.tax_number, p.logo_path,
                a.street, a.house_no, a.addition, a.postal_code, a.city, a.country,
                b.holder bank_holder, b.bank_name, b.iban, b.bic
         FROM company_profile p
         LEFT JOIN company_address a ON a.company_id=p.id AND a.kind='main'
         LEFT JOIN bank_account b ON b.company_id=p.id AND b.is_default=1
         ORDER BY p.created_at LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    .ok_or_else(|| AppError::MissingFields("Firmenstammdaten".into()))?;

    let legal_name: String = row.get("legal_name");
    let street = format!(
        "{} {}",
        row.get::<Option<String>, _>("street").unwrap_or_default(),
        row.get::<Option<String>, _>("house_no").unwrap_or_default()
    ).trim().to_string();
    let city = format!(
        "{} {}",
        row.get::<Option<String>, _>("postal_code").unwrap_or_default(),
        row.get::<Option<String>, _>("city").unwrap_or_default()
    ).trim().to_string();
    let mut address = vec![row.get::<Option<String>, _>("addition").unwrap_or_default(), street, city];
    if let Some(country) = row
        .get::<Option<String>, _>("country")
        .filter(|value| !value.trim().is_empty() && value != "DE")
    {
        address.push(country);
    }
    address.retain(|line| !line.is_empty());

    let mut footer = Vec::new();
    if let Some(value) = row.get::<Option<String>, _>("email").filter(|value| !value.trim().is_empty()) { footer.push(value); }
    if let Some(value) = row.get::<Option<String>, _>("phone").filter(|value| !value.trim().is_empty()) { footer.push(value); }
    if let Some(value) = row.get::<Option<String>, _>("website").filter(|value| !value.trim().is_empty()) { footer.push(value); }
    if let Some(value) = row.get::<Option<String>, _>("iban").filter(|value| !value.trim().is_empty()) { footer.push(format!("IBAN {value}")); }
    if let Some(value) = row.get::<Option<String>, _>("bic").filter(|value| !value.trim().is_empty()) { footer.push(format!("BIC {value}")); }
    if let Some(value) = row.get::<Option<String>, _>("vat_id").filter(|value| !value.trim().is_empty()) { footer.push(format!("USt-IdNr. {value}")); }
    if let Some(value) = row.get::<Option<String>, _>("tax_number").filter(|value| !value.trim().is_empty()) { footer.push(format!("Steuernr. {value}")); }
    Ok((legal_name, address, footer.join(" · "), row.get("logo_path")))
}

#[derive(Clone)]
struct TemplateStyle {
    variant: String,
    font_family: String,
    base_font_size_pt: f64,
    primary_color: String,
    secondary_color: String,
    accent_color: String,
    margin_top_mm: f64,
    margin_right_mm: f64,
    margin_bottom_mm: f64,
    margin_left_mm: f64,
    watermark: String,
    item_columns: Vec<String>,
    show_intro: bool,
    show_totals: bool,
    show_tax_summary: bool,
    show_payment_info: bool,
    logo_width_mm: f64,
    din5008: bool,
}

impl Default for TemplateStyle {
    fn default() -> Self {
        Self {
            variant: "compact".into(),
            font_family: "Inter".into(),
            base_font_size_pt: 8.5,
            primary_color: "111827".into(),
            secondary_color: "6B7280".into(),
            accent_color: "0F766E".into(),
            margin_top_mm: 16.0,
            margin_right_mm: 20.0,
            margin_bottom_mm: 20.0,
            margin_left_mm: 25.0,
            watermark: "none".into(),
            item_columns: vec![
                "position".into(), "description".into(), "quantity".into(),
                "unit_price".into(), "tax_rate".into(), "line_total".into(),
            ],
            show_intro: true,
            show_totals: true,
            show_tax_summary: true,
            show_payment_info: true,
            logo_width_mm: 30.0,
            din5008: true,
        }
    }
}

fn safe_hex(value: Option<&str>, fallback: &str) -> String {
    let candidate = value.unwrap_or(fallback).trim().trim_start_matches('#');
    if candidate.len() == 6 && candidate.chars().all(|ch| ch.is_ascii_hexdigit()) {
        candidate.to_ascii_uppercase()
    } else {
        fallback.trim_start_matches('#').to_ascii_uppercase()
    }
}

fn bounded_number(value: Option<&Value>, fallback: f64, min: f64, max: f64) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(fallback).clamp(min, max)
}

fn block_visible(layout: &Value, block_type: &str, fallback: bool) -> bool {
    layout.get("body").and_then(Value::as_array).and_then(|blocks| {
        blocks.iter().find(|block| block.get("type").and_then(Value::as_str) == Some(block_type))
    }).and_then(|block| block.get("visible").and_then(Value::as_bool)).unwrap_or(fallback)
}

fn style_from_layout(layout: &str) -> TemplateStyle {
    let Ok(value) = serde_json::from_str::<Value>(layout) else { return TemplateStyle::default(); };
    let mut style = TemplateStyle::default();
    let page = value.get("page").unwrap_or(&Value::Null);
    style.variant = match page.get("variant").and_then(Value::as_str) {
        Some("classic") => "classic",
        Some("compact") => "compact",
        _ => "modern",
    }.into();
    style.font_family = match page.get("fontFamily").and_then(Value::as_str) {
        Some("Source Sans 3") => "Inter",
        Some("Source Serif 4") => "Source Serif 4",
        Some("IBM Plex Mono") => "IBM Plex Mono",
        _ => "Inter",
    }.into();
    style.base_font_size_pt = bounded_number(page.get("baseFontSizePt"), style.base_font_size_pt, 7.0, 14.0);
    style.primary_color = safe_hex(page.get("primaryColor").and_then(Value::as_str), &style.primary_color);
    style.secondary_color = safe_hex(page.get("secondaryColor").and_then(Value::as_str), &style.secondary_color);
    style.accent_color = safe_hex(page.get("accentColor").and_then(Value::as_str), &style.accent_color);
    style.margin_top_mm = bounded_number(page.get("marginTopMm"), style.margin_top_mm, 8.0, 40.0);
    style.margin_right_mm = bounded_number(page.get("marginRightMm"), style.margin_right_mm, 8.0, 35.0);
    style.margin_bottom_mm = bounded_number(page.get("marginBottomMm"), style.margin_bottom_mm, 12.0, 40.0);
    style.margin_left_mm = bounded_number(page.get("marginLeftMm"), style.margin_left_mm, 8.0, 35.0);
    style.logo_width_mm = bounded_number(page.get("logoWidthMm"), style.logo_width_mm, 12.0, 65.0);
    style.din5008 = page.get("din5008").and_then(Value::as_bool).unwrap_or(true);
    if style.din5008 {
        style.margin_top_mm = 16.0;
        style.margin_right_mm = 20.0;
        style.margin_bottom_mm = 20.0;
        style.margin_left_mm = 25.0;
    }
    style.watermark = match value.get("watermark").and_then(Value::as_str) {
        Some("draft") => "draft", Some("paid") => "paid", _ => "none",
    }.into();
    if let Some(columns) = value.get("body").and_then(Value::as_array)
        .and_then(|blocks| blocks.iter().find(|block| block.get("type").and_then(Value::as_str) == Some("items_table")))
        .and_then(|block| block.get("columns")).and_then(Value::as_array)
    {
        let allowed = ["position", "description", "quantity", "unit", "unit_price", "discount", "tax_rate", "line_total"];
        let parsed: Vec<String> = columns.iter().filter_map(Value::as_str)
            .filter(|column| allowed.contains(column)).map(str::to_string).collect();
        if parsed.contains(&"description".to_string()) && parsed.contains(&"line_total".to_string()) && parsed.len() >= 3 {
            style.item_columns = parsed;
        }
    }
    style.show_intro = block_visible(&value, "text", true);
    style.show_totals = block_visible(&value, "totals", true);
    style.show_tax_summary = block_visible(&value, "tax_summary", true);
    style.show_payment_info = block_visible(&value, "payment_info", true);
    style
}

async fn load_template_style(template_id: Option<&str>) -> Result<TemplateStyle, AppError> {
    let selected = if let Some(id) = template_id.filter(|value| !value.trim().is_empty()) {
        sqlx::query_scalar::<_, String>("SELECT layout_json FROM document_template WHERE id=?1")
            .bind(id).fetch_optional(db::pool()).await?
    } else { None };
    let layout = match selected {
        Some(layout) => Some(layout),
        None => sqlx::query_scalar::<_, String>(
            "SELECT layout_json FROM document_template ORDER BY is_default DESC, updated_at DESC LIMIT 1",
        ).fetch_optional(db::pool()).await?,
    };
    Ok(layout.as_deref().map(style_from_layout).unwrap_or_default())
}

fn discount(line: &PdfLine, currency: &str) -> String {
    match line.discount_kind.as_deref() {
        Some("percent") if line.discount_value > 0 => format!("{:.2} %", line.discount_value as f64 / 100.0).replace('.', ","),
        Some("fixed") if line.discount_value > 0 => money(line.discount_value, currency),
        _ => String::new(),
    }
}

fn column_label(column: &str) -> &'static str {
    match column {
        "position" => "Pos.", "description" => "Beschreibung", "quantity" => "Menge",
        "unit" => "Einheit", "unit_price" => "Einzelpreis", "discount" => "Rabatt",
        "tax_rate" => "USt.", "line_total" => "Gesamt", _ => "",
    }
}

fn column_width(column: &str) -> &'static str {
    match column {
        "position" => "10mm", "description" => "1fr", "quantity" => "16mm", "unit" => "14mm",
        "unit_price" => "25mm", "discount" => "18mm", "tax_rate" => "15mm", "line_total" => "28mm",
        _ => "auto",
    }
}

fn line_value(line: &PdfLine, column: &str, position: usize, currency: &str) -> String {
    match column {
        "position" => position.to_string(),
        "description" => if line.description_extra.trim().is_empty() { line.description.clone() } else {
            format!("{}\n{}", line.description, line.description_extra)
        },
        "quantity" => quantity(line.quantity_milli),
        "unit" => line.unit.clone(),
        "unit_price" => money(line.unit_price_cents, currency),
        "discount" => discount(line, currency),
        "tax_rate" => format!("{:.2} %", line.tax_rate_bp as f64 / 100.0).replace('.', ","),
        "line_total" => money(line.line_total_cents, currency),
        _ => String::new(),
    }
}

fn build_item_cells(document: &PdfDocument, style: &TemplateStyle) -> String {
    let mut cells: Vec<String> = style.item_columns.iter().map(|column| {
        format!(
            "table.cell(fill: rgb(\"{}\"))[#text(weight: \"semibold\", fill: rgb(\"FFFFFF\"))[{}]]",
            style.accent_color,
            text(column_label(column)),
        )
    }).collect();
    let mut position = 0usize;
    for line in &document.lines {
        if line.kind == "heading" {
            cells.push(format!(
                "table.cell(colspan: {}, fill: rgb(\"F1F5F9\"))[#text(weight: \"semibold\")[{}]]",
                style.item_columns.len(),
                text(&line.description),
            ));
            continue;
        }
        position += 1;
        for column in &style.item_columns {
            cells.push(cell(&line_value(line, column, position, &document.currency)));
        }
    }
    cells.join(",\n")
}

fn typst_lines(lines: &[String]) -> String {
    lines.iter().map(|line| text(line)).collect::<Vec<_>>().join("\n#linebreak()\n")
}

fn build_markup(
    document: &PdfDocument,
    company: &str,
    company_address: &[String],
    footer: &str,
    style: &TemplateStyle,
    logo_asset: Option<&str>,
) -> String {
    let sender_address = company_address.join(" · ");
    let customer_address = typst_lines(&document.customer_address);
    let company_address_lines = typst_lines(company_address);
    let cells = build_item_cells(document, style);
    let columns = style.item_columns.iter().map(|column| column_width(column)).collect::<Vec<_>>().join(", ");
    let aligns = style.item_columns.iter().map(|column| if *column == "description" { "left" } else { "right" }).collect::<Vec<_>>().join(", ");

    let tax_note = match document.tax_scheme.as_str() {
        "small_business" => "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
        "reverse_charge" => "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).",
        "intra_community" => "Steuerfreie innergemeinschaftliche Leistung.",
        "tax_exempt" => "Steuerfreie Leistung.",
        _ => "",
    };
    let intro = if !style.show_intro || document.intro_text.trim().is_empty() {
        String::new()
    } else {
        format!("#block(fill: rgb(\"F8FAFC\"), radius: 3pt, inset: 8pt)[{}]\n#v(6mm)", text(&document.intro_text))
    };
    let mut notes = vec![document.outro_text.trim(), document.public_note.trim(), document.reason.trim()];
    if style.show_tax_summary { notes.push(tax_note); }
    let outro = notes.into_iter()
        .filter(|value| !value.is_empty())
        .map(|value| format!("#block[{}]", text(value)))
        .collect::<Vec<_>>()
        .join("\n#v(4pt)\n");
    let payment = if style.show_payment_info && document.document_type == "invoice" {
        format!(
            "#v(6mm)\n#block(stroke: 0.7pt + rgb(\"{}\"), radius: 3pt, inset: 8pt)[#text(weight: \"semibold\", fill: rgb(\"{}\"))[Zahlungshinweis] #linebreak()\n{}]",
            style.accent_color,
            style.accent_color,
            text(&format!(
                "Bitte überweisen Sie den Gesamtbetrag bis {} unter Angabe der Rechnungsnummer {}.",
                date_de(&document.secondary_date), document.number
            )),
        )
    } else { String::new() };
    let discount_row = match document.document_discount_kind.as_deref() {
        Some("percent") if document.document_discount_value > 0 => format!(
            "[Vereinbarter Dokumentrabatt], [{}],",
            text(&format!("{:.2} %", document.document_discount_value as f64 / 100.0).replace('.', ",")),
        ),
        Some("fixed") if document.document_discount_value > 0 => format!(
            "[Vereinbarter Dokumentrabatt], [{}],",
            text(&money(document.document_discount_value, &document.currency)),
        ),
        _ => String::new(),
    };
    let tax_breakdown = if style.show_tax_summary && document.tax_scheme == "standard" && !document.tax_groups.is_empty() {
        let rows = document.tax_groups.iter().map(|group| {
            format!(
                "[{}], [{}], [{}]",
                text(&format!("Umsatzsteuer {:.2} %", group.tax_rate_bp as f64 / 100.0).replace('.', ",")),
                text(&money(group.net_cents, &document.currency)),
                text(&money(group.tax_cents, &document.currency)),
            )
        }).collect::<Vec<_>>().join(",\n");
        format!(r#"#v(5mm)
#align(right)[
  #block(width: 110mm)[
    #table(columns: (1fr, 32mm, 32mm), align: (left, right, right), inset: (x: 4pt, y: 3pt),
      [#text(weight: "semibold")[Steuersatz]], [#text(weight: "semibold")[Netto]], [#text(weight: "semibold")[Steuer]],
      {}
    )
  ]
]"#, rows)
    } else { String::new() };
    let totals = if style.show_totals {
        format!(r#"#align(right)[
  #block(width: 74mm, fill: rgb("F8FAFC"), radius: 4pt, inset: 9pt)[
    #grid(columns: (1fr, auto), row-gutter: 5pt, align: (left, right),
      {discount_row}
      [Nettosumme], [{net_total}],
      [Umsatzsteuer], [{tax_total}],
      [#line(length: 100%, stroke: rgb("{secondary}"))], [#line(length: 100%, stroke: rgb("{secondary}"))],
      [#text(weight: "bold", size: 11.5pt)[Gesamtbetrag]], [#text(weight: "bold", size: 11.5pt, fill: rgb("{accent}"))[{gross_total}]]
    )
  ]
]"#,
            discount_row = discount_row,
            net_total = text(&money(document.net_total_cents, &document.currency)),
            tax_total = text(&money(document.tax_total_cents, &document.currency)),
            secondary = style.secondary_color,
            accent = style.accent_color,
            gross_total = text(&money(document.gross_total_cents, &document.currency)),
        )
    } else { String::new() };

    let logo = logo_asset
        .map(|asset| format!("#align(right)[#image({}, width: {}mm)]", serde_json::to_string(asset).unwrap_or_else(|_| "\"company-logo.png\"".into()), style.logo_width_mm))
        .unwrap_or_default();
    let accent_bar = if style.variant == "classic" {
        format!("#line(length: 100%, stroke: 0.8pt + rgb(\"{}\"))", style.accent_color)
    } else {
        format!("#block(width: 100%, height: {}mm, fill: rgb(\"{}\"))[]", if style.variant == "compact" { 2 } else { 3 }, style.accent_color)
    };
    let title_size = if style.variant == "compact" { 19 } else { 23 };
    let watermark = match (style.watermark.as_str(), document.status.as_str()) {
        ("draft", "draft") => "#place(center + horizon, rotate(-30deg, text(size: 55pt, fill: rgb(\"E2E8F0\"), weight: \"bold\")[ENTWURF]))",
        ("paid", "paid") => "#place(center + horizon, rotate(-30deg, text(size: 55pt, fill: rgb(\"DCFCE7\"), weight: \"bold\")[BEZAHLT]))",
        _ => "",
    };

    let number_label = match (document.document_type.as_str(), document.title.as_str()) {
        ("invoice", "Stornorechnung") => "Stornonummer",
        ("invoice", _) => "Rechnungsnummer",
        ("quote", _) => "Angebotsnummer",
        ("credit_note", _) => "Gutschriftnummer",
        _ => "Belegnummer",
    };
    let mut info_rows: Vec<(String, String)> = vec![
        (number_label.into(), document.number.clone()),
        (if document.document_type == "invoice" { "Rechnungsdatum".into() } else { "Belegdatum".into() }, date_de(&document.issue_date)),
    ];
    if let Some(service_date) = document.service_date.as_deref().filter(|value| !value.trim().is_empty()) {
        info_rows.push(("Leistungsdatum".into(), date_de(service_date)));
    }
    if let Some(customer_number) = document.customer_number.as_deref().filter(|value| !value.trim().is_empty()) {
        info_rows.push(("Kundennummer".into(), customer_number.to_string()));
    }
    let secondary_value = if document.secondary_label == "Bezug" {
        document.secondary_date.clone()
    } else {
        date_de(&document.secondary_date)
    };
    info_rows.push((document.secondary_label.clone(), secondary_value));
    let info_cells = info_rows.into_iter()
        .flat_map(|(label, value)| [
            format!("[#text(fill: rgb(\"{}\"))[{}]]", style.secondary_color, text(&label)),
            format!("[#align(right)[#text(weight: \"semibold\")[{}]]]", text(&value)),
        ])
        .collect::<Vec<_>>()
        .join(",\n");

    format!(r#"
#set page(paper: "a4", margin: (top: {mt}mm, bottom: {mb}mm, left: {ml}mm, right: {mr}mm), footer: context [
  #line(length: 100%, stroke: 0.45pt + rgb("{secondary}"))
  #v(4pt)
  #grid(columns: (1fr, auto), align: (left, right),
    [#text(size: 7pt, fill: rgb("{secondary}"))[{footer_text}]],
    [#text(size: 7pt, fill: rgb("{secondary}"))[Seite #counter(page).display()]]
  )
])
#set text(font: "{font}", size: {base}pt, lang: "de", fill: rgb("{primary}"))
#set par(leading: 0.72em)

{watermark}
{accent_bar}
#v(5mm)
#grid(columns: (1fr, 64mm), gutter: 12mm, align: (left, right),
  [#text(size: 13pt, weight: "semibold")[{company_text}]
   #v(2pt)
   #text(size: 8pt, fill: rgb("{secondary}"))[{company_address_lines}]],
  [{logo}]
)
#v(9mm)
#grid(columns: (1fr, 62mm), gutter: 12mm, align: (left, top),
  [#block(height: 42mm)[
    #text(size: 7pt, fill: rgb("{secondary}"))[{sender_line_text}]
    #v(4pt)
    #text(weight: "semibold")[{customer_text}]
    #linebreak()
    {customer_address}
  ]],
  [#block(fill: rgb("F8FAFC"), radius: 3pt, inset: 8pt)[
    #grid(columns: (1fr, auto), row-gutter: 4pt, align: (left, right),
      {info_cells}
    )
  ]]
)
#v(3mm)
#text(size: {title_size}pt, weight: "bold", fill: rgb("{accent}"))[{title_text}]
#v(2mm)
#text(size: 10pt, weight: "semibold")[{number_text}]
#v(7mm)
{intro}
#table(
  columns: ({columns}),
  align: ({aligns}),
  inset: (x: 4pt, y: 4.5pt),
  stroke: 0.35pt + rgb("D1D5DB"),
  {cells}
)
#v(8mm)
{totals}
{tax_breakdown}
#v(8mm)
{outro}
{payment}
"#,
        mt = style.margin_top_mm,
        mb = style.margin_bottom_mm,
        ml = style.margin_left_mm,
        mr = style.margin_right_mm,
        secondary = style.secondary_color,
        footer_text = text(footer),
        font = style.font_family,
        base = style.base_font_size_pt,
        primary = style.primary_color,
        watermark = watermark,
        accent_bar = accent_bar,
        company_text = text(company),
        company_address_lines = company_address_lines,
        logo = logo,
        sender_line_text = text(&format!("{} · {}", company, sender_address)),
        customer_text = text(&document.customer_name),
        customer_address = customer_address,
        info_cells = info_cells,
        title_size = title_size,
        accent = style.accent_color,
        title_text = text(&document.title),
        number_text = text(&document.number),
        intro = intro,
        columns = columns,
        aligns = aligns,
        cells = cells,
        totals = totals,
        tax_breakdown = tax_breakdown,
        outro = outro,
        payment = payment,
    )
}


fn build_fallback_markup(
    document: &PdfDocument,
    company: &str,
    company_address: &[String],
    footer: &str,
) -> String {
    let company_lines = typst_lines(company_address);
    let customer_lines = typst_lines(&document.customer_address);
    let mut item_cells = vec![
        "table.cell(fill: rgb(\"E5E7EB\"))[#text(weight: \"semibold\")[Pos.]]".to_string(),
        "table.cell(fill: rgb(\"E5E7EB\"))[#text(weight: \"semibold\")[Beschreibung]]".to_string(),
        "table.cell(fill: rgb(\"E5E7EB\"))[#text(weight: \"semibold\")[Menge]]".to_string(),
        "table.cell(fill: rgb(\"E5E7EB\"))[#text(weight: \"semibold\")[Gesamt]]".to_string(),
    ];
    let mut position = 0usize;
    for line in &document.lines {
        if line.kind == "heading" {
            item_cells.push(format!(
                "table.cell(colspan: 4, fill: rgb(\"F3F4F6\"))[#text(weight: \"semibold\")[{}]]",
                text(&line.description),
            ));
            continue;
        }
        position += 1;
        item_cells.push(cell(&position.to_string()));
        item_cells.push(cell(&line_value(line, "description", position, &document.currency)));
        item_cells.push(cell(&format!("{} {}", quantity(line.quantity_milli), line.unit).trim().to_string()));
        item_cells.push(cell(&money(line.line_total_cents, &document.currency)));
    }
    let notes = [
        document.intro_text.trim(),
        document.outro_text.trim(),
        document.public_note.trim(),
        document.reason.trim(),
    ]
    .into_iter()
    .filter(|value| !value.is_empty())
    .map(|value| format!("#block[{}]", text(value)))
    .collect::<Vec<_>>()
    .join("\n#v(3pt)\n");
    let service_date = document
        .service_date
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("#text(size: 8pt)[Leistungsdatum: {}]", text(&date_de(value))))
        .unwrap_or_default();
    let payment = if document.document_type == "invoice" {
        format!(
            "#v(5mm)\n#block(stroke: 0.5pt + rgb(\"9CA3AF\"), inset: 7pt)[{}]",
            text(&format!(
                "Bitte überweisen Sie den Gesamtbetrag bis {} unter Angabe der Rechnungsnummer {}.",
                date_de(&document.secondary_date), document.number
            )),
        )
    } else {
        String::new()
    };

    format!(r#"
#set page(paper: "a4", margin: (top: 16mm, right: 20mm, bottom: 20mm, left: 25mm))
#set text(font: "Inter", size: 8.5pt, lang: "de", fill: rgb("111827"))
#set par(leading: 0.75em)

#text(size: 13pt, weight: "semibold")[{company}]
#linebreak()
#text(size: 8pt, fill: rgb("6B7280"))[{company_lines}]
#v(10mm)

#grid(columns: (1fr, 58mm), gutter: 10mm,
  [#text(weight: "semibold")[{customer}]
   #linebreak()
   {customer_lines}],
  [#align(right)[
    #text(weight: "semibold")[{title}]
    #linebreak()
    #text(size: 8pt)[{number}]
    #linebreak()
    #text(size: 8pt)[Belegdatum: {issue_date}]
    #linebreak()
    {service_date}
  ]]
)
#v(8mm)

#table(
  columns: (10mm, 1fr, 25mm, 30mm),
  align: (right, left, right, right),
  inset: (x: 4pt, y: 4pt),
  stroke: 0.35pt + rgb("D1D5DB"),
  {item_cells}
)
#v(7mm)

#align(right)[
  #block(width: 76mm, fill: rgb("F3F4F6"), inset: 8pt)[
    #grid(columns: (1fr, auto), row-gutter: 4pt,
      [Nettosumme], [{net_total}],
      [Umsatzsteuer], [{tax_total}],
      [#text(weight: "bold")[Gesamtbetrag]], [#text(weight: "bold")[{gross_total}]]
    )
  ]
]
#v(7mm)
{notes}
{payment}
#v(8mm)
#line(length: 100%, stroke: 0.4pt + rgb("D1D5DB"))
#v(3pt)
#text(size: 7pt, fill: rgb("6B7280"))[{footer}]
"#,
        company = text(company),
        company_lines = company_lines,
        customer = text(&document.customer_name),
        customer_lines = customer_lines,
        title = text(&document.title),
        number = text(&document.number),
        issue_date = text(&date_de(&document.issue_date)),
        service_date = service_date,
        item_cells = item_cells.join(",\n"),
        net_total = text(&money(document.net_total_cents, &document.currency)),
        tax_total = text(&money(document.tax_total_cents, &document.currency)),
        gross_total = text(&money(document.gross_total_cents, &document.currency)),
        notes = notes,
        payment = payment,
        footer = text(footer),
    )
}

fn valid_logo_asset(path: &std::path::Path, bytes: &[u8]) -> Option<&'static str> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("png") if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) => {
            Some("company-logo.png")
        }
        Some("jpg") | Some("jpeg") if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) => {
            Some("company-logo.jpg")
        }
        _ => None,
    }
}

#[tauri::command]
pub async fn generate_document_pdf(
    document_type: String,
    id: String,
) -> Result<PdfExportResult, ErrorPayloadWrapper> {
    let document = load_document(&document_type, &id).await?;
    if document.lines.is_empty() {
        return Err(AppError::MissingFields("mindestens eine Belegposition".into()).into());
    }
    let (live_company, live_company_address, live_footer, logo_path) = company_block().await?;
    let company = document.company_name.as_deref().unwrap_or(&live_company);
    let company_address = if document.company_address.is_empty() {
        &live_company_address
    } else {
        &document.company_address
    };
    let footer = document.company_footer.as_deref().unwrap_or(&live_footer);
    let style = load_template_style(document.template_id.as_deref()).await?;
    let mut assets: Vec<(String, Vec<u8>)> = Vec::new();
    let mut logo_asset: Option<String> = None;
    if let Some(path) = logo_path.as_deref().filter(|value| !value.trim().is_empty()) {
        if let Ok(bytes) = fs::read(path) {
            if let Some(asset_name) = valid_logo_asset(std::path::Path::new(path), &bytes) {
                logo_asset = Some(asset_name.to_string());
                assets.push((asset_name.to_string(), bytes));
            }
        }
    }
    let markup = build_markup(&document, company, company_address, footer, &style, logo_asset.as_deref());
    let target: PathBuf = db::data_dir()
        .join("documents")
        .join(&document_type)
        .join(format!("{}.pdf", file_name(&document.number)));
    let rendered = match crate::pdf::render_to_file(markup, assets, &target) {
        Ok(rendered) => rendered,
        Err(_) => {
            // Ein defektes altes Logo oder eine unerwartete Renderer-Inkompatibilität
            // darf weder PDF-Erzeugung noch Mailversand blockieren.
            let fallback = build_fallback_markup(&document, company, company_address, footer);
            crate::pdf::render_to_file(fallback, Vec::new(), &target)?
        }
    };
    let path = rendered.path.to_string_lossy().to_string();

    let table = match document_type.as_str() {
        "invoice" => "invoice",
        "quote" => "quote",
        "credit_note" => "credit_note",
        _ => unreachable!(),
    };
    let statement = format!("UPDATE {table} SET pdf_path=?2, pdf_checksum=?3, updated_at=datetime('now') WHERE id=?1");
    sqlx::query(&statement)
        .bind(&id)
        .bind(&path)
        .bind(&rendered.sha256)
        .execute(db::pool())
        .await?;

    Ok(PdfExportResult { path, sha256: rendered.sha256, pages: rendered.pages })
}
