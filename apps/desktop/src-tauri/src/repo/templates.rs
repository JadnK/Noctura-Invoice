//! Vorlagenverwaltung: Liste, Anlegen, Bearbeiten, Standardvorlage setzen.
//!
//! Das Layout selbst (packages/doc-render's TemplateLayout) wird unveraendert
//! als JSON gespeichert - Rust muss seine innere Struktur nicht kennen, nur
//! durchreichen. Jede Version landet zusaetzlich in
//! document_template_version, damit eine fruehere Fassung wiederherstellbar
//! bleibt.

use crate::error::AppError;
use serde::Serialize;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub version: i64,
    pub is_default: bool,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDetail {
    pub id: String,
    pub name: String,
    pub version: i64,
    pub is_default: bool,
    /// Bleibt bewusst als roher JSON-String - Rust muss die innere Struktur
    /// des Layouts nicht kennen, nur unveraendert durchreichen.
    pub layout_json: String,
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<TemplateSummary>, AppError> {
    let rows = sqlx::query(
        "SELECT id, name, version, is_default, updated_at FROM document_template ORDER BY is_default DESC, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| TemplateSummary {
            id: row.get("id"), name: row.get("name"), version: row.get("version"),
            is_default: row.get::<i64, _>("is_default") != 0, updated_at: row.get("updated_at"),
        })
        .collect())
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<TemplateDetail>, AppError> {
    let row = sqlx::query("SELECT id, name, version, is_default, layout_json FROM document_template WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|row| TemplateDetail {
        id: row.get("id"), name: row.get("name"), version: row.get("version"),
        is_default: row.get::<i64, _>("is_default") != 0, layout_json: row.get("layout_json"),
    }))
}

pub async fn create(pool: &SqlitePool, name: &str, layout_json: &str) -> Result<TemplateDetail, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::MissingFields("Name der Vorlage".into()));
    }
    let id = uuid::Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let has_default: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM document_template WHERE is_default = 1")
        .fetch_one(pool)
        .await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO document_template (id, name, version, is_default, layout_json, created_at, updated_at)
         VALUES (?1,?2,1,?3,?4,?5,?5)",
    )
    .bind(&id).bind(name).bind((has_default == 0) as i64).bind(layout_json).bind(&now)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO document_template_version (id, template_id, version, layout_json, created_at)
         VALUES (?1,?2,1,?3,?4)",
    )
    .bind(uuid::Uuid::now_v7().to_string()).bind(&id).bind(layout_json).bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(TemplateDetail { id, name: name.to_string(), version: 1, is_default: has_default == 0, layout_json: layout_json.to_string() })
}

/// Speichert eine neue Version. Die vorherige bleibt in
/// document_template_version erhalten, nicht ueberschrieben.
pub async fn update(pool: &SqlitePool, id: &str, name: &str, layout_json: &str) -> Result<TemplateDetail, AppError> {
    if name.trim().is_empty() {
        return Err(AppError::MissingFields("Name der Vorlage".into()));
    }
    let current_version: i64 = sqlx::query_scalar("SELECT version FROM document_template WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::MissingFields("Vorlage nicht gefunden".into()))?;
    let next_version = current_version + 1;
    let now = chrono::Utc::now().to_rfc3339();

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE document_template SET name=?2, version=?3, layout_json=?4, updated_at=?5 WHERE id=?1")
        .bind(id).bind(name).bind(next_version).bind(layout_json).bind(&now)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO document_template_version (id, template_id, version, layout_json, created_at)
         VALUES (?1,?2,?3,?4,?5)",
    )
    .bind(uuid::Uuid::now_v7().to_string()).bind(id).bind(next_version).bind(layout_json).bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let is_default: i64 = sqlx::query_scalar("SELECT is_default FROM document_template WHERE id = ?1").bind(id).fetch_one(pool).await?;
    Ok(TemplateDetail { id: id.to_string(), name: name.to_string(), version: next_version, is_default: is_default != 0, layout_json: layout_json.to_string() })
}

pub async fn set_default(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE document_template SET is_default = 0 WHERE is_default = 1").execute(&mut *tx).await?;
    let result = sqlx::query("UPDATE document_template SET is_default = 1 WHERE id = ?1").bind(id).execute(&mut *tx).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::MissingFields("Vorlage nicht gefunden".into()));
    }
    tx.commit().await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    let is_default: i64 = sqlx::query_scalar("SELECT is_default FROM document_template WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::MissingFields("Vorlage nicht gefunden".into()))?;
    if is_default != 0 {
        return Err(AppError::MissingFields("Die Standardvorlage kann nicht geloescht werden - zuerst eine andere als Standard setzen.".into()));
    }
    sqlx::query("DELETE FROM document_template WHERE id = ?1").bind(id).execute(pool).await?;
    Ok(())
}
