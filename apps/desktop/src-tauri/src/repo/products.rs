use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub sku: String,
    pub name: String,
    pub kind: String,
    pub net_price_cents: i64,
    pub tax_rate_bp: i64,
    pub unit_id: Option<String>,
    pub default_discount_bp: i64,
    pub archived_at: Option<String>,
}

pub async fn list(pool: &SqlitePool, query: Option<&str>) -> Result<Vec<Product>, AppError> {
    let pattern = query.map(|q| format!("%{q}%"));
    Ok(sqlx::query_as::<_, Product>(
        r#"
        SELECT id, sku, name, kind, net_price_cents, tax_rate_bp, unit_id,
               default_discount_bp, archived_at
        FROM product
        WHERE deleted_at IS NULL AND archived_at IS NULL
          AND (?1 IS NULL OR name LIKE ?1 OR sku LIKE ?1)
        ORDER BY name COLLATE NOCASE
        LIMIT 500
        "#,
    )
    .bind(pattern)
    .fetch_all(pool)
    .await?)
}

/// Meistverkaufte Produkte fuer Dashboard und Schnellauswahl.
pub async fn top_selling(pool: &SqlitePool, limit: i64) -> Result<Vec<(String, i64)>, AppError> {
    Ok(sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT p.name, SUM(i.quantity_milli) AS menge
        FROM invoice_item i
        JOIN product p ON p.id = i.product_id
        JOIN invoice inv ON inv.id = i.invoice_id
        WHERE inv.status NOT IN ('draft','cancelled')
        GROUP BY p.id
        ORDER BY menge DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?)
}
