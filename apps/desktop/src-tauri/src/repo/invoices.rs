//! Rechnungen: Entwurf speichern, finalisieren, stornieren.
//!
//! Finalisieren ist der heikelste Vorgang der Anwendung. Er laeuft vollstaendig
//! in einer Transaktion und in dieser Reihenfolge:
//!
//!   1. Sperren und pruefen: Ist der Beleg noch Entwurf?
//!   2. Neu rechnen und mit den Werten der Oberflaeche vergleichen.
//!   3. Nummer aus dem Nummernkreis ziehen.
//!   4. Firmen- und Kundendaten als Schnappschuss einfrieren.
//!   5. Steuerübersicht schreiben.
//!   6. Audit-Eintrag an die Hash-Kette haengen.
//!
//! Faellt irgendein Schritt aus, wird nichts geschrieben — insbesondere wird
//! keine Rechnungsnummer verbraucht.

use crate::audit::{entry_hash, AuditEntry, GENESIS_HASH};
use crate::commands::invoice::{calculate, DocumentInput};
use crate::error::AppError;
use chrono::Utc;
use serde::Serialize;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeResult {
    pub invoice_id: String,
    pub number: String,
    pub gross_total_cents: i64,
    pub finalized_at: String,
}

pub struct FinalizeContext<'a> {
    pub invoice_id: &'a str,
    pub input: &'a DocumentInput,
    pub expected_gross_cents: i64,
    pub user_id: &'a str,
    pub device_id: &'a str,
}

pub async fn finalize(pool: &SqlitePool, ctx: FinalizeContext<'_>) -> Result<FinalizeResult, AppError> {
    let result = calculate(ctx.input);
    if result.gross_total_cents != ctx.expected_gross_cents {
        return Err(AppError::CalculationMismatch {
            expected: ctx.expected_gross_cents,
            actual: result.gross_total_cents,
        });
    }

    let mut tx = pool.begin().await?;

    let row = sqlx::query("SELECT status, customer_id FROM invoice WHERE id = ?1")
        .bind(ctx.invoice_id)
        .fetch_one(&mut *tx)
        .await?;
    let status: String = row.get("status");
    let customer_id: String = row.get("customer_id");
    if status != "draft" {
        return Err(AppError::AlreadyFinalized);
    }

    let missing = missing_fields(&mut tx, ctx.invoice_id).await?;
    if !missing.is_empty() {
        return Err(AppError::MissingFields(missing.join(", ")));
    }

    let customer_number: String = sqlx::query_scalar("SELECT number FROM customer WHERE id = ?1")
        .bind(&customer_id)
        .fetch_one(&mut *tx)
        .await?;
    let number = super::numbering::next_number(&mut tx, "invoice", Some(&customer_number)).await?;

    // Der Schnappschuss haelt fest, wie Firma und Kunde zum Zeitpunkt der
    // Finalisierung aussahen. Eine spaetere Adressaenderung darf einen
    // bestehenden Beleg nicht ruecknwirkend veraendern.
    let company_snapshot = snapshot_company(&mut *tx).await?;
    let customer_snapshot = snapshot_customer(&mut *tx, &customer_id).await?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        UPDATE invoice SET
          number = ?2, status = 'finalized', finalized_at = ?3, updated_at = ?3,
          company_snapshot_json = ?4, customer_snapshot_json = ?5,
          net_total_cents = ?6, tax_total_cents = ?7, gross_total_cents = ?8,
          discount_total_cents = ?9
        WHERE id = ?1 AND status = 'draft'
        "#,
    )
    .bind(ctx.invoice_id).bind(&number).bind(&now)
    .bind(&company_snapshot).bind(&customer_snapshot)
    .bind(result.net_total_cents).bind(result.tax_total_cents)
    .bind(result.gross_total_cents).bind(result.document_discount_cents)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM invoice_tax_summary WHERE invoice_id = ?1")
        .bind(ctx.invoice_id)
        .execute(&mut *tx)
        .await?;
    for group in &result.tax_groups {
        sqlx::query(
            "INSERT INTO invoice_tax_summary (id, invoice_id, tax_rate_bp, net_cents, tax_cents)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(uuid::Uuid::now_v7().to_string())
        .bind(ctx.invoice_id)
        .bind(group.tax_rate_bp)
        .bind(group.net_cents)
        .bind(group.tax_cents)
        .execute(&mut *tx)
        .await?;
    }

    append_audit(
        &mut tx,
        AuditEntry {
            at: now.clone(),
            action: "finalize".into(),
            object_type: "invoice".into(),
            object_id: ctx.invoice_id.into(),
            old_json: Some(format!("{{\"status\":\"draft\",\"number\":null}}")),
            new_json: Some(format!(
                "{{\"status\":\"finalized\",\"number\":\"{number}\",\"gross\":{}}}",
                result.gross_total_cents
            )),
            user_id: ctx.user_id.into(),
            device_id: ctx.device_id.into(),
            source: "desktop".into(),
        },
    )
    .await?;

    tx.commit().await?;

    Ok(FinalizeResult {
        invoice_id: ctx.invoice_id.into(),
        number,
        gross_total_cents: result.gross_total_cents,
        finalized_at: now,
    })
}

