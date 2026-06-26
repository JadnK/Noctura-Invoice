//! Sicherung und Wiederherstellung.
//!
//! Die Datenbank wird ueber `VACUUM INTO` kopiert, nicht als Datei: nur so ist
//! der Stand in sich konsistent, auch wenn parallel geschrieben wird. Optional
//! wird alles mit AES-256-GCM verschluesselt, der Schluessel kommt aus Argon2id.
//! Ohne Passwort gibt es keine Wiederherstellung — es existiert keine Hintertür.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use chrono::Utc;
use rand::RngCore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub path: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub encrypted: bool,
    pub created_at: String,
    pub invoices: i64,
    pub customers: i64,
    pub attachments: i64,
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], AppError> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Backup(format!("Schlüsselableitung fehlgeschlagen: {e}")))?;
    Ok(key)
}

fn encrypt(data: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    let mut salt = [0u8; 16];
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce_bytes);

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Backup(e.to_string()))?;
    let sealed = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), data)
        .map_err(|_| AppError::Backup("Verschlüsselung fehlgeschlagen".into()))?;

    // Aufbau: Kennung | Salt | Nonce | Chiffrat
    let mut out = Vec::with_capacity(sealed.len() + 32);
    out.extend_from_slice(b"NOCTBK01");
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&sealed);
    Ok(out)
}

fn decrypt(data: &[u8], password: &str) -> Result<Vec<u8>, AppError> {
    if data.len() < 36 || &data[..8] != b"NOCTBK01" {
        return Err(AppError::Backup("Die Datei ist keine Noctura-Sicherung.".into()));
    }
    let key = derive_key(password, &data[8..24])?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| AppError::Backup(e.to_string()))?;
    cipher
        .decrypt(Nonce::from_slice(&data[24..36]), &data[36..])
        // Ein falsches Passwort und eine beschädigte Datei sind hier nicht
        // unterscheidbar — GCM prüft beides mit demselben Tag.
        .map_err(|_| AppError::Backup("Falsches Passwort oder beschädigte Datei.".into()))
}

async fn counts(pool: &sqlx::SqlitePool) -> Result<(i64, i64, i64), AppError> {
    let invoices = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM invoice").fetch_one(pool).await?;
    let customers = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM customer WHERE deleted_at IS NULL").fetch_one(pool).await?;
    let attachments = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM attachment").fetch_one(pool).await?;
    Ok((invoices, customers, attachments))
}

#[tauri::command]
pub async fn create_backup(
    target_dir: String,
    password: Option<String>,
) -> Result<BackupSummary, ErrorPayloadWrapper> {
    let pool = db::pool();
    let now = Utc::now();
    let stamp = now.format("%Y-%m-%dT%H-%M-%SZ").to_string();
    let target = PathBuf::from(&target_dir).join(format!("noctura-backup-{stamp}.nbk"));
    std::fs::create_dir_all(&target_dir).map_err(AppError::from)?;

    let work = std::env::temp_dir().join(format!("noctura-{stamp}"));
    std::fs::create_dir_all(&work).map_err(AppError::from)?;
    let db_copy = work.join("database.sqlite");

    // VACUUM INTO liefert einen konsistenten Stand ohne Sperren des Betriebs.
    sqlx::query("VACUUM INTO ?1")
        .bind(db_copy.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|e| AppError::Backup(format!("Datenbank konnte nicht kopiert werden: {e}")))?;

    let (invoices, customers, attachments) = counts(pool).await?;
    let manifest = serde_json::json!({
        "format": "noctura-backup",
        "schemaVersion": 2,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "createdAt": now.to_rfc3339(),
        "encrypted": password.is_some(),
        "counts": { "invoices": invoices, "customers": customers, "attachments": attachments },
    });

    let mut buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("manifest.json", options).map_err(|e| AppError::Backup(e.to_string()))?;
        zip.write_all(manifest.to_string().as_bytes()).map_err(AppError::from)?;

        zip.start_file("database.sqlite", options).map_err(|e| AppError::Backup(e.to_string()))?;
        zip.write_all(&std::fs::read(&db_copy).map_err(AppError::from)?).map_err(AppError::from)?;

        // Anhaenge, Branding und Vorlagen wandern unveraendert mit.
        for folder in ["attachments", "branding", "templates"] {
            let source = db::data_dir().join(folder);
            if !source.exists() { continue; }
            for entry in walk(&source)? {
                let name = format!("{folder}/{}", entry.strip_prefix(&source).unwrap_or(&entry).to_string_lossy());
                zip.start_file(name, options).map_err(|e| AppError::Backup(e.to_string()))?;
                zip.write_all(&std::fs::read(&entry).map_err(AppError::from)?).map_err(AppError::from)?;
            }
        }
        zip.finish().map_err(|e| AppError::Backup(e.to_string()))?;
    }

    let payload = match &password {
        Some(secret) if !secret.is_empty() => encrypt(&buffer, secret)?,
        _ => buffer,
    };
    std::fs::write(&target, &payload).map_err(AppError::from)?;
    std::fs::remove_dir_all(&work).ok();

    let sha = format!("{:x}", Sha256::digest(&payload));
    sqlx::query(
        "INSERT INTO backup_record (id, created_at, path, size_bytes, encrypted, sha256, app_version, schema_version)
         VALUES (?1,?2,?3,?4,?5,?6,?7,2)",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(now.to_rfc3339())
    .bind(target.to_string_lossy().to_string())
    .bind(payload.len() as i64)
    .bind(password.is_some() as i32)
    .bind(&sha)
    .bind(env!("CARGO_PKG_VERSION"))
    .execute(pool)
    .await?;

    Ok(BackupSummary {
        path: target.to_string_lossy().to_string(),
        size_bytes: payload.len() as u64,
        sha256: sha,
        encrypted: password.is_some(),
        created_at: now.to_rfc3339(),
        invoices, customers, attachments,
    })
}

