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


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInput {
    pub sku: String,
    pub name: String,
    pub kind: String,
    pub net_price_cents: i64,
    pub tax_rate_bp: i64,
    pub unit_id: Option<String>,
    pub default_discount_bp: i64,
    pub short_description: Option<String>,
}

/// Ein Produkt braucht Name und Artikelnummer, keinen negativen Preis und
/// keinen Rabatt ausserhalb 0 bis 100 Prozent.
fn validate(input: &ProductInput) -> Result<(), AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::MissingFields("Bezeichnung".into()));
    }
    if input.sku.trim().is_empty() {
        return Err(AppError::MissingFields("Artikelnummer".into()));
    }
    if input.net_price_cents < 0 {
        return Err(AppError::MissingFields("Preis darf nicht negativ sein".into()));
    }
    if !(0..=10_000).contains(&input.default_discount_bp) {
        return Err(AppError::MissingFields("Rabatt ausserhalb 0 bis 100 Prozent".into()));
    }
    Ok(())
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Product>, AppError> {
    Ok(sqlx::query_as::<_, Product>(
        "SELECT id, sku, name, kind, net_price_cents, tax_rate_bp, unit_id,
                default_discount_bp, archived_at
         FROM product WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

pub async fn create(pool: &SqlitePool, input: ProductInput) -> Result<Product, AppError> {
    validate(&input)?;
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM product WHERE sku = ?1 AND deleted_at IS NULL")
        .bind(&input.sku)
        .fetch_one(pool)
        .await?;
    if existing > 0 {
        return Err(AppError::DuplicateNumber(input.sku));
    }

    let id = uuid::Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO product (id, sku, name, kind, net_price_cents, tax_rate_bp, unit_id,
                             default_discount_bp, short_description, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
        "#,
    )
    .bind(&id).bind(&input.sku).bind(&input.name).bind(&input.kind)
    .bind(input.net_price_cents).bind(input.tax_rate_bp).bind(&input.unit_id)
    .bind(input.default_discount_bp).bind(&input.short_description).bind(&now)
    .execute(pool)
    .await?;

    Ok(Product {
        id, sku: input.sku, name: input.name, kind: input.kind,
        net_price_cents: input.net_price_cents, tax_rate_bp: input.tax_rate_bp,
        unit_id: input.unit_id, default_discount_bp: input.default_discount_bp, archived_at: None,
    })
}

pub async fn update(pool: &SqlitePool, id: &str, input: ProductInput) -> Result<Product, AppError> {
    validate(&input)?;
    let duplicate: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM product WHERE sku = ?1 AND id != ?2 AND deleted_at IS NULL")
        .bind(&input.sku).bind(id)
        .fetch_one(pool)
        .await?;
    if duplicate > 0 {
        return Err(AppError::DuplicateNumber(input.sku));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        r#"
        UPDATE product SET sku=?2, name=?3, kind=?4, net_price_cents=?5, tax_rate_bp=?6,
                           unit_id=?7, default_discount_bp=?8, short_description=?9, updated_at=?10
        WHERE id=?1 AND deleted_at IS NULL
        "#,
    )
    .bind(id).bind(&input.sku).bind(&input.name).bind(&input.kind)
    .bind(input.net_price_cents).bind(input.tax_rate_bp).bind(&input.unit_id)
    .bind(input.default_discount_bp).bind(&input.short_description).bind(&now)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::MissingFields("Produkt nicht gefunden".into()));
    }

    Ok(Product {
        id: id.to_string(), sku: input.sku, name: input.name, kind: input.kind,
        net_price_cents: input.net_price_cents, tax_rate_bp: input.tax_rate_bp,
        unit_id: input.unit_id, default_discount_bp: input.default_discount_bp, archived_at: None,
    })
}

/// Produkte, die bereits auf einem Beleg stehen, werden archiviert statt
/// geloescht - der Beleg muss weiterhin zeigen koennen, was verkauft wurde.
pub async fn archive_or_delete(pool: &SqlitePool, id: &str) -> Result<&'static str, AppError> {
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoice_item WHERE product_id = ?1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    let now = chrono::Utc::now().to_rfc3339();
    if used > 0 {
        sqlx::query("UPDATE product SET archived_at = ?2, updated_at = ?2 WHERE id = ?1")
            .bind(id).bind(&now).execute(pool).await?;
        Ok("archived")
    } else {
        sqlx::query("UPDATE product SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1")
            .bind(id).bind(&now).execute(pool).await?;
        Ok("trashed")
    }
}

pub async fn list_units(pool: &SqlitePool) -> Result<Vec<(String, String)>, AppError> {
    Ok(sqlx::query_as::<_, (String, String)>("SELECT id, label FROM unit ORDER BY is_builtin DESC, label")
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
