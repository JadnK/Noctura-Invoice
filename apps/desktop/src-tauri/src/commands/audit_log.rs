//! Einsicht und Integritaetspruefung des Audit-Logs.
//!
//! Das Schreiben in die Hash-Kette (`crate::audit`) passiert bereits beim
//! Finalisieren/Stornieren von Rechnungen (`repo::invoices::append_audit`).
//! Bisher fehlte die Kehrseite: eine Moeglichkeit, die Kette tatsaechlich zu
//! pruefen. Genau das liefert dieses Modul - relevant fuer GoBD-Nachweise
//! ("die Belege wurden seither nicht veraendert").

use crate::audit::{verify_chain, AuditEntry};
use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub at: String,
    pub action: String,
    pub object_type: String,
    pub object_id: String,
    pub user_id: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditIntegrityResult {
    pub checked: i64,
    pub ok: bool,
    pub broken_at: Option<AuditLogEntry>,
}

#[tauri::command]
pub async fn list_audit_log(limit: i64) -> Result<Vec<AuditLogEntry>, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT at, action, object_type, object_id, user_id, source
         FROM audit_log ORDER BY at DESC, rowid DESC LIMIT ?1",
    )
    .bind(limit.clamp(1, 1000))
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?;

    Ok(rows
        .into_iter()
        .map(|row| AuditLogEntry {
            at: row.get("at"),
            action: row.get("action"),
            object_type: row.get("object_type"),
            object_id: row.get("object_id"),
            user_id: row.get("user_id"),
            source: row.get("source"),
        })
        .collect())
}

/// Prueft die gesamte Kette von Anfang an. Ein nachtraeglich veraenderter
/// Eintrag - gleich welcher Zeile - bricht sie ab dieser Stelle, unabhaengig
/// davon, ob spaeter noch weitere unveraenderte Eintraege folgen.
#[tauri::command]
pub async fn verify_audit_log() -> Result<AuditIntegrityResult, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT at, action, object_type, object_id, old_json, new_json, user_id, device_id, source, entry_hash
         FROM audit_log ORDER BY at ASC, rowid ASC",
    )
    .fetch_all(db::pool())
    .await
    .map_err(AppError::from)?;

    let entries: Vec<(AuditEntry, String)> = rows
        .iter()
        .map(|row| {
            (
                AuditEntry {
                    at: row.get("at"),
                    action: row.get("action"),
                    object_type: row.get("object_type"),
                    object_id: row.get("object_id"),
                    old_json: row.get("old_json"),
                    new_json: row.get("new_json"),
                    user_id: row.get("user_id"),
                    device_id: row.get("device_id"),
                    source: row.get("source"),
                },
                row.get("entry_hash"),
            )
        })
        .collect();

    match verify_chain(&entries) {
        Ok(()) => Ok(AuditIntegrityResult { checked: entries.len() as i64, ok: true, broken_at: None }),
        Err(index) => {
            let broken = entries.get(index).map(|(entry, _)| AuditLogEntry {
                at: entry.at.clone(),
                action: entry.action.clone(),
                object_type: entry.object_type.clone(),
                object_id: entry.object_id.clone(),
                user_id: entry.user_id.clone(),
                source: entry.source.clone(),
            });
            Ok(AuditIntegrityResult { checked: entries.len() as i64, ok: false, broken_at: broken })
        }
    }
}
