// Kein Konsolenfenster unter Windows im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mail;
mod money;
mod pdf;
mod repo;
mod audit;
mod commands;
mod error;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "noctura=info,sqlx=warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Ableitung des Stronghold-Schluessels. Kein Passwort im Klartext,
            // keine feste Vorgabe im Quelltext.
            blake3::derive_key("noctura.stronghold.v1", password.as_bytes()).to_vec()
        }).build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                commands::db::init(&handle).await.expect("Datenbank konnte nicht geoeffnet werden");
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoice::calculate_preview,
            commands::invoice::finalize_invoice,
            commands::invoice::cancel_invoice,
            commands::license::activate_license,
            commands::license::license_heartbeat,
            commands::license::license_status,
            commands::backup::create_backup,
            commands::backup::inspect_backup,
            commands::backup::restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("Anwendung konnte nicht gestartet werden");
}
