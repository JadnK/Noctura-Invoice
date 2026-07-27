//! E-Mail-Einstellungen: Speichern, Laden, Passwort lokal verschluesselt.
//!
//! Das Passwort liegt nicht im Klartext in SQLite, aber auch (noch) nicht in
//! einem echten Betriebssystem-Schluesselbund - das waere eine eigene,
//! groessere Stronghold-Anbindung. Als Zwischenloesung: AES-256-GCM mit
//! einem aus der Geraete-ID abgeleiteten Schluessel, denselben Bausteinen,
//! die commands/backup.rs bereits fuer verschluesselte Sicherungen nutzt.

use crate::commands::db;
use crate::commands::license::device_id;
use crate::error::{AppError, ErrorPayloadWrapper};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::Row;

fn derive_key(device: &str) -> [u8; 32] {
    blake3::derive_key("noctura.email.secret.v1", device.as_bytes())
}

fn encrypt(device: &str, plaintext: &str) -> Result<String, AppError> {
    let key = derive_key(device);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| AppError::License(e.to_string()))?;
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let sealed = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .map_err(|_| AppError::License("Verschluesselung fehlgeschlagen.".into()))?;
    let mut out = nonce_bytes.to_vec();
    out.extend_from_slice(&sealed);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

fn decrypt(device: &str, encoded: &str) -> Result<String, AppError> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| AppError::License("Gespeichertes Passwort unlesbar.".into()))?;
    if raw.len() < 12 {
        return Err(AppError::License("Gespeichertes Passwort unlesbar.".into()));
    }
    let key = derive_key(device);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| AppError::License(e.to_string()))?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&raw[..12]), &raw[12..])
        .map_err(|_| AppError::License("Passwort konnte nicht entschluesselt werden.".into()))?;
    String::from_utf8(plain).map_err(|_| AppError::License("Passwort unlesbar.".into()))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailSettings {
    pub provider: String,
    pub host: String,
    pub port: i64,
    pub security: String,
    pub username: String,
    /// Nie befuellt beim Laden - wird beim Speichern nur ueberschrieben,
    /// wenn tatsaechlich ein neuer Wert eingegeben wurde. Sonst muesste
    /// die Oberflaeche das Passwort jedes Mal neu eintippen, nur um die
    /// anderen Felder zu aendern.
    pub password: Option<String>,
    pub sender_name: String,
    pub sender_email: String,
    pub reply_to: Option<String>,
    pub bcc: Option<String>,
    pub has_password: bool,
}

#[tauri::command]
pub async fn get_email_settings() -> Result<Option<EmailSettings>, ErrorPayloadWrapper> {
    let row = sqlx::query(
        "SELECT provider, host, port, security, username, sender_name, sender_email,
                reply_to, bcc, secret_encrypted
         FROM email_account WHERE is_default = 1 LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await
    .map_err(AppError::from)?;

    let Some(row) = row else { return Ok(None) };
    let secret: Option<String> = row.get("secret_encrypted");

    Ok(Some(EmailSettings {
        provider: row.get("provider"), host: row.get("host"), port: row.get("port"),
        security: row.get("security"), username: row.get("username"),
        password: None,
        sender_name: row.get("sender_name"), sender_email: row.get("sender_email"),
        reply_to: row.get("reply_to"), bcc: row.get("bcc"),
        has_password: secret.is_some(),
    }))
}

#[tauri::command]
pub async fn save_email_settings(settings: EmailSettings) -> Result<(), ErrorPayloadWrapper> {
    if settings.host.trim().is_empty() {
        return Err(AppError::MissingFields("Server".into()).into());
    }
    if settings.sender_email.trim().is_empty() {
        return Err(AppError::MissingFields("Absenderadresse".into()).into());
    }

    let existing_secret: Option<String> =
        sqlx::query_scalar("SELECT secret_encrypted FROM email_account WHERE is_default = 1 LIMIT 1")
            .fetch_optional(db::pool())
            .await
            .map_err(AppError::from)?
            .flatten();

    let secret_encrypted = match &settings.password {
        // Ein neues Passwort wurde eingegeben - verschluesselt ablegen.
        Some(password) if !password.is_empty() => {
            let device = device_id().await?;
            Some(encrypt(&device, password)?)
        }
        // Kein neues Passwort eingegeben - das bisherige unveraendert behalten.
        _ => existing_secret,
    };

    let existing_id: Option<String> =
        sqlx::query_scalar("SELECT id FROM email_account WHERE is_default = 1 LIMIT 1")
            .fetch_optional(db::pool())
            .await
            .map_err(AppError::from)?;

    let now = chrono::Utc::now().to_rfc3339();
    if let Some(id) = existing_id {
        sqlx::query(
            "UPDATE email_account SET provider=?2, host=?3, port=?4, security=?5, username=?6,
                                      sender_name=?7, sender_email=?8, reply_to=?9, bcc=?10,
                                      secret_encrypted=?11
             WHERE id=?1",
        )
        .bind(&id).bind(&settings.provider).bind(&settings.host).bind(settings.port)
        .bind(&settings.security).bind(&settings.username).bind(&settings.sender_name)
        .bind(&settings.sender_email).bind(&settings.reply_to).bind(&settings.bcc)
        .bind(&secret_encrypted)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;
    } else {
        sqlx::query(
            "INSERT INTO email_account
               (id, provider, host, port, security, username, secret_ref, sender_name,
                sender_email, reply_to, bcc, is_default, secret_encrypted, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,'lokal-verschluesselt',?7,?8,?9,?10,1,?11,?12)",
        )
        .bind(uuid::Uuid::now_v7().to_string())
        .bind(&settings.provider).bind(&settings.host).bind(settings.port)
        .bind(&settings.security).bind(&settings.username).bind(&settings.sender_name)
        .bind(&settings.sender_email).bind(&settings.reply_to).bind(&settings.bcc)
        .bind(&secret_encrypted).bind(&now)
        .execute(db::pool())
        .await
        .map_err(AppError::from)?;
    }

    Ok(())
}

/// Verbindungstest fuer den "Verbindung testen"-Knopf. Nimmt die aktuell im
/// Formular stehenden Werte, nicht die gespeicherten - so kann getestet
/// werden, bevor ueberhaupt gespeichert wurde. Ohne neu eingegebenes
/// Passwort faellt es auf das zuletzt gespeicherte zurueck.
#[tauri::command]
pub async fn test_email_connection(
    host: String,
    port: u16,
    security: String,
    username: String,
    password: Option<String>,
) -> Result<(), ErrorPayloadWrapper> {
    let resolved_password = match password {
        Some(p) if !p.is_empty() => p,
        _ => resolve_password()
            .await?
            .ok_or_else(|| AppError::MissingFields("Passwort".into()))?,
    };

    crate::mail::test_connection(&crate::mail::SmtpSettings {
        host, port, security, username,
        password: resolved_password,
        timeout_seconds: 15,
    })
    .await?;
    Ok(())
}

/// Fuer den tatsaechlichen Versand: das Passwort im Klartext, nur intern
/// zwischen Rust-Modulen verwendet, nie an die Oberflaeche gereicht.
pub async fn resolve_password() -> Result<Option<String>, AppError> {
    let Some(encrypted): Option<String> =
        sqlx::query_scalar("SELECT secret_encrypted FROM email_account WHERE is_default = 1 LIMIT 1")
            .fetch_optional(db::pool())
            .await?
            .flatten()
    else {
        return Ok(None);
    };
    let device = device_id().await?;
    Ok(Some(decrypt(&device, &encrypted)?))
}
