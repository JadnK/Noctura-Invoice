//! SMTP-Versand mit persistenter Warteschlange und PDF-Anhängen.

use crate::error::AppError;
use chrono::{Duration, Utc};
use lettre::message::{header::ContentType, Attachment, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use sqlx::{Row, SqlitePool};
use std::path::Path;

const BACKOFF_SECONDS: [i64; 5] = [60, 300, 900, 3600, 21_600];
const MAX_ATTEMPTS: i64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    Auth,
    Tls,
    Dns,
    Timeout,
    RejectedRecipient,
    TooLarge,
    RateLimited,
    ServerError,
    Unknown,
}

impl FailureKind {
    pub fn code(self) -> &'static str {
        match self {
            Self::Auth => "auth",
            Self::Tls => "tls",
            Self::Dns => "dns",
            Self::Timeout => "timeout",
            Self::RejectedRecipient => "rejected_recipient",
            Self::TooLarge => "too_large",
            Self::RateLimited => "rate_limited",
            Self::ServerError => "server_error",
            Self::Unknown => "unknown",
        }
    }

    pub fn is_permanent(self) -> bool {
        matches!(self, Self::Auth | Self::RejectedRecipient | Self::TooLarge)
    }

    pub fn classify(error: &lettre::transport::smtp::Error) -> Self {
        let text = error.to_string().to_lowercase();
        if error.is_transient() { return Self::ServerError; }
        if text.contains("authentication") || text.contains("535") { return Self::Auth; }
        if text.contains("tls") || text.contains("certificate") { return Self::Tls; }
        if text.contains("dns") || text.contains("resolve") { return Self::Dns; }
        if text.contains("timeout") || text.contains("timed out") { return Self::Timeout; }
        if text.contains("552") || text.contains("size") { return Self::TooLarge; }
        if text.contains("550") || text.contains("recipient") { return Self::RejectedRecipient; }
        if text.contains("421") || text.contains("rate") { return Self::RateLimited; }
        Self::Unknown
    }
}

pub struct SmtpSettings {
    pub host: String,
    pub port: u16,
    pub security: String,
    pub username: String,
    pub password: String,
    pub timeout_seconds: u64,
}

fn build_transport(settings: &SmtpSettings) -> Result<AsyncSmtpTransport<Tokio1Executor>, AppError> {
    let tls = TlsParameters::new(settings.host.clone())
        .map_err(|error| AppError::Smtp(FailureKind::Tls.code(), error.to_string()))?;
    let builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&settings.host)
        .port(settings.port)
        .timeout(Some(std::time::Duration::from_secs(settings.timeout_seconds)))
        .credentials(Credentials::new(settings.username.clone(), settings.password.clone()));
    let builder = match settings.security.as_str() {
        "tls" => builder.tls(Tls::Wrapper(tls)),
        "starttls" => builder.tls(Tls::Required(tls)),
        _ => builder,
    };
    Ok(builder.build())
}

