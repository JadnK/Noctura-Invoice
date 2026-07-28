//! Produktverwaltung: Liste, Anlegen, Bearbeiten, Archivieren, Einheiten.

use crate::commands::db;
use crate::error::ErrorPayloadWrapper;
use crate::repo::products::{self, Product, ProductInput};

#[tauri::command]
pub async fn list_products(query: Option<String>) -> Result<Vec<Product>, ErrorPayloadWrapper> {
    Ok(products::list(db::pool(), query.as_deref()).await?)
}

#[tauri::command]
pub async fn get_product(id: String) -> Result<Option<Product>, ErrorPayloadWrapper> {
    Ok(products::get(db::pool(), &id).await?)
}

#[tauri::command]
pub async fn create_product(input: ProductInput) -> Result<Product, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("products.write").await?;
    Ok(products::create(db::pool(), input).await?)
}

#[tauri::command]
pub async fn update_product(id: String, input: ProductInput) -> Result<Product, ErrorPayloadWrapper> {
    crate::commands::license::ensure_allowed("products.write").await?;
    Ok(products::update(db::pool(), &id, input).await?)
}

#[tauri::command]
pub async fn archive_product(id: String) -> Result<String, ErrorPayloadWrapper> {
    Ok(products::archive_or_delete(db::pool(), &id).await?.to_string())
}

#[tauri::command]
pub async fn list_units() -> Result<Vec<(String, String)>, ErrorPayloadWrapper> {
    Ok(products::list_units(db::pool()).await?)
}
