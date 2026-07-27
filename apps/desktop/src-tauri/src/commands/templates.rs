//! Vorlagenverwaltung: Liste, Laden, Speichern, Standardvorlage.

use crate::commands::db;
use crate::error::ErrorPayloadWrapper;
use crate::repo::templates::{self, TemplateDetail, TemplateSummary};

#[tauri::command]
pub async fn list_templates() -> Result<Vec<TemplateSummary>, ErrorPayloadWrapper> {
    Ok(templates::list(db::pool()).await?)
}

#[tauri::command]
pub async fn get_template(id: String) -> Result<Option<TemplateDetail>, ErrorPayloadWrapper> {
    Ok(templates::get(db::pool(), &id).await?)
}

#[tauri::command]
pub async fn create_template(name: String, layout_json: String) -> Result<TemplateDetail, ErrorPayloadWrapper> {
    Ok(templates::create(db::pool(), &name, &layout_json).await?)
}

#[tauri::command]
pub async fn update_template(id: String, name: String, layout_json: String) -> Result<TemplateDetail, ErrorPayloadWrapper> {
    Ok(templates::update(db::pool(), &id, &name, &layout_json).await?)
}

#[tauri::command]
pub async fn set_default_template(id: String) -> Result<(), ErrorPayloadWrapper> {
    Ok(templates::set_default(db::pool(), &id).await?)
}

#[tauri::command]
pub async fn delete_template(id: String) -> Result<(), ErrorPayloadWrapper> {
    Ok(templates::delete(db::pool(), &id).await?)
}