/// Pflichtfelder, ohne die eine Rechnung keine ist.
async fn missing_fields(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    invoice_id: &str,
) -> Result<Vec<String>, AppError> {
    let mut missing = Vec::new();

    let row = sqlx::query(
        "SELECT issue_date, service_date, due_date, customer_id,
                (SELECT COUNT(*) FROM invoice_item WHERE invoice_id = invoice.id AND kind = 'item') AS items
         FROM invoice WHERE id = ?1",
    )
    .bind(invoice_id)
    .fetch_one(&mut **tx)
    .await?;

    let empty = |value: Option<String>| value.map(|value| value.trim().is_empty()).unwrap_or(true);
    if empty(row.get::<Option<String>, _>("issue_date")) {
        missing.push("Rechnungsdatum".to_string());
    }
    if empty(row.get::<Option<String>, _>("service_date")) {
        missing.push("Leistungsdatum bzw. Leistungszeitraum".to_string());
    }
    if empty(row.get::<Option<String>, _>("due_date")) {
        missing.push("Fälligkeitsdatum".to_string());
    }
    if row.get::<i64, _>("items") == 0 {
        missing.push("mindestens eine Position".to_string());
    }

    let company = sqlx::query(
        "SELECT p.legal_name, p.vat_id, p.tax_number,
                a.street, a.house_no, a.postal_code, a.city
         FROM company_profile p
         LEFT JOIN company_address a ON a.company_id=p.id AND a.kind='main'
         ORDER BY p.created_at LIMIT 1",
    )
    .fetch_optional(&mut **tx)
    .await?;
    match company {
        None => missing.push("Firmenprofil".to_string()),
        Some(company) => {
            if company.get::<String, _>("legal_name").trim().is_empty() {
                missing.push("Unternehmensname".to_string());
            }
            for (column, label) in [
                ("street", "Firmenstraße"),
                ("postal_code", "Firmenpostleitzahl"), ("city", "Firmenort"),
            ] {
                if empty(company.get::<Option<String>, _>(column)) { missing.push(label.to_string()); }
            }
            let vat_id = company.get::<Option<String>, _>("vat_id").unwrap_or_default();
            let tax_number = company.get::<Option<String>, _>("tax_number").unwrap_or_default();
            if vat_id.trim().is_empty() && tax_number.trim().is_empty() {
                missing.push("Steuernummer oder USt-IdNr.".to_string());
            }
        }
    }

    let customer_id: String = row.get("customer_id");
    let customer = sqlx::query(
        "SELECT c.company, c.first_name, c.last_name,
                a.street, a.house_no, a.postal_code, a.city
         FROM customer c
         LEFT JOIN customer_address a ON a.customer_id=c.id AND a.kind='billing'
         WHERE c.id=?1",
    )
    .bind(customer_id)
    .fetch_one(&mut **tx)
    .await?;
    let customer_name = customer.get::<Option<String>, _>("company").unwrap_or_default();
    let person_name = format!(
        "{} {}",
        customer.get::<Option<String>, _>("first_name").unwrap_or_default(),
        customer.get::<Option<String>, _>("last_name").unwrap_or_default(),
    );
    if customer_name.trim().is_empty() && person_name.trim().is_empty() {
        missing.push("Name des Rechnungsempfängers".to_string());
    }
    for (column, label) in [
        ("street", "Empfängerstraße"),
        ("postal_code", "Empfängerpostleitzahl"), ("city", "Empfängerort"),
    ] {
        if empty(customer.get::<Option<String>, _>(column)) { missing.push(label.to_string()); }
    }

    Ok(missing)
}

