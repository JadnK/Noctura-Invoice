//! Ohne dieses Skript generiert Tauri keinen Build-Kontext, und
//! `tauri::generate_context!()` in main.rs schlaegt mit "OUT_DIR env var is
//! not set" fehl. Jedes Tauri-Projekt braucht dieses Skript.
fn main() {
    tauri_build::build();
}