fn walk(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).map_err(AppError::from)? {
            let path = entry.map_err(AppError::from)?.path();
            if path.is_dir() { stack.push(path); } else { out.push(path); }
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub created_at: String,
    pub app_version: String,
    pub schema_version: i64,
    pub invoices: i64,
    pub customers: i64,
    pub attachments: i64,
    pub encrypted: bool,
}

/// Vorschau vor der Wiederherstellung. Es wird nichts veraendert.
#[tauri::command]
pub async fn inspect_backup(
    path: String,
    password: Option<String>,
) -> Result<BackupPreview, ErrorPayloadWrapper> {
    let raw = std::fs::read(&path).map_err(AppError::from)?;
    let encrypted = raw.len() > 8 && &raw[..8] == b"NOCTBK01";
    let plain = if encrypted {
        let secret = password.ok_or_else(|| AppError::Backup("Diese Sicherung ist passwortgeschützt.".into()))?;
        decrypt(&raw, &secret)?
    } else {
        raw
    };

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(plain))
        .map_err(|e| AppError::Backup(format!("Archiv nicht lesbar: {e}")))?;
    let mut manifest = String::new();
    {
        use std::io::Read;
        archive
            .by_name("manifest.json")
            .map_err(|_| AppError::Backup("Im Archiv fehlt das Manifest.".into()))?
            .read_to_string(&mut manifest)
            .map_err(AppError::from)?;
    }
    let value: serde_json::Value = serde_json::from_str(&manifest)
        .map_err(|e| AppError::Backup(format!("Manifest unlesbar: {e}")))?;

    let schema_version = value["schemaVersion"].as_i64().unwrap_or(0);
    if schema_version > 2 {
        return Err(AppError::Backup(
            "Die Sicherung stammt aus einer neueren Programmversion und kann nicht eingelesen werden.".into(),
        ).into());
    }

    Ok(BackupPreview {
        created_at: value["createdAt"].as_str().unwrap_or("").to_string(),
        app_version: value["appVersion"].as_str().unwrap_or("").to_string(),
        schema_version,
        invoices: value["counts"]["invoices"].as_i64().unwrap_or(0),
        customers: value["counts"]["customers"].as_i64().unwrap_or(0),
        attachments: value["counts"]["attachments"].as_i64().unwrap_or(0),
        encrypted,
    })
}

/// Wiederherstellung. Legt zuerst eine Sicherheitskopie des aktuellen Stands an.
#[tauri::command]
pub async fn restore_backup(
    path: String,
    password: Option<String>,
) -> Result<String, ErrorPayloadWrapper> {
    inspect_backup(path.clone(), password.clone()).await?;

    let safety = create_backup(
        db::data_dir().join("pre-restore").to_string_lossy().to_string(),
        None,
    )
    .await?;

    let raw = std::fs::read(&path).map_err(AppError::from)?;
    let plain = if raw.len() > 8 && &raw[..8] == b"NOCTBK01" {
        decrypt(&raw, &password.unwrap_or_default())?
    } else {
        raw
    };

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(plain))
        .map_err(|e| AppError::Backup(e.to_string()))?;
    let staging = db::data_dir().join("restore-staging");
    std::fs::create_dir_all(&staging).map_err(AppError::from)?;
    archive.extract(&staging).map_err(|e| AppError::Backup(e.to_string()))?;

    // Der Austausch erfolgt beim naechsten Start: eine laufende Verbindung auf
    // die Datenbank zu ersetzen, waere der sicherste Weg in eine kaputte Datei.
    std::fs::write(db::data_dir().join("RESTORE_PENDING"), &staging.to_string_lossy().to_string())
        .map_err(AppError::from)?;

    Ok(format!(
        "Wiederherstellung vorbereitet. Sicherheitskopie: {}. Die Daten werden beim nächsten Start übernommen.",
        safety.path
    ))
}