async fn snapshot_company(executor: &mut sqlx::SqliteConnection) -> Result<String, AppError> {
    let row = sqlx::query(
        "SELECT p.legal_name, p.email, p.phone, p.website, p.vat_id, p.tax_number,
                a.street, a.house_no, a.addition, a.postal_code, a.city, a.country,
                b.iban, b.bic
         FROM company_profile p LEFT JOIN company_address a
           ON a.company_id = p.id AND a.kind = 'main'
         LEFT JOIN bank_account b ON b.company_id = p.id AND b.is_default = 1
         LIMIT 1",
    )
    .fetch_one(&mut *executor)
    .await?;

    Ok(serde_json::json!({
        "legalName": row.get::<String, _>("legal_name"),
        "email": row.get::<Option<String>, _>("email"),
        "phone": row.get::<Option<String>, _>("phone"),
        "website": row.get::<Option<String>, _>("website"),
        "iban": row.get::<Option<String>, _>("iban"),
        "bic": row.get::<Option<String>, _>("bic"),
        "vatId": row.get::<Option<String>, _>("vat_id"),
        "taxNumber": row.get::<Option<String>, _>("tax_number"),
        "street": row.get::<Option<String>, _>("street"),
        "houseNo": row.get::<Option<String>, _>("house_no"),
        "addressRecipient": row.get::<Option<String>, _>("addition"),
        "postalCode": row.get::<Option<String>, _>("postal_code"),
        "city": row.get::<Option<String>, _>("city"),
        "country": row.get::<Option<String>, _>("country"),
    })
    .to_string())
}

async fn snapshot_customer(
    executor: &mut sqlx::SqliteConnection,
    customer_id: &str,
) -> Result<String, AppError> {
    let row = sqlx::query(
        "SELECT c.number, c.company, c.first_name, c.last_name, c.vat_id, c.tax_status,
                a.street, a.house_no, a.postal_code, a.city, a.country
         FROM customer c LEFT JOIN customer_address a
           ON a.customer_id = c.id AND a.kind = 'billing'
         WHERE c.id = ?1",
    )
    .bind(customer_id)
    .fetch_one(&mut *executor)
    .await?;

    Ok(serde_json::json!({
        "number": row.get::<String, _>("number"),
        "company": row.get::<Option<String>, _>("company"),
        "firstName": row.get::<Option<String>, _>("first_name"),
        "lastName": row.get::<Option<String>, _>("last_name"),
        "vatId": row.get::<Option<String>, _>("vat_id"),
        "taxStatus": row.get::<String, _>("tax_status"),
        "street": row.get::<Option<String>, _>("street"),
        "houseNo": row.get::<Option<String>, _>("house_no"),
        "postalCode": row.get::<Option<String>, _>("postal_code"),
        "city": row.get::<Option<String>, _>("city"),
        "country": row.get::<Option<String>, _>("country"),
    })
    .to_string())
}

/// Haengt einen Eintrag an die Audit-Kette. Der Hash des Vorgaengers wird in
/// derselben Transaktion gelesen, damit keine Luecke entsteht.
pub async fn append_audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    entry: AuditEntry,
) -> Result<String, AppError> {
    let prev: Option<String> =
        sqlx::query_scalar("SELECT entry_hash FROM audit_log ORDER BY at DESC, rowid DESC LIMIT 1")
            .fetch_optional(&mut **tx)
            .await?;
    let prev_hash = prev.unwrap_or_else(|| GENESIS_HASH.to_string());
    let hash = entry_hash(&prev_hash, &entry);

    sqlx::query(
        "INSERT INTO audit_log (id, at, action, object_type, object_id, old_json, new_json,
                                user_id, device_id, source, prev_hash, entry_hash)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(&entry.at).bind(&entry.action).bind(&entry.object_type).bind(&entry.object_id)
    .bind(&entry.old_json).bind(&entry.new_json)
    .bind(&entry.user_id).bind(&entry.device_id).bind(&entry.source)
    .bind(&prev_hash).bind(&hash)
    .execute(&mut **tx)
    .await?;

    Ok(hash)
}

