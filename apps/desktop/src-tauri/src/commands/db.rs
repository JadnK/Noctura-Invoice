//! Datenbankzugriff. Verbindung, Migrationen, Integritaetspruefung.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;
use tauri::{AppHandle, Manager};

static POOL: tokio::sync::OnceCell<SqlitePool> = tokio::sync::OnceCell::const_new();

pub async fn init(app: &AppHandle) -> Result<(), sqlx::Error> {
    let dir = app.path().app_data_dir().expect("Datenverzeichnis nicht verfuegbar");
    std::fs::create_dir_all(&dir).ok();
    DATA_DIR.set(dir.clone()).ok();
    let path = dir.join("noctura.sqlite");

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Full);

    let pool = SqlitePoolOptions::new().max_connections(4).connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    POOL.set(pool).ok();
    Ok(())
}

pub fn pool() -> &'static SqlitePool {
    POOL.get().expect("Datenbank ist nicht initialisiert")
}

static DATA_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

/// Verzeichnis fuer Datenbank, Anhaenge, Branding und Vorlagen.
pub fn data_dir() -> PathBuf {
    DATA_DIR.get().cloned().unwrap_or_else(std::env::temp_dir)
}
