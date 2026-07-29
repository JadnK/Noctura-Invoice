//! Bedienbare SMTP-Warteschlange für den produktiven Belegversand.

use crate::commands::{db, email_settings};
use crate::error::{AppError, ErrorPayloadWrapper};
use crate::mail::SmtpSettings;
use chrono::Utc;
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEntry {
    pub id: String,
    pub kind: String,
    pub document_type: Option<String>,
    pub document_id: Option<String>,
    pub to_addr: String,
    pub subject: String,
    pub status: String,
    pub attempts: i64,
    pub next_attempt_at: String,
    pub last_error_code: Option<String>,
    pub last_error_detail: Option<String>,
    pub created_at: String,
    pub sent_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResult {
    pub sent: usize,
    pub failed: usize,
}

#[tauri::command]
pub async fn list_outbox() -> Result<Vec<OutboxEntry>, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT id, kind, document_type, document_id, to_addr, subject, status,
                attempts, next_attempt_at, last_error_code, last_error_detail,
                created_at, sent_at
         FROM email_queue_item
         ORDER BY CASE status
                    WHEN 'sending' THEN 0 WHEN 'queued' THEN 1 WHEN 'failed' THEN 2
                    WHEN 'sent' THEN 3 ELSE 4 END,
                  created_at DESC
         LIMIT 500",
    )
    .fetch_all(db::pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| OutboxEntry {
            id: row.get("id"),
            kind: row.get("kind"),
            document_type: row.get("document_type"),
            document_id: row.get("document_id"),
            to_addr: row.get("to_addr"),
            subject: row.get("subject"),
            status: row.get("status"),
            attempts: row.get("attempts"),
            next_attempt_at: row.get("next_attempt_at"),
            last_error_code: row.get("last_error_code"),
            last_error_detail: row.get("last_error_detail"),
            created_at: row.get("created_at"),
            sent_at: row.get("sent_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn retry_outbox_item(id: String) -> Result<(), ErrorPayloadWrapper> {
    let affected = sqlx::query(
        "UPDATE email_queue_item
         SET status='queued', attempts=0, next_attempt_at=?2,
             last_error_code=NULL, last_error_detail=NULL, sent_at=NULL
         WHERE id=?1 AND status IN ('failed','cancelled')",
    )
    .bind(id)
    .bind(Utc::now().to_rfc3339())
    .execute(db::pool())
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::MissingFields("erneut versendbarer Warteschlangeneintrag".into()).into());
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_outbox_item(id: String) -> Result<(), ErrorPayloadWrapper> {
    let affected = sqlx::query(
        "UPDATE email_queue_item SET status='cancelled'
         WHERE id=?1 AND status IN ('queued','failed')",
    )
    .bind(id)
    .execute(db::pool())
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::MissingFields("abbrechbarer Warteschlangeneintrag".into()).into());
    }
    Ok(())
}

async fn smtp_settings() -> Result<(SmtpSettings, String), AppError> {
    let row = sqlx::query(
        "SELECT host, port, security, username, sender_name, sender_email, timeout_seconds
         FROM email_account WHERE is_default=1 LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    .ok_or_else(|| AppError::MissingFields("E-Mail-Einstellungen".into()))?;

    let password = email_settings::resolve_password()
        .await?
        .ok_or_else(|| AppError::MissingFields("SMTP-Passwort".into()))?;
    let sender_name: String = row.get("sender_name");
    let sender_email: String = row.get("sender_email");
    let sender = if sender_name.trim().is_empty() {
        sender_email
    } else {
        format!("{} <{}>", sender_name.trim(), sender_email.trim())
    };

    Ok((
        SmtpSettings {
            host: row.get("host"),
            port: row.get::<i64, _>("port") as u16,
            security: row.get("security"),
            username: row.get("username"),
            password,
            timeout_seconds: row.get::<i64, _>("timeout_seconds").max(1) as u64,
        },
        sender,
    ))
}

#[tauri::command]
pub async fn process_outbox_now() -> Result<ProcessResult, ErrorPayloadWrapper> {
    let (settings, sender) = smtp_settings().await?;
    let (sent, failed) = crate::mail::process_queue(db::pool(), &settings, &sender, 50).await?;

    // Erfolgreich versendete finalisierte Rechnungen als versendet markieren.
    sqlx::query(
        "UPDATE invoice
         SET status='sent', updated_at=?1
         WHERE status='finalized' AND id IN (
           SELECT document_id FROM email_queue_item
           WHERE document_type='invoice' AND status='sent' AND document_id IS NOT NULL
         )",
    )
    .bind(Utc::now().to_rfc3339())
    .execute(db::pool())
    .await?;

    Ok(ProcessResult { sent, failed })
}

fn looks_like_email(value: &str) -> bool {
    let value = value.trim();
    let Some((local, domain)) = value.rsplit_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.contains(' ')
}

/// Verteiler-Adressen aus den E-Mail-Einstellungen (mehrere, durch Komma
/// oder Semikolon getrennt - `mail.rs::recipients` parst das bereits).
/// Bekommen eine BCC-Kopie jeder ausgehenden Rechnungs- und
/// Zahlungsbestaetigungs-Mail.
async fn distribution_bcc() -> Result<Option<String>, AppError> {
    Ok(
        sqlx::query_scalar::<_, Option<String>>("SELECT bcc FROM email_account WHERE is_default=1 LIMIT 1")
            .fetch_optional(db::pool())
            .await?
            .flatten(),
    )
}

#[tauri::command]
pub async fn queue_invoice_email(
    invoice_id: String,
    to: String,
    subject: String,
    body: String,
) -> Result<String, ErrorPayloadWrapper> {
    if !looks_like_email(&to) {
        return Err(AppError::MissingFields("gültige Empfängeradresse".into()).into());
    }
    if subject.trim().is_empty() || body.trim().is_empty() {
        return Err(AppError::MissingFields("Betreff und Nachricht".into()).into());
    }

    let invoice = sqlx::query(
        "SELECT number, status, pdf_path FROM invoice WHERE id=?1 AND deleted_at IS NULL",
    )
    .bind(&invoice_id)
    .fetch_optional(db::pool())
    .await?
    .ok_or_else(|| AppError::MissingFields("vorhandene Rechnung".into()))?;
    let status: String = invoice.get("status");
    if matches!(status.as_str(), "draft" | "cancelled" | "archived") {
        return Err(AppError::MissingFields("finalisierte, aktive Rechnung".into()).into());
    }

    let pdf_path: Option<String> = invoice.get("pdf_path");
    let pdf_path = pdf_path
        .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).is_file())
        .ok_or_else(|| AppError::MissingFields("erzeugtes Rechnungs-PDF".into()))?;
    let attachments = serde_json::to_string(&vec![pdf_path])
        .map_err(|error| AppError::License(error.to_string()))?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::now_v7().to_string();
    let bcc = distribution_bcc().await?;

    sqlx::query(
        "INSERT INTO email_queue_item
           (id, kind, document_type, document_id, to_addr, bcc_addr, subject, body_text,
            attachments_json, status, attempts, next_attempt_at, created_at)
         VALUES (?1,'invoice','invoice',?2,?3,?4,?5,?6,?7,'queued',0,?8,?8)",
    )
    .bind(&id)
    .bind(invoice_id)
    .bind(to.trim())
    .bind(bcc)
    .bind(subject.trim())
    .bind(body.trim())
    .bind(attachments)
    .bind(now)
    .execute(db::pool())
    .await?;

    Ok(id)
}