/// Stornierung: der Beleg bleibt bestehen, eine Stornorechnung tritt daneben.
pub async fn cancel(
    pool: &SqlitePool,
    invoice_id: &str,
    reason: &str,
    user_id: &str,
    device_id: &str,
) -> Result<String, AppError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(AppError::MissingFields("Stornogrund".into()));
    }

    let mut tx = pool.begin().await?;
    let status: String = sqlx::query_scalar("SELECT status FROM invoice WHERE id = ?1")
        .bind(invoice_id)
        .fetch_one(&mut *tx)
        .await?;
    match status.as_str() {
        "draft" => {
            return Err(AppError::MissingFields(
                "Entwürfe werden gelöscht, nicht storniert".into(),
            ));
        }
        "cancelled" => {
            return Err(AppError::MissingFields("Rechnung ist bereits storniert".into()));
        }
        "archived" => {
            return Err(AppError::MissingFields(
                "Archivierte Rechnungen können nicht storniert werden".into(),
            ));
        }
        _ => {}
    }

    let number = super::numbering::next_number(&mut tx, "cancellation", None).await?;
    let id = uuid::Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();
    let issue_date = &now[..10];

    let inserted = sqlx::query(
        "INSERT INTO credit_note
           (id, number, kind, status, origin_invoice_id, customer_id, issue_date, reason,
            currency, tax_scheme, template_id, net_total_cents, tax_total_cents, gross_total_cents,
            company_snapshot_json, customer_snapshot_json, finalized_at, created_at, updated_at)
         SELECT ?1, ?2, 'cancellation', 'finalized', i.id, i.customer_id, ?3, ?4,
                i.currency, i.tax_scheme, i.template_id, i.net_total_cents, i.tax_total_cents,
                i.gross_total_cents, i.company_snapshot_json, i.customer_snapshot_json,
                ?5, ?5, ?5
         FROM invoice i WHERE i.id = ?6",
    )
    .bind(&id)
    .bind(&number)
    .bind(issue_date)
    .bind(reason)
    .bind(&now)
    .bind(invoice_id)
    .execute(&mut *tx)
    .await?;
    if inserted.rows_affected() != 1 {
        return Err(AppError::MissingFields("vorhandene Rechnung".into()));
    }

    sqlx::query(
        "INSERT INTO credit_note_item
           (id, credit_note_id, position, origin_item_id, description, quantity_milli,
            unit_id, unit_price_cents, tax_rate_bp, line_net_cents, line_tax_cents)
         SELECT lower(hex(randomblob(16))), ?1, position, id, description, quantity_milli,
                unit_id, unit_price_cents, tax_rate_bp, line_net_cents, line_tax_cents
         FROM invoice_item
         WHERE invoice_id = ?2 AND kind = 'item' AND hidden = 0
         ORDER BY position",
    )
    .bind(&id)
    .bind(invoice_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE invoice
         SET status = 'cancelled', cancelled_by_id = ?2, updated_at = ?3
         WHERE id = ?1",
    )
    .bind(invoice_id)
    .bind(&id)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    append_audit(
        &mut tx,
        AuditEntry {
            at: now,
            action: "cancel".into(),
            object_type: "invoice".into(),
            object_id: invoice_id.into(),
            old_json: Some(format!("{{\"status\":\"{status}\"}}")),
            new_json: Some(format!(
                "{{\"status\":\"cancelled\",\"cancellation\":\"{number}\"}}"
            )),
            user_id: user_id.into(),
            device_id: device_id.into(),
            source: "desktop".into(),
        },
    )
    .await?;

    tx.commit().await?;
    Ok(number)
}
