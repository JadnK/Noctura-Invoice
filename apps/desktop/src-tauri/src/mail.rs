//! SMTP-Versand mit persistenter Warteschlange.
//!
//! Der Zaehler wird vor dem Sendeversuch festgeschrieben. Stuerzt das Programm
//! mitten im Versand ab, entsteht dadurch hoechstens ein nicht gesendeter
//! Eintrag — nie eine doppelt versendete Rechnung.

use crate::error::AppError;
use chrono::{Duration, Utc};
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use sqlx::{Row, SqlitePool};

/// Wartezeiten zwischen den Versuchen, in Sekunden. Gleiche Werte wie in
/// `packages/mail/src/queue.ts` — die Oberflaeche zeigt an, was hier passiert.
const BACKOFF_SECONDS: [i64; 5] = [60, 300, 900, 3600, 21_600];
const MAX_ATTEMPTS: i64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureKind {
    Auth, Tls, Dns, Timeout, RejectedRecipient, TooLarge, RateLimited, ServerError, Unknown,
}

impl FailureKind {
    pub fn code(self) -> &'static str {
        match self {
            FailureKind::Auth => "auth",
            FailureKind::Tls => "tls",
            FailureKind::Dns => "dns",
            FailureKind::Timeout => "timeout",
            FailureKind::RejectedRecipient => "rejected_recipient",
            FailureKind::TooLarge => "too_large",
            FailureKind::RateLimited => "rate_limited",
            FailureKind::ServerError => "server_error",
            FailureKind::Unknown => "unknown",
        }
    }

    /// Fehler, bei denen ein erneuter Versuch nichts aendert.
    pub fn is_permanent(self) -> bool {
        matches!(self, FailureKind::Auth | FailureKind::RejectedRecipient | FailureKind::TooLarge)
    }

    pub fn classify(error: &lettre::transport::smtp::Error) -> Self {
        let text = error.to_string().to_lowercase();
        if error.is_transient() { return FailureKind::ServerError; }
        if text.contains("authentication") || text.contains("535") { return FailureKind::Auth; }
        if text.contains("tls") || text.contains("certificate") { return FailureKind::Tls; }
        if text.contains("dns") || text.contains("resolve") { return FailureKind::Dns; }
        if text.contains("timeout") || text.contains("timed out") { return FailureKind::Timeout; }
        if text.contains("552") || text.contains("size") { return FailureKind::TooLarge; }
        if text.contains("550") || text.contains("recipient") { return FailureKind::RejectedRecipient; }
        if text.contains("421") || text.contains("rate") { return FailureKind::RateLimited; }
        FailureKind::Unknown
    }
}

pub struct SmtpSettings {
    pub host: String,
    pub port: u16,
    pub security: String,
    pub username: String,
    /// Wird zum Sendezeitpunkt aus dem Schluesselbund geholt, nie gespeichert.
    pub password: String,
    pub timeout_seconds: u64,
}

fn build_transport(settings: &SmtpSettings) -> Result<AsyncSmtpTransport<Tokio1Executor>, AppError> {
    let tls = TlsParameters::new(settings.host.clone())
        .map_err(|e| AppError::Smtp(FailureKind::Tls.code(), e.to_string()))?;

    let builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&settings.host)
        .port(settings.port)
        .timeout(Some(std::time::Duration::from_secs(settings.timeout_seconds)))
        .credentials(Credentials::new(settings.username.clone(), settings.password.clone()));

    let builder = match settings.security.as_str() {
        "tls" => builder.tls(Tls::Wrapper(tls)),
        "starttls" => builder.tls(Tls::Required(tls)),
        // "none" existiert nur fuer lokale Relays im Firmennetz und wird in der
        // Oberflaeche mit einem deutlichen Hinweis versehen.
        _ => builder,
    };

    Ok(builder.build())
}

/// Verarbeitet faellige Eintraege. Rueckgabe: (versendet, fehlgeschlagen).
pub async fn process_queue(
    pool: &SqlitePool,
    settings: &SmtpSettings,
    sender: &str,
    limit: i64,
) -> Result<(usize, usize), AppError> {
    let now = Utc::now();
    let rows = sqlx::query(
        "SELECT id, to_addr, subject, body_text, attempts
         FROM email_queue_item
         WHERE status = 'queued' AND next_attempt_at <= ?1
         ORDER BY next_attempt_at LIMIT ?2",
    )
    .bind(now.to_rfc3339())
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let transport = build_transport(settings)?;
    let (mut sent, mut failed) = (0usize, 0usize);

    for row in rows {
        let id: String = row.get("id");
        let attempts: i64 = row.get::<i64, _>("attempts") + 1;

        // Zuerst festschreiben, dann senden.
        sqlx::query("UPDATE email_queue_item SET status = 'sending', attempts = ?2 WHERE id = ?1")
            .bind(&id).bind(attempts)
            .execute(pool)
            .await?;

        let message = Message::builder()
            .from(sender.parse().map_err(|_| AppError::Smtp("sender", "Absenderadresse ungültig".into()))?)
            .to(row.get::<String, _>("to_addr").parse()
                .map_err(|_| AppError::Smtp("rejected_recipient", "Empfängeradresse ungültig".into()))?)
            .subject(row.get::<String, _>("subject"))
            .body(row.get::<String, _>("body_text"))
            .map_err(|e| AppError::Smtp("unknown", e.to_string()))?;

        match transport.send(message).await {
            Ok(_) => {
                sqlx::query(
                    "UPDATE email_queue_item SET status = 'sent', sent_at = ?2, last_error_code = NULL WHERE id = ?1",
                )
                .bind(&id).bind(now.to_rfc3339())
                .execute(pool)
                .await?;
                sent += 1;
            }
            Err(error) => {
                let kind = FailureKind::classify(&error);
                let give_up = kind.is_permanent() || attempts >= MAX_ATTEMPTS;
                let next = now + Duration::seconds(
                    BACKOFF_SECONDS[(attempts as usize - 1).min(BACKOFF_SECONDS.len() - 1)],
                );
                sqlx::query(
                    "UPDATE email_queue_item
                     SET status = ?2, next_attempt_at = ?3, last_error_code = ?4, last_error_detail = ?5
                     WHERE id = ?1",
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

/// Verbindungstest fuer den Einrichtungsassistenten.
pub async fn test_connection(settings: &SmtpSettings) -> Result<(), AppError> {
    let transport = build_transport(settings)?;
    transport
        .test_connection()
        .await
        .map_err(|e| AppError::Smtp(FailureKind::classify(&e).code(), e.to_string()))?;
    Ok(())
}
