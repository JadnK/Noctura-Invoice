//! Steuerarbeitsbereich: Betriebsausgaben, EÜR-Arbeitswerte und Exportpaket.
//! Die Ergebnisse sind eine Arbeitshilfe und keine elektronische Steuerübermittlung.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: String,
    pub expense_date: String,
    pub vendor: String,
    pub description: String,
    pub category: String,
    pub receipt_number: Option<String>,
    pub net_cents: i64,
    pub tax_rate_bp: i64,
    pub input_tax_cents: i64,
    pub gross_cents: i64,
    pub deductible_bp: i64,
    pub payment_method: String,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInput {
    pub id: Option<String>,
    pub expense_date: String,
    pub vendor: String,
    pub description: String,
    pub category: String,
    pub receipt_number: Option<String>,
    pub net_cents: i64,
    pub tax_rate_bp: i64,
    pub input_tax_cents: i64,
    pub gross_cents: i64,
    pub deductible_bp: i64,
    pub payment_method: String,
    pub receipt_path: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxRateRow {
    pub tax_rate_bp: i64,
    pub net_cents: i64,
    pub tax_cents: i64,
    pub gross_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxCategoryRow {
    pub category: String,
    pub net_cents: i64,
    pub input_tax_cents: i64,
    pub gross_cents: i64,
    pub deductible_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxMonthRow {
    pub month: String,
    pub receipts_cents: i64,
    pub expenses_cents: i64,
    pub result_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenItemRow {
    pub invoice_id: String,
    pub number: String,
    pub customer_name: String,
    pub issue_date: String,
    pub due_date: String,
    pub open_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaxYearSummary {
    pub year: i32,
    pub taxation_method: String,
    pub tax_scheme: String,
    pub cash_receipts_gross_cents: i64,
    pub cash_receipts_net_cents: i64,
    pub received_vat_cents: i64,
    pub expense_gross_cents: i64,
    pub deductible_expense_net_cents: i64,
    pub deductible_input_tax_cents: i64,
    pub cash_result_cents: i64,
    pub estimated_profit_cents: i64,
    pub vat_payable_cents: i64,
    pub invoiced_net_cents: i64,
    pub invoiced_tax_cents: i64,
    pub credit_note_net_cents: i64,
    pub credit_note_tax_cents: i64,
    pub open_receivables_cents: i64,
    pub output_tax_by_rate: Vec<TaxRateRow>,
    pub expense_categories: Vec<TaxCategoryRow>,
    pub months: Vec<TaxMonthRow>,
    pub open_items: Vec<OpenItemRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxExportResult {
    pub directory: String,
    pub files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct IncomeExportRow {
    paid_on: String,
    invoice_number: String,
    customer_name: String,
    gross_cents: i64,
    net_cents: i64,
    tax_cents: i64,
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.map(|item| item.trim().to_string()).filter(|item| !item.is_empty())
}

fn validate_year(year: i32) -> Result<(String, String), AppError> {
    if !(2000..=2100).contains(&year) {
        return Err(AppError::MissingFields("gültiges Steuerjahr".into()));
    }
    Ok((format!("{year}-01-01"), format!("{year}-12-31")))
}

fn validate_expense(input: &ExpenseInput) -> Result<(), AppError> {
    NaiveDate::parse_from_str(&input.expense_date, "%Y-%m-%d")
        .map_err(|_| AppError::MissingFields("gültiges Ausgabedatum".into()))?;
    if input.vendor.trim().is_empty() || input.description.trim().is_empty() || input.category.trim().is_empty() {
        return Err(AppError::MissingFields("Lieferant, Beschreibung und Kategorie".into()));
    }
    if input.net_cents < 0 || input.input_tax_cents < 0 || input.gross_cents < 0 {
        return Err(AppError::MissingFields("nichtnegative Beträge".into()));
    }
    if input.net_cents + input.input_tax_cents != input.gross_cents || input.gross_cents == 0 {
        return Err(AppError::MissingFields("positiver Bruttobetrag aus Netto plus Vorsteuer".into()));
    }
    if !(0..=10_000).contains(&input.tax_rate_bp) || !(0..=10_000).contains(&input.deductible_bp) {
        return Err(AppError::MissingFields("gültige Steuer- und Abzugswerte".into()));
    }
    let expected_tax = round_ratio(input.net_cents, input.tax_rate_bp, 10_000);
    if (expected_tax - input.input_tax_cents).abs() > 1 {
        return Err(AppError::MissingFields("zur Steuerquote passende Vorsteuer".into()));
    }
    if !matches!(input.payment_method.as_str(), "bank" | "card" | "cash" | "direct_debit" | "other") {
        return Err(AppError::MissingFields("gültige Zahlungsart".into()));
    }
    Ok(())
}

fn round_ratio(value: i64, numerator: i64, denominator: i64) -> i64 {
    if denominator == 0 { return 0; }
    let product = value as i128 * numerator as i128;
    ((product + (denominator as i128 / 2)) / denominator as i128) as i64
}

fn money(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let absolute = cents.abs();
    let major = absolute / 100;
    let minor = absolute % 100;
    let grouped = major.to_string().as_bytes().rchunks(3).rev()
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>().join(".");
    format!("{sign}{grouped},{minor:02} €")
}

fn csv_money(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let absolute = cents.abs();
    format!("{sign}{},{:02}", absolute / 100, absolute % 100)
}
fn csv_field(value: &str) -> String { format!("\"{}\"", value.replace('"', "\"\"")) }
fn csv_percent(bp: i64) -> String { format!("{:.2}", bp as f64 / 100.0).replace('.', ",") }
fn typst_text(value: &str) -> String {
    format!("#text({})", serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into()))
}
fn safe_file_part(value: &str) -> String {
    let cleaned: String = value.chars().map(|ch| {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '_' }
    }).collect();
    let compact = cleaned.split('_').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("_");
    if compact.is_empty() { "Beleg".into() } else { compact.chars().take(70).collect() }
}

fn expense_from_row(row: sqlx::sqlite::SqliteRow) -> Expense {
    Expense {
        id: row.get("id"), expense_date: row.get("expense_date"), vendor: row.get("vendor"),
        description: row.get("description"), category: row.get("category"),
        receipt_number: row.get("receipt_number"), net_cents: row.get("net_cents"),
        tax_rate_bp: row.get("tax_rate_bp"), input_tax_cents: row.get("input_tax_cents"),
        gross_cents: row.get("gross_cents"), deductible_bp: row.get("deductible_bp"),
        payment_method: row.get("payment_method"), receipt_path: row.get("receipt_path"),
        notes: row.get("notes"), updated_at: row.get("updated_at"),
    }
}

#[tauri::command]
pub async fn list_expenses(year: Option<i32>) -> Result<Vec<Expense>, ErrorPayloadWrapper> {
    let rows = if let Some(year) = year {
        let (from, to) = validate_year(year)?;
        sqlx::query("SELECT * FROM expense WHERE deleted_at IS NULL AND expense_date BETWEEN ?1 AND ?2 ORDER BY expense_date DESC, created_at DESC")
            .bind(from).bind(to).fetch_all(db::pool()).await?
    } else {
        sqlx::query("SELECT * FROM expense WHERE deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC")
            .fetch_all(db::pool()).await?
    };
    Ok(rows.into_iter().map(expense_from_row).collect())
}

#[tauri::command]
pub async fn save_expense(mut input: ExpenseInput) -> Result<String, ErrorPayloadWrapper> {
    validate_expense(&input)?;
    let id = input.id.take().unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO expense
          (id, expense_date, vendor, description, category, receipt_number, net_cents, tax_rate_bp,
           input_tax_cents, gross_cents, deductible_bp, payment_method, receipt_path, notes, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)
         ON CONFLICT(id) DO UPDATE SET
          expense_date=excluded.expense_date, vendor=excluded.vendor, description=excluded.description,
          category=excluded.category, receipt_number=excluded.receipt_number, net_cents=excluded.net_cents,
          tax_rate_bp=excluded.tax_rate_bp, input_tax_cents=excluded.input_tax_cents,
          gross_cents=excluded.gross_cents, deductible_bp=excluded.deductible_bp,
          payment_method=excluded.payment_method, receipt_path=excluded.receipt_path,
          notes=excluded.notes, updated_at=excluded.updated_at, deleted_at=NULL",
    )
    .bind(&id).bind(&input.expense_date).bind(input.vendor.trim()).bind(input.description.trim())
    .bind(input.category.trim()).bind(optional_text(input.receipt_number)).bind(input.net_cents)
    .bind(input.tax_rate_bp).bind(input.input_tax_cents).bind(input.gross_cents)
    .bind(input.deductible_bp).bind(input.payment_method.trim()).bind(optional_text(input.receipt_path))
    .bind(optional_text(input.notes)).bind(now).execute(db::pool()).await?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_expense(id: String) -> Result<(), ErrorPayloadWrapper> {
    let result = sqlx::query("UPDATE expense SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?1 AND deleted_at IS NULL")
        .bind(id).execute(db::pool()).await?;
    if result.rows_affected() == 0 { return Err(AppError::MissingFields("vorhandene Ausgabe".into()).into()); }
    Ok(())
}

async fn income_rows(year: i32) -> Result<Vec<IncomeExportRow>, AppError> {
    let (from, to) = validate_year(year)?;
    let rows = sqlx::query(
        "SELECT p.paid_on, p.amount_cents, i.number, i.gross_total_cents, i.net_total_cents, i.tax_total_cents,
                COALESCE(NULLIF(TRIM(c.company),''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) customer_name
         FROM invoice_payment p JOIN invoice i ON i.id=p.invoice_id JOIN customer c ON c.id=i.customer_id
         WHERE p.paid_on BETWEEN ?1 AND ?2 AND i.deleted_at IS NULL
         ORDER BY p.paid_on, i.number",
    ).bind(from).bind(to).fetch_all(db::pool()).await?;
    Ok(rows.into_iter().map(|row| {
        let gross: i64 = row.get("amount_cents");
        let invoice_gross: i64 = row.get("gross_total_cents");
        let invoice_net: i64 = row.get("net_total_cents");
        let net = if invoice_gross == 0 { gross } else { round_ratio(gross, invoice_net, invoice_gross) };
        IncomeExportRow {
            paid_on: row.get("paid_on"), invoice_number: row.get::<Option<String>, _>("number").unwrap_or_else(|| "Ohne Nummer".into()),
            customer_name: row.get("customer_name"), gross_cents: gross, net_cents: net, tax_cents: gross - net,
        }
    }).collect())
}

async fn cash_output_tax(year: i32) -> Result<Vec<TaxRateRow>, AppError> {
    let (from, to) = validate_year(year)?;
    let rows = sqlx::query(
        "SELECT p.id payment_id, p.amount_cents, i.gross_total_cents invoice_gross,
                COALESCE(s.tax_rate_bp,0) tax_rate_bp, COALESCE(s.net_cents, i.net_total_cents) group_net,
                COALESCE(s.tax_cents, i.tax_total_cents) group_tax
         FROM invoice_payment p JOIN invoice i ON i.id=p.invoice_id
         LEFT JOIN invoice_tax_summary s ON s.invoice_id=i.id
         WHERE p.paid_on BETWEEN ?1 AND ?2 AND i.deleted_at IS NULL
         ORDER BY p.id, tax_rate_bp DESC",
    ).bind(from).bind(to).fetch_all(db::pool()).await?;
    let mut payments: HashMap<String, (i64, i64, Vec<(i64, i64, i64)>)> = HashMap::new();
    for row in rows {
        let id: String = row.get("payment_id");
        let entry = payments.entry(id).or_insert((row.get("amount_cents"), row.get("invoice_gross"), Vec::new()));
        entry.2.push((row.get("tax_rate_bp"), row.get("group_net"), row.get("group_tax")));
    }
    let mut result: BTreeMap<i64, (i64, i64)> = BTreeMap::new();
    for (_id, (payment, invoice_gross, groups)) in payments {
        let mut allocated = 0;
        for (index, (rate, group_net, group_tax)) in groups.iter().enumerate() {
            let group_gross = group_net + group_tax;
            let group_payment = if index + 1 == groups.len() { payment - allocated }
                else if invoice_gross == 0 { 0 } else { round_ratio(payment, group_gross, invoice_gross) };
            allocated += group_payment;
            let tax = if group_gross == 0 { 0 } else { round_ratio(group_payment, *group_tax, group_gross) };
            let net = group_payment - tax;
            let entry = result.entry(*rate).or_insert((0, 0));
            entry.0 += net; entry.1 += tax;
        }
    }
    Ok(result.into_iter().rev().map(|(rate, (net, tax))| TaxRateRow { tax_rate_bp: rate, net_cents: net, tax_cents: tax, gross_cents: net + tax }).collect())
}

async fn accrual_output_tax(year: i32) -> Result<Vec<TaxRateRow>, AppError> {
    let (from, to) = validate_year(year)?;
    let rows = sqlx::query(
        "SELECT tax_rate_bp, COALESCE(SUM(net),0) net, COALESCE(SUM(tax),0) tax
         FROM (
           SELECT s.tax_rate_bp, s.net_cents net, s.tax_cents tax
           FROM invoice_tax_summary s JOIN invoice i ON i.id=s.invoice_id
           WHERE i.deleted_at IS NULL AND i.status!='draft' AND i.issue_date BETWEEN ?1 AND ?2
           UNION ALL
           SELECT item.tax_rate_bp, -item.line_net_cents, -item.line_tax_cents
           FROM credit_note_item item JOIN credit_note note ON note.id=item.credit_note_id
           WHERE note.status!='draft' AND note.issue_date BETWEEN ?1 AND ?2
         ) activity GROUP BY tax_rate_bp ORDER BY tax_rate_bp DESC",
    ).bind(from).bind(to).fetch_all(db::pool()).await?;
    Ok(rows.into_iter().map(|row| { let net: i64 = row.get("net"); let tax: i64 = row.get("tax"); TaxRateRow { tax_rate_bp: row.get("tax_rate_bp"), net_cents: net, tax_cents: tax, gross_cents: net + tax } }).collect())
}

async fn build_summary(year: i32) -> Result<TaxYearSummary, AppError> {
    let (from, to) = validate_year(year)?;
    let profile = sqlx::query("SELECT scheme, taxation_method FROM tax_setting LIMIT 1")
        .fetch_optional(db::pool()).await?;
    let tax_scheme = profile.as_ref().map(|row| row.get::<String, _>("scheme")).unwrap_or_else(|| "standard".into());
    let taxation_method = profile.as_ref().map(|row| row.get::<String, _>("taxation_method")).unwrap_or_else(|| "actual".into());

    let income = income_rows(year).await?;
    let cash_receipts_gross_cents: i64 = income.iter().map(|row| row.gross_cents).sum();
    let cash_receipts_net_cents: i64 = income.iter().map(|row| row.net_cents).sum();
    let received_vat_cents = cash_receipts_gross_cents - cash_receipts_net_cents;

    let expenses = sqlx::query("SELECT category, net_cents, input_tax_cents, gross_cents, deductible_bp, expense_date FROM expense WHERE deleted_at IS NULL AND expense_date BETWEEN ?1 AND ?2")
        .bind(&from).bind(&to).fetch_all(db::pool()).await?;
    let mut expense_gross_cents = 0;
    let mut deductible_expense_net_cents = 0;
    let mut deductible_input_tax_cents = 0;
    let mut category_map: BTreeMap<String, (i64, i64, i64, i64)> = BTreeMap::new();
    let mut monthly: BTreeMap<String, (i64, i64)> = (1..=12).map(|month| (format!("{year}-{month:02}"), (0, 0))).collect();
    for row in expenses {
        let net: i64 = row.get("net_cents"); let input_tax: i64 = row.get("input_tax_cents");
        let gross: i64 = row.get("gross_cents"); let deductible_bp: i64 = row.get("deductible_bp");
        let deductible_net = round_ratio(net, deductible_bp, 10_000);
        let deductible_tax = round_ratio(input_tax, deductible_bp, 10_000);
        expense_gross_cents += gross;
        deductible_expense_net_cents += deductible_net;
        deductible_input_tax_cents += deductible_tax;
        let entry = category_map.entry(row.get("category")).or_insert((0, 0, 0, 0));
        entry.0 += net; entry.1 += input_tax; entry.2 += gross; entry.3 += deductible_net + deductible_tax;
        let expense_date: String = row.get("expense_date");
        if let Some(month) = expense_date.get(..7) {
            if let Some(entry) = monthly.get_mut(month) { entry.1 += gross; }
        }
    }
    for row in &income {
        if let Some(month) = row.paid_on.get(..7) {
            if let Some(entry) = monthly.get_mut(month) { entry.0 += row.gross_cents; }
        }
    }

    let output_tax_by_rate = if taxation_method == "accrual" { accrual_output_tax(year).await? } else { cash_output_tax(year).await? };
    let output_vat: i64 = output_tax_by_rate.iter().map(|row| row.tax_cents).sum();

    let invoice_totals = sqlx::query("SELECT COALESCE(SUM(net_total_cents),0) net, COALESCE(SUM(tax_total_cents),0) tax FROM invoice WHERE deleted_at IS NULL AND status!='draft' AND issue_date BETWEEN ?1 AND ?2")
        .bind(&from).bind(&to).fetch_one(db::pool()).await?;
    let credit_totals = sqlx::query("SELECT COALESCE(SUM(net_total_cents),0) net, COALESCE(SUM(tax_total_cents),0) tax FROM credit_note WHERE status!='draft' AND issue_date BETWEEN ?1 AND ?2")
        .bind(&from).bind(&to).fetch_one(db::pool()).await?;

    let open_rows = sqlx::query(
        "SELECT i.id, COALESCE(i.number,'Entwurf') number, i.issue_date, i.due_date,
                COALESCE(NULLIF(TRIM(c.company),''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number) customer_name,
                MAX(i.gross_total_cents
                    - COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payment p WHERE p.invoice_id=i.id AND p.paid_on<=?1),0)
                    - COALESCE((SELECT SUM(n.gross_total_cents) FROM credit_note n WHERE n.origin_invoice_id=i.id AND n.status!='draft' AND n.issue_date<=?1),0), 0) open_cents
         FROM invoice i JOIN customer c ON c.id=i.customer_id
         WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft','cancelled','archived') AND i.issue_date<=?1
         GROUP BY i.id HAVING open_cents>0 ORDER BY i.due_date, i.number",
    ).bind(&to).fetch_all(db::pool()).await?;
    let open_items: Vec<OpenItemRow> = open_rows.into_iter().map(|row| OpenItemRow {
        invoice_id: row.get("id"), number: row.get("number"), customer_name: row.get("customer_name"),
        issue_date: row.get("issue_date"), due_date: row.get("due_date"), open_cents: row.get("open_cents"),
    }).collect();
    let open_receivables_cents = open_items.iter().map(|row| row.open_cents).sum();

    Ok(TaxYearSummary {
        year, taxation_method, tax_scheme,
        cash_receipts_gross_cents, cash_receipts_net_cents, received_vat_cents,
        expense_gross_cents, deductible_expense_net_cents, deductible_input_tax_cents,
        cash_result_cents: cash_receipts_gross_cents - expense_gross_cents,
        estimated_profit_cents: cash_receipts_net_cents - deductible_expense_net_cents,
        vat_payable_cents: output_vat - deductible_input_tax_cents,
        invoiced_net_cents: invoice_totals.get("net"), invoiced_tax_cents: invoice_totals.get("tax"),
        credit_note_net_cents: credit_totals.get("net"), credit_note_tax_cents: credit_totals.get("tax"),
        open_receivables_cents,
        output_tax_by_rate,
        expense_categories: category_map.into_iter().map(|(category, values)| TaxCategoryRow { category, net_cents: values.0, input_tax_cents: values.1, gross_cents: values.2, deductible_cents: values.3 }).collect(),
        months: monthly.into_iter().map(|(month, values)| TaxMonthRow { month, receipts_cents: values.0, expenses_cents: values.1, result_cents: values.0 - values.1 }).collect(),
        open_items,
    })
}

#[tauri::command]
pub async fn tax_year_summary(year: i32) -> Result<TaxYearSummary, ErrorPayloadWrapper> { Ok(build_summary(year).await?) }

fn tax_report_markup(summary: &TaxYearSummary) -> String {
    let rates = if summary.output_tax_by_rate.is_empty() {
        "[Keine steuerpflichtigen Umsätze], [0,00 €], [0,00 €]".to_string()
    } else {
        summary.output_tax_by_rate.iter().map(|row| {
            format!("[{}], [{}], [{}]", format!("{:.2} %", row.tax_rate_bp as f64 / 100.0).replace('.', ","), money(row.net_cents), money(row.tax_cents))
        }).collect::<Vec<_>>().join(",\n")
    };
    let categories = if summary.expense_categories.is_empty() {
        "[Keine Ausgaben erfasst], [0,00 €], [0,00 €]".to_string()
    } else {
        summary.expense_categories.iter().map(|row| {
            format!("[{}], [{}], [{}]", typst_text(&row.category), typst_text(&money(row.gross_cents)), typst_text(&money(row.deductible_cents)))
        }).collect::<Vec<_>>().join(",\n")
    };
    let method = if summary.taxation_method == "accrual" {
        "Soll-Versteuerung nach Belegdatum"
    } else {
        "Ist-Versteuerung nach Zahlungseingang"
    };
    r#"
#set page(paper: "a4", margin: 18mm)
#set text(font: "Inter", size: 9pt, lang: "de")
#set par(leading: .7em)
#rect(width: 100%, height: 4mm, fill: rgb("4f46e5"))
#v(8mm)
#text(size: 22pt, weight: "bold", fill: rgb("182230"))[Steuer-Arbeitspaket __YEAR__]
#text(fill: rgb("64748b"))[Lokale Zusammenstellung aus Noctura Invoice · keine Steuerberatung und keine ELSTER-Übermittlung]
#v(10mm)
#grid(columns: (1fr, 1fr), gutter: 5mm,
  [#box(fill: rgb("f8fafc"), inset: 5mm, radius: 2mm)[*Zahlungseingänge*\ __RECEIPTS__]],
  [#box(fill: rgb("f8fafc"), inset: 5mm, radius: 2mm)[*Erfasste Ausgaben*\ __EXPENSES__]],
  [#box(fill: rgb("f8fafc"), inset: 5mm, radius: 2mm)[*Geschätzter Gewinn*\ __PROFIT__]],
  [#box(fill: rgb("eef2ff"), inset: 5mm, radius: 2mm)[*USt.-Arbeitswert*\ __VAT__]]
)
#v(9mm)
= EÜR-Arbeitswerte
#table(columns: (1fr, 35mm), stroke: (x,y) => (bottom: .3pt + rgb("dbe1e8")),
  [Betriebseinnahmen netto (aus Zahlungen)], [__NET_RECEIPTS__],
  [Vereinnahmte Umsatzsteuer], [__RECEIVED_VAT__],
  [Abziehbare Betriebsausgaben netto], [__DEDUCTIBLE_NET__],
  [Abziehbare Vorsteuer], [__INPUT_VAT__],
  [Offene Forderungen zum Jahresende], [__OPEN__]
)
#v(8mm)
= Umsatzsteuer nach Steuersatz
#table(columns: (25mm, 1fr, 1fr), [*Satz*], [*Netto*], [*Steuer*], __RATES__)
#v(8mm)
= Ausgaben nach Kategorie
#table(columns: (1fr, 35mm, 35mm), [*Kategorie*], [*Brutto*], [*Abziehbar*], __CATEGORIES__)
#v(8mm)
#text(size: 7.5pt, fill: rgb("64748b"))[Berechnungsgrundlage Umsatzsteuer: __METHOD__. Prüfen Sie Sonderfälle wie Privatanteile, Abschreibungen, Reverse Charge, innergemeinschaftliche Leistungen, Bewirtung und Reisekosten mit Ihrer Steuerberatung.]
"#
    .replace("__YEAR__", &summary.year.to_string())
    .replace("__RECEIPTS__", &money(summary.cash_receipts_gross_cents))
    .replace("__EXPENSES__", &money(summary.expense_gross_cents))
    .replace("__RESULT__", &money(summary.cash_result_cents))
    .replace("__PROFIT__", &money(summary.estimated_profit_cents))
    .replace("__VAT__", &money(summary.vat_payable_cents))
    .replace("__NET_RECEIPTS__", &money(summary.cash_receipts_net_cents))
    .replace("__RECEIVED_VAT__", &money(summary.received_vat_cents))
    .replace("__DEDUCTIBLE_NET__", &money(summary.deductible_expense_net_cents))
    .replace("__INPUT_VAT__", &money(summary.deductible_input_tax_cents))
    .replace("__OPEN__", &money(summary.open_receivables_cents))
    .replace("__RATES__", &rates)
    .replace("__CATEGORIES__", &categories)
    .replace("__METHOD__", method)
}

fn write_utf8(path: &Path, content: &str) -> Result<(), AppError> { std::fs::write(path, content.as_bytes()).map_err(AppError::from) }

#[tauri::command]
pub async fn export_tax_package(year: i32, target_dir: String) -> Result<TaxExportResult, ErrorPayloadWrapper> {
    let summary = build_summary(year).await?;
    if target_dir.trim().is_empty() {
        return Err(AppError::MissingFields("Zielordner".into()).into());
    }
    let base = PathBuf::from(target_dir.trim());
    std::fs::create_dir_all(&base).map_err(AppError::from)?;
    let directory = base.join(format!("Noctura-Steuerpaket-{year}"));
    std::fs::create_dir_all(&directory).map_err(AppError::from)?;
    let mut files = Vec::new();
    let mut warnings = Vec::new();

    let income = income_rows(year).await?;
    let income_csv = format!(
        "\u{feff}Zahlungsdatum;Rechnung;Kunde;Brutto;Netto;Umsatzsteuer\r\n{}",
        income.iter().map(|row| format!(
            "{};{};{};{};{};{}", row.paid_on, csv_field(&row.invoice_number),
            csv_field(&row.customer_name), csv_money(row.gross_cents), csv_money(row.net_cents),
            csv_money(row.tax_cents),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let income_path = directory.join(format!("einnahmen-{year}.csv"));
    write_utf8(&income_path, &income_csv)?;
    files.push(income_path.to_string_lossy().to_string());

    let expenses = list_expenses(Some(year)).await?;
    let expense_csv = format!(
        "\u{feff}Datum;Lieferant;Beschreibung;Kategorie;Belegnummer;Netto;Vorsteuer;Brutto;Abziehbar-Prozent;Zahlungsart;Belegpfad;Notiz\r\n{}",
        expenses.iter().map(|row| format!(
            "{};{};{};{};{};{};{};{};{};{};{};{}", row.expense_date,
            csv_field(&row.vendor), csv_field(&row.description), csv_field(&row.category),
            csv_field(row.receipt_number.as_deref().unwrap_or("")), csv_money(row.net_cents),
            csv_money(row.input_tax_cents), csv_money(row.gross_cents), csv_percent(row.deductible_bp),
            csv_field(&row.payment_method), csv_field(row.receipt_path.as_deref().unwrap_or("")),
            csv_field(row.notes.as_deref().unwrap_or("")),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let expense_path = directory.join(format!("ausgaben-{year}.csv"));
    write_utf8(&expense_path, &expense_csv)?;
    files.push(expense_path.to_string_lossy().to_string());

    let eur_rows = [
        ("Betriebseinnahmen brutto nach Zahlungseingang", summary.cash_receipts_gross_cents),
        ("Betriebseinnahmen netto nach Zahlungseingang", summary.cash_receipts_net_cents),
        ("Vereinnahmte Umsatzsteuer", summary.received_vat_cents),
        ("Erfasste Betriebsausgaben brutto", summary.expense_gross_cents),
        ("Abziehbare Betriebsausgaben netto", summary.deductible_expense_net_cents),
        ("Abziehbare Vorsteuer", summary.deductible_input_tax_cents),
        ("Liquiditätsüberschuss brutto", summary.cash_result_cents),
        ("Geschätzter Gewinn vor Einkommensteuer (Nettoeinnahmen minus abziehbare Nettoausgaben)", summary.estimated_profit_cents),
        ("Umsatzsteuer-Arbeitswert", summary.vat_payable_cents),
        ("Offene Forderungen zum 31.12.", summary.open_receivables_cents),
    ];
    let eur_csv = format!(
        "\u{feff}Kennzahl;Betrag\r\n{}",
        eur_rows.iter().map(|(label, value)| format!("{};{}", csv_field(label), csv_money(*value)))
            .collect::<Vec<_>>().join("\r\n"),
    );
    let eur_path = directory.join(format!("euer-arbeitswerte-{year}.csv"));
    write_utf8(&eur_path, &eur_csv)?;
    files.push(eur_path.to_string_lossy().to_string());

    let vat_csv = format!(
        "\u{feff}Steuersatz;Bemessungsgrundlage;Umsatzsteuer;Brutto\r\n{}",
        summary.output_tax_by_rate.iter().map(|row| format!(
            "{};{};{};{}", csv_percent(row.tax_rate_bp), csv_money(row.net_cents),
            csv_money(row.tax_cents), csv_money(row.gross_cents),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let vat_path = directory.join(format!("umsatzsteuer-{year}.csv"));
    write_utf8(&vat_path, &vat_csv)?;
    files.push(vat_path.to_string_lossy().to_string());

    let categories_csv = format!(
        "\u{feff}Kategorie;Netto;Vorsteuer;Brutto;Abziehbarer Betrag\r\n{}",
        summary.expense_categories.iter().map(|row| format!(
            "{};{};{};{};{}", csv_field(&row.category), csv_money(row.net_cents),
            csv_money(row.input_tax_cents), csv_money(row.gross_cents), csv_money(row.deductible_cents),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let categories_path = directory.join(format!("ausgaben-kategorien-{year}.csv"));
    write_utf8(&categories_path, &categories_csv)?;
    files.push(categories_path.to_string_lossy().to_string());

    let months_csv = format!(
        "\u{feff}Monat;Einnahmen;Ausgaben;Ergebnis\r\n{}",
        summary.months.iter().map(|row| format!(
            "{};{};{};{}", row.month, csv_money(row.receipts_cents),
            csv_money(row.expenses_cents), csv_money(row.result_cents),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let months_path = directory.join(format!("monatsuebersicht-{year}.csv"));
    write_utf8(&months_path, &months_csv)?;
    files.push(months_path.to_string_lossy().to_string());

    let open_csv = format!(
        "\u{feff}Rechnung;Kunde;Rechnungsdatum;Fällig;Offen\r\n{}",
        summary.open_items.iter().map(|row| format!(
            "{};{};{};{};{}", csv_field(&row.number), csv_field(&row.customer_name),
            row.issue_date, row.due_date, csv_money(row.open_cents),
        )).collect::<Vec<_>>().join("\r\n"),
    );
    let open_path = directory.join(format!("offene-posten-{year}-12-31.csv"));
    write_utf8(&open_path, &open_csv)?;
    files.push(open_path.to_string_lossy().to_string());

    let receipt_dir = directory.join("belege");
    if receipt_dir.exists() {
        std::fs::remove_dir_all(&receipt_dir).map_err(AppError::from)?;
    }
    for expense in &expenses {
        let Some(raw_path) = expense.receipt_path.as_deref().filter(|value| !value.trim().is_empty()) else {
            warnings.push(format!("Kein Belegpfad: {} – {}", expense.expense_date, expense.description));
            continue;
        };
        let source = PathBuf::from(raw_path);
        if !source.is_file() {
            warnings.push(format!("Beleg nicht gefunden: {} ({})", expense.description, raw_path));
            continue;
        }
        std::fs::create_dir_all(&receipt_dir).map_err(AppError::from)?;
        let stem = source.file_stem().and_then(|value| value.to_str()).unwrap_or("beleg");
        let extension = source.extension().and_then(|value| value.to_str()).map(safe_file_part);
        let prefix = expense.receipt_number.as_deref().filter(|value| !value.trim().is_empty())
            .unwrap_or(&expense.vendor);
        let base_name = format!(
            "{}_{}_{}_{}", expense.expense_date, &expense.id[..8.min(expense.id.len())],
            safe_file_part(prefix), safe_file_part(stem),
        );
        let target = receipt_dir.join(match extension {
            Some(extension) if !extension.is_empty() => format!("{base_name}.{extension}"),
            _ => base_name,
        });
        std::fs::copy(&source, &target).map_err(AppError::from)?;
        files.push(target.to_string_lossy().to_string());
    }

    let pdf_path = directory.join(format!("steuerbericht-{year}.pdf"));
    let rendered = crate::pdf::render_to_file(tax_report_markup(&summary), Vec::new(), &pdf_path)?;
    files.push(rendered.path.to_string_lossy().to_string());

    let warning_text = if warnings.is_empty() {
        "Alle eingetragenen Belegpfade konnten in den Unterordner belege kopiert werden.".to_string()
    } else {
        format!("Fehlende oder nicht gefundene Belege:\r\n- {}", warnings.join("\r\n- "))
    };
    let readme = format!(
        "Noctura Steuerpaket {year}\r\n\r\nEnthalten: Zahlungseingänge, Betriebsausgaben, EÜR-Arbeitswerte, Umsatzsteuer nach Steuersatz, Monatsübersicht, Ausgabenkategorien, offene Posten, Belegkopien und PDF-Übersicht.\r\n\r\nDie Dateien sind eine Arbeitshilfe und keine Steuerberatung oder ELSTER-Übermittlung. Prüfen Sie insbesondere Abschreibungen, Privatanteile, Reisekosten, Bewirtung, Reverse Charge, innergemeinschaftliche und ausländische Sachverhalte. Erstattete Gutschriften müssen als tatsächlicher Geldabfluss zusätzlich geprüft werden.\r\n\r\nSteuerverfahren: {}.\r\nSteuerschema: {}.\r\n\r\n{}\r\n",
        if summary.taxation_method == "accrual" { "Soll-Versteuerung" } else { "Ist-Versteuerung" },
        summary.tax_scheme,
        warning_text,
    );
    let readme_path = directory.join("HINWEISE.txt");
    write_utf8(&readme_path, &readme)?;
    files.push(readme_path.to_string_lossy().to_string());

    Ok(TaxExportResult {
        directory: directory.to_string_lossy().to_string(),
        files,
        warnings,
    })
}
