//! Kundenverwaltung: Liste, Anlegen, Bearbeiten, Archivieren.

use crate::commands::db;
use crate::error::ErrorPayloadWrapper;
use crate::repo::customers::{self, Customer, CustomerDetail, CustomerInput};

#[tauri::command]
pub async fn list_customers(query: Option<String>, include_archived: bool) -> Result<Vec<Customer>, ErrorPayloadWrapper> {
    Ok(customers::list(db::pool(), query.as_deref(), include_archived).await?)
}

#[tauri::command]
pub async fn get_customer(id: String) -> Result<Option<CustomerDetail>, ErrorPayloadWrapper> {
    Ok(customers::get(db::pool(), &id).await?)
}

#[tauri::command]
pub async fn create_customer(input: CustomerInput) -> Result<Customer, ErrorPayloadWrapper> {
    Ok(customers::create(db::pool(), input).await?)
}

#[tauri::command]
pub async fn update_customer(id: String, input: CustomerInput) -> Result<Customer, ErrorPayloadWrapper> {
    Ok(customers::update(db::pool(), &id, input).await?)
}

#[tauri::command]
pub async fn archive_customer(id: String) -> Result<String, ErrorPayloadWrapper> {
    Ok(customers::archive_or_delete(db::pool(), &id).await?.to_string())
}