/// Automatische Zahlungsbestaetigung: genau einmal, sobald eine Rechnung
/// durch `register_invoice_payment` vollstaendig bezahlt ist (siehe Aufruf
/// in commands/documents.rs). Bestmoeglich - ein Fehler hier (keine
/// Kunden-E-Mail hinterlegt, SMTP nicht eingerichtet) darf die bereits
/// abgeschlossene Zahlungsbuchung nicht rueckwirkend scheitern lassen,
/// deshalb wertet der Aufrufer das Ergebnis nur fuer's Log aus.
pub async fn queue_payment_confirmation(invoice_id: &str) -> Result<(), AppError> {
    let Some(row) = sqlx::query(
        "SELECT i.number, c.email AS customer_email
         FROM invoice i JOIN customer c ON c.id = i.customer_id
         WHERE i.id = ?1",
    )
    .bind(invoice_id)
    .fetch_optional(db::pool())
    .await?
    else {
        return Ok(());
    };

    let customer_email: Option<String> = row.get("customer_email");
    let Some(customer_email) = customer_email.filter(|value| looks_like_email(value)) else {
        return Ok(());
    };
    let number: String = row.get("number");
    let bcc = distribution_bcc().await?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO email_queue_item
           (id, kind, document_type, document_id, to_addr, bcc_addr, subject, body_text,
            status, attempts, next_attempt_at, created_at)
         VALUES (?1,'payment_confirmation','invoice',?2,?3,?4,?5,?6,'queued',0,?7,?7)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(invoice_id)
    .bind(customer_email.trim())
    .bind(bcc)
    .bind(format!("Zahlungseingang bestätigt – Rechnung {number}"))
    .bind(format!(
        "Guten Tag,\n\nwir bestätigen den vollständigen Zahlungseingang zu Rechnung {number}. Vielen Dank!\n\nMit freundlichen Grüßen"
    ))
    .bind(&now)
    .execute(db::pool())
    .await?;

    // Bestmoeglicher sofortiger Versand - schlaegt das fehl (z. B. SMTP nicht
    // eingerichtet), bleibt die Mail als 'queued' liegen und wird beim
    // naechsten manuellen oder automatischen Verarbeiten der Warteschlange
    // gesendet, statt verloren zu gehen.
    if let Ok((settings, sender)) = smtp_settings().await {
        let _ = crate::mail::process_queue(db::pool(), &settings, &sender, 5).await;
    }

    Ok(())
}

/// Reiht eine Mahnung/Zahlungserinnerung ein - aufgerufen aus
/// `commands/dunning.rs` fuer jede faellig gewordene Mahnstufe einer
/// Rechnung. Bestmoeglich: ein Fehler hier darf den Mahnlauf nicht insgesamt
/// scheitern lassen, deshalb wertet der Aufrufer das Ergebnis nur fuer's Log
/// aus, statt es weiterzureichen.
pub async fn queue_dunning_email(
    invoice_id: &str,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<(), AppError> {
    if !looks_like_email(to) {
        return Err(AppError::MissingFields("gültige Empfängeradresse".into()));
    }
    let bcc = distribution_bcc().await?;
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO email_queue_item
           (id, kind, document_type, document_id, to_addr, bcc_addr, subject, body_text,
            status, attempts, next_attempt_at, created_at)
         VALUES (?1,'dunning','invoice',?2,?3,?4,?5,?6,'queued',0,?7,?7)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(invoice_id)
    .bind(to.trim())
    .bind(bcc)
    .bind(subject)
    .bind(body)
    .bind(&now)
    .execute(db::pool())
    .await?;

    if let Ok((settings, sender)) = smtp_settings().await {
        let _ = crate::mail::process_queue(db::pool(), &settings, &sender, 5).await;
    }

    Ok(())
}
