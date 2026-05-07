use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub number: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub company: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub vat_id: Option<String>,
    pub tax_status: String,
    pub payment_terms_days: Option<i64>,
    pub discount_bp: i64,
    pub archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    pub kind: String,
    pub company: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub vat_id: Option<String>,
    pub tax_status: String,
    pub payment_terms_days: Option<i64>,
    pub discount_bp: i64,
}

/// Ein Kunde braucht mindestens einen Namen — Firma oder Nachname.
fn validate(input: &CustomerInput) -> Result<(), AppError> {
    let has_name = input.company.as_deref().is_some_and(|v| !v.trim().is_empty())
        || input.last_name.as_deref().is_some_and(|v| !v.trim().is_empty());
    if !has_name {
        return Err(AppError::MissingFields("Firma oder Nachname".into()));
    }
    if !(0..=10_000).contains(&input.discount_bp) {
        return Err(AppError::MissingFields("Rabatt ausserhalb 0 bis 100 Prozent".into()));
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool, query: Option<&str>, include_archived: bool) -> Result<Vec<Customer>, AppError> {
    let pattern = query.map(|q| format!("%{q}%"));
    let rows = sqlx::query_as::<_, Customer>(
        r#"
        SELECT id, number, type, company, first_name, last_name, email, phone,
               vat_id, tax_status, payment_terms_days, discount_bp, archived_at
        FROM customer
        WHERE deleted_at IS NULL
          AND (?1 = 1 OR archived_at IS NULL)
          AND (?2 IS NULL OR company LIKE ?2 OR last_name LIKE ?2 OR email LIKE ?2 OR number LIKE ?2)
        ORDER BY COALESCE(company, last_name) COLLATE NOCASE
        LIMIT 500
        "#,
    )
    .bind(include_archived as i32)
    .bind(pattern)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn create(pool: &SqlitePool, input: CustomerInput) -> Result<Customer, AppError> {
    validate(&input)?;
    let mut tx = pool.begin().await?;
    let number = super::numbering::next_number(&mut tx, "customer", None).await?;
    let id = uuid::Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO customer (id, number, type, company, first_name, last_name, email, phone,
                              vat_id, tax_status, payment_terms_days, discount_bp, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)
        "#,
    )
    .bind(&id).bind(&number).bind(&input.kind).bind(&input.company)
    .bind(&input.first_name).bind(&input.last_name).bind(&input.email).bind(&input.phone)
    .bind(&input.vat_id).bind(&input.tax_status).bind(input.payment_terms_days)
    .bind(input.discount_bp).bind(&now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Customer {
        id, number, kind: input.kind, company: input.company,
        first_name: input.first_name, last_name: input.last_name,
        email: input.email, phone: input.phone, vat_id: input.vat_id,
        tax_status: input.tax_status, payment_terms_days: input.payment_terms_days,
        discount_bp: input.discount_bp, archived_at: None,
    })
}

/// Kunden mit Belegen werden archiviert statt geloescht. Steuerlich relevante
/// Dokumente muessen ihren Empfaenger behalten.
pub async fn archive_or_delete(pool: &SqlitePool, id: &str) -> Result<&'static str, AppError> {
    let documents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice WHERE customer_id = ?1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    let now = chrono::Utc::now().to_rfc3339();
    if documents > 0 {
        sqlx::query("UPDATE customer SET archived_at = ?2, updated_at = ?2 WHERE id = ?1")
            .bind(id).bind(&now).execute(pool).await?;
        Ok("archived")
    } else {
        sqlx::query("UPDATE customer SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1")
            .bind(id).bind(&now).execute(pool).await?;
        Ok("trashed")
    }
}
