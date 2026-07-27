//! Persistente Verwaltung von Rabattcodes und Konditionen.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discount {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub kind: String,
    pub value: i64,
    pub scope: String,
    pub min_order_cents: i64,
    pub max_uses: Option<i64>,
    pub used_count: i64,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub combinable: bool,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountInput {
    pub id: Option<String>,
    pub name: String,
    pub code: Option<String>,
    pub description: Option<String>,
    pub kind: String,
    pub value: i64,
    pub scope: String,
    pub min_order_cents: i64,
    pub max_uses: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub combinable: bool,
    pub active: bool,
}

fn clean(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

fn validate(input: &DiscountInput) -> Result<(), AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::MissingFields("Rabattname".into()));
    }
    if !matches!(input.kind.as_str(), "percent" | "fixed") {
        return Err(AppError::MissingFields("gültige Rabattart".into()));
    }
    if !matches!(input.scope.as_str(), "document" | "line" | "customer" | "product" | "quantity") {
        return Err(AppError::MissingFields("gültiger Rabattbereich".into()));
    }
    if input.value < 0 || (input.kind == "percent" && input.value > 10_000) {
        return Err(AppError::MissingFields("gültiger Rabattwert".into()));
    }
    if input.min_order_cents < 0 || input.max_uses.is_some_and(|value| value < 1) {
        return Err(AppError::MissingFields("gültige Rabattgrenzen".into()));
    }
    let valid_from = input.valid_from.as_deref().filter(|value| !value.trim().is_empty())
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map_err(|_| AppError::MissingFields("gültiges Startdatum".into())))
        .transpose()?;
    let valid_to = input.valid_to.as_deref().filter(|value| !value.trim().is_empty())
        .map(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .map_err(|_| AppError::MissingFields("gültiges Enddatum".into())))
        .transpose()?;
    if valid_from.zip(valid_to).is_some_and(|(from, to)| from > to) {
        return Err(AppError::MissingFields("gültiger Gültigkeitszeitraum".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_discounts() -> Result<Vec<Discount>, ErrorPayloadWrapper> {
    let rows = sqlx::query(
        "SELECT id, name, code, description, kind, value, scope, min_order_cents,
                max_uses, used_count, valid_from, valid_to, combinable, active
         FROM discount
         ORDER BY active DESC, name COLLATE NOCASE",
    )
    .fetch_all(db::pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| Discount {
            id: row.get("id"),
            name: row.get("name"),
            code: row.get("code"),
            description: row.get("description"),
            kind: row.get("kind"),
            value: row.get("value"),
            scope: row.get("scope"),
            min_order_cents: row.get("min_order_cents"),
            max_uses: row.get("max_uses"),
            used_count: row.get("used_count"),
            valid_from: row.get("valid_from"),
            valid_to: row.get("valid_to"),
            combinable: row.get::<i64, _>("combinable") != 0,
            active: row.get::<i64, _>("active") != 0,
        })
        .collect())
}

#[tauri::command]
pub async fn save_discount(input: DiscountInput) -> Result<String, ErrorPayloadWrapper> {
    validate(&input)?;
    let id = input.id.unwrap_or_else(|| Uuid::now_v7().to_string());
    let code = clean(input.code).map(|value| value.to_uppercase());
    let description = clean(input.description);
    let valid_from = clean(input.valid_from);
    let valid_to = clean(input.valid_to);

    sqlx::query(
        "INSERT INTO discount
           (id, name, code, description, kind, value, scope, min_order_cents,
            max_uses, used_count, valid_from, valid_to, combinable, active, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,?12,?13,?14)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, code=excluded.code, description=excluded.description,
           kind=excluded.kind, value=excluded.value, scope=excluded.scope,
           min_order_cents=excluded.min_order_cents, max_uses=excluded.max_uses,
           valid_from=excluded.valid_from, valid_to=excluded.valid_to,
           combinable=excluded.combinable, active=excluded.active",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(code)
    .bind(description)
    .bind(input.kind)
    .bind(input.value)
    .bind(input.scope)
    .bind(input.min_order_cents)
    .bind(input.max_uses)
    .bind(valid_from)
    .bind(valid_to)
    .bind(if input.combinable { 1_i64 } else { 0_i64 })
    .bind(if input.active { 1_i64 } else { 0_i64 })
    .bind(Utc::now().to_rfc3339())
    .execute(db::pool())
    .await?;

    Ok(id)
}

#[tauri::command]
pub async fn set_discount_active(id: String, active: bool) -> Result<(), ErrorPayloadWrapper> {
    let affected = sqlx::query("UPDATE discount SET active=?2 WHERE id=?1")
        .bind(id)
        .bind(if active { 1_i64 } else { 0_i64 })
        .execute(db::pool())
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::MissingFields("vorhandener Rabatt".into()).into());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_discount(id: String) -> Result<(), ErrorPayloadWrapper> {
    let used_count: Option<i64> = sqlx::query_scalar("SELECT used_count FROM discount WHERE id=?1")
        .bind(&id)
        .fetch_optional(db::pool())
        .await?;
    let Some(used_count) = used_count else {
        return Err(AppError::MissingFields("vorhandener Rabatt".into()).into());
    };
    if used_count > 0 {
        return Err(AppError::MissingFields(
            "Verwendete Rabatte können nur deaktiviert werden".into(),
        )
        .into());
    }
    sqlx::query("DELETE FROM discount WHERE id=?1")
        .bind(id)
        .execute(db::pool())
        .await?;
    Ok(())
}
