//! Globale Suche über produktive Stammdaten und Belege.

use crate::commands::db;
use crate::error::ErrorPayloadWrapper;
use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
}

#[tauri::command]
pub async fn global_search(query: String) -> Result<Vec<SearchResult>, ErrorPayloadWrapper> {
    let query = query.trim();
    if query.len() < 2 {
        return Ok(Vec::new());
    }
    let needle = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let rows = sqlx::query(
        "SELECT id, kind, title, subtitle FROM (
           SELECT i.id id, 'invoice' kind,
                  COALESCE(i.number, 'Rechnungsentwurf') title,
                  COALESCE(NULLIF(TRIM(c.company),''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number)
                    || ' · ' || i.issue_date subtitle,
                  i.updated_at sort_at
           FROM invoice i JOIN customer c ON c.id=i.customer_id
           WHERE i.deleted_at IS NULL AND (
             COALESCE(i.number,'') LIKE ?1 ESCAPE '\\' OR COALESCE(c.company,'') LIKE ?1 ESCAPE '\\'
             OR COALESCE(c.first_name,'') LIKE ?1 ESCAPE '\\' OR COALESCE(c.last_name,'') LIKE ?1 ESCAPE '\\'
             OR COALESCE(i.reference,'') LIKE ?1 ESCAPE '\\'
           )
           UNION ALL
           SELECT q.id, 'quote', COALESCE(q.number, 'Angebotsentwurf'),
                  COALESCE(NULLIF(TRIM(c.company),''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number)
                    || ' · ' || q.issue_date,
                  q.updated_at
           FROM quote q JOIN customer c ON c.id=q.customer_id
           WHERE q.deleted_at IS NULL AND (
             COALESCE(q.number,'') LIKE ?1 ESCAPE '\\' OR COALESCE(c.company,'') LIKE ?1 ESCAPE '\\'
             OR COALESCE(c.first_name,'') LIKE ?1 ESCAPE '\\' OR COALESCE(c.last_name,'') LIKE ?1 ESCAPE '\\'
           )
           UNION ALL
           SELECT c.id, 'customer',
                  COALESCE(NULLIF(TRIM(c.company),''), NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),''), c.number),
                  c.number || COALESCE(' · ' || NULLIF(c.email,''), ''), c.updated_at
           FROM customer c
           WHERE c.deleted_at IS NULL AND (
             c.number LIKE ?1 ESCAPE '\\' OR COALESCE(c.company,'') LIKE ?1 ESCAPE '\\'
             OR COALESCE(c.first_name,'') LIKE ?1 ESCAPE '\\' OR COALESCE(c.last_name,'') LIKE ?1 ESCAPE '\\'
             OR COALESCE(c.email,'') LIKE ?1 ESCAPE '\\'
           )
           UNION ALL
           SELECT p.id, 'product', p.name, p.sku || ' · ' || CASE p.kind WHEN 'service' THEN 'Dienstleistung' ELSE 'Produkt' END,
                  p.updated_at
           FROM product p
           WHERE p.deleted_at IS NULL AND (
             p.sku LIKE ?1 ESCAPE '\\' OR p.name LIKE ?1 ESCAPE '\\'
             OR COALESCE(p.short_description,'') LIKE ?1 ESCAPE '\\'
           )
         ) ORDER BY sort_at DESC LIMIT 50",
    )
    .bind(needle)
    .fetch_all(db::pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchResult {
            id: row.get("id"),
            kind: row.get("kind"),
            title: row.get("title"),
            subtitle: row.get("subtitle"),
        })
        .collect())
}