fn recipients(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split([',', ';'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn build_message(row: &sqlx::sqlite::SqliteRow, sender: &str) -> Result<Message, AppError> {
    let sender = sender
        .parse()
        .map_err(|_| AppError::Smtp("sender", "Absenderadresse ungültig".into()))?;
    let to = row
        .get::<String, _>("to_addr")
        .parse()
        .map_err(|_| AppError::Smtp("rejected_recipient", "Empfängeradresse ungültig".into()))?;
    let mut builder = Message::builder()
        .from(sender)
        .to(to)
        .subject(row.get::<String, _>("subject"));

    for address in recipients(row.get::<Option<String>, _>("cc_addr")) {
        builder = builder.cc(address.parse().map_err(|_| {
            AppError::Smtp("rejected_recipient", format!("CC-Adresse ungültig: {address}"))
        })?);
    }
    for address in recipients(row.get::<Option<String>, _>("bcc_addr")) {
        builder = builder.bcc(address.parse().map_err(|_| {
            AppError::Smtp("rejected_recipient", format!("BCC-Adresse ungültig: {address}"))
        })?);
    }

    let body: String = row.get("body_text");
    let attachments: Vec<String> = row
        .get::<Option<String>, _>("attachments_json")
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();

    if attachments.is_empty() {
        return builder
            .body(body)
            .map_err(|error| AppError::Smtp("unknown", error.to_string()));
    }

    let mut multipart = MultiPart::mixed().singlepart(SinglePart::plain(body));
    let pdf_type = ContentType::parse("application/pdf")
        .map_err(|error| AppError::Smtp("attachment", error.to_string()))?;
    for path in attachments {
        let bytes = std::fs::read(&path)
            .map_err(|error| AppError::Smtp("attachment", format!("Anhang nicht lesbar: {error}")))?;
        let name = Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Beleg.pdf")
            .to_string();
        multipart = multipart.singlepart(Attachment::new(name).body(bytes, pdf_type.clone()));
    }
    builder
        .multipart(multipart)
        .map_err(|error| AppError::Smtp("unknown", error.to_string()))
}

async fn mark_local_failure(
    pool: &SqlitePool,
    id: &str,
    attempts: i64,
    error: &AppError,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE email_queue_item
         SET status='failed', attempts=?2, last_error_code='message', last_error_detail=?3
         WHERE id=?1",
    )
    .bind(id)
    .bind(attempts)
    .bind(error.to_string())
    .execute(pool)
    .await?;
    Ok(())
}

/// Verarbeitet fällige Einträge. Rückgabe: (versendet, fehlgeschlagen).
pub async fn process_queue(
    pool: &SqlitePool,
    settings: &SmtpSettings,
    sender: &str,
    limit: i64,
) -> Result<(usize, usize), AppError> {
    let now = Utc::now();
    let rows = sqlx::query(
        "SELECT id, to_addr, cc_addr, bcc_addr, subject, body_text, body_html,
                attachments_json, attempts
         FROM email_queue_item
         WHERE status='queued' AND next_attempt_at <= ?1
         ORDER BY next_attempt_at LIMIT ?2",
    )
    .bind(now.to_rfc3339())
    .bind(limit)
    .fetch_all(pool)
    .await?;
    let transport = build_transport(settings)?;
    let (mut sent, mut failed) = (0_usize, 0_usize);

    for row in rows {
        let id: String = row.get("id");
        let attempts = row.get::<i64, _>("attempts") + 1;
        sqlx::query("UPDATE email_queue_item SET status='sending', attempts=?2 WHERE id=?1")
            .bind(&id)
            .bind(attempts)
            .execute(pool)
            .await?;

        let message = match build_message(&row, sender) {
            Ok(message) => message,
            Err(error) => {
                mark_local_failure(pool, &id, attempts, &error).await?;
                failed += 1;
                continue;
            }
        };

        match transport.send(message).await {
            Ok(_) => {
                sqlx::query(
                    "UPDATE email_queue_item
                     SET status='sent', sent_at=?2, last_error_code=NULL, last_error_detail=NULL
                     WHERE id=?1",
                )
                .bind(&id)
                .bind(now.to_rfc3339())
                .execute(pool)
                .await?;
                sqlx::query(
                    "INSERT INTO email_log (id, queue_item_id, at, recipients, subject, status)
                     SELECT lower(hex(randomblob(16))), id, ?2, to_addr, subject, 'sent'
                     FROM email_queue_item WHERE id=?1",
                )
                .bind(&id)
                .bind(now.to_rfc3339())
                .execute(pool)
                .await?;
                sent += 1;
            }
            Err(error) => {
                let kind = FailureKind::classify(&error);
                let give_up = kind.is_permanent() || attempts >= MAX_ATTEMPTS;
                let next = now
                    + Duration::seconds(
                        BACKOFF_SECONDS[(attempts as usize - 1).min(BACKOFF_SECONDS.len() - 1)],
                    );
                sqlx::query(
                    "UPDATE email_queue_item
                     SET status=?2, next_attempt_at=?3, last_error_code=?4, last_error_detail=?5
                     WHERE id=?1",
                )
                .bind(&id)
                .bind(if give_up { "failed" } else { "queued" })
                .bind(next.to_rfc3339())
                .bind(kind.code())
                .bind(error.to_string())
                .execute(pool)
                .await?;
                failed += 1;
            }
        }
    }
    Ok((sent, failed))
}

pub async fn test_connection(settings: &SmtpSettings) -> Result<(), AppError> {
    build_transport(settings)?
        .test_connection()
        .await
        .map_err(|error| AppError::Smtp(FailureKind::classify(&error).code(), error.to_string()))?;
    Ok(())
}
