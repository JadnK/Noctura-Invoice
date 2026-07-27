//! Firmenkonten: Registrierung, Anmeldung, Mitarbeiterverwaltung.
//!
//! Getrennt von license.rs: dort geht es um das Geraet und seine Lizenz,
//! hier um die Person, die das Geraet gerade bedient. Ein Geraet hat eine
//! Lizenz, aber mehrere Personen koennen sich am selben oder an
//! verschiedenen Geraeten mit ihrem eigenen Firmenkonto anmelden.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

const BASE_URL: &str = "https://rechnungsapp.jadenk.de/api/v1";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompanySession {
    pub user_id: String,
    pub license_id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyUserSummary {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserPayload {
    id: String,
    email: String,
    #[serde(rename = "displayName")]
    display_name: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct LoginResponse {
    token: String,
    user: UserPayload,
}

fn client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(concat!("NocturaInvoice/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::License(e.to_string()))
}

async fn read_server_error(response: reqwest::Response) -> AppError {
    let body: serde_json::Value = response.json().await.unwrap_or_default();
    let code = body["error"]["code"].as_str().unwrap_or("AUTH_UNKNOWN");
    let message = body["error"]["message"].as_str().unwrap_or("Unbekannter Fehler");
    AppError::License(format!("{code}: {message}"))
}

async fn store_session(license_id: &str, email: &str, display_name: &str, role: &str, user_id: &str, token: &str) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO company_session (id, user_id, license_id, email, display_name, role, token, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           user_id = ?1, license_id = ?2, email = ?3, display_name = ?4, role = ?5, token = ?6, updated_at = ?7",
    )
    .bind(user_id).bind(license_id).bind(email).bind(display_name).bind(role).bind(token).bind(&now)
    .execute(db::pool())
    .await?;
    Ok(())
}

/// Erstes Konto einer Lizenz: registriert sich selbst und wird automatisch
/// zum Firmen-Admin. Fuer jedes weitere Konto lehnt der Server das ab -
/// dafuer ist create_company_user gedacht, das ein bereits angemeldeter
/// Admin aufruft.
#[tauri::command]
pub async fn register_company_account(
    license_key: String,
    email: String,
    password: String,
    display_name: String,
) -> Result<CompanySession, ErrorPayloadWrapper> {
    let http = client()?;
    let response = http
        .post(format!("{BASE_URL}/auth/register"))
        .json(&serde_json::json!({
            "licenseKey": license_key.trim(),
            "email": email.trim(),
            "password": password,
            "displayName": display_name.trim(),
        }))
        .send()
        .await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;

    if !response.status().is_success() {
        return Err(read_server_error(response).await.into());
    }

    // Registrierung legt das Konto an, meldet aber nicht automatisch an -
    // gleich danach einloggen, damit die Registrierung sich wie ein
    // einziger Schritt anfuehlt.
    login_company_account(license_key, email, password).await
}

#[tauri::command]
pub async fn login_company_account(
    license_key: String,
    email: String,
    password: String,
) -> Result<CompanySession, ErrorPayloadWrapper> {
    let http = client()?;
    let response = http
        .post(format!("{BASE_URL}/auth/login"))
        .json(&serde_json::json!({
            "licenseKey": license_key.trim(),
            "email": email.trim(),
            "password": password,
        }))
        .send()
        .await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;

    if !response.status().is_success() {
        return Err(read_server_error(response).await.into());
    }

    let body: LoginResponse = response
        .json()
        .await
        .map_err(|_| AppError::License("Antwort des Lizenzservers unlesbar.".into()))?;

    // license_id kommt nicht in der Login-Antwort mit - separat abfragen,
    // damit spaetere Aufrufe (z. B. Mitarbeiterliste) wissen, zu welcher
    // Lizenz das Konto gehoert, ohne bei jedem Aufruf neu nachzufragen.
    let me = http
        .get(format!("{BASE_URL}/auth/me"))
        .bearer_auth(&body.token)
        .send()
        .await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;
    let me_body: serde_json::Value = me.json().await.unwrap_or_default();
    let license_id = me_body["licenseId"].as_str().unwrap_or("").to_string();

    store_session(&license_id, &body.user.email, &body.user.display_name, &body.user.role, &body.user.id, &body.token).await?;

    Ok(CompanySession {
        user_id: body.user.id, license_id, email: body.user.email,
        display_name: body.user.display_name, role: body.user.role,
    })
}

/// Ob gerade jemand angemeldet ist. Prueft dafuer aktiv beim Server nach
/// (GET /auth/me), statt dem lokalen Stand blind zu vertrauen - sonst
/// wuerde eine serverseitig widerrufene Sitzung (z. B. weil ein Admin die
/// Lizenz gerade gesperrt hat) erst auffallen, wenn zufaellig irgendein
/// anderer Aufruf fehlschlaegt. Ist der Server nicht erreichbar, bleibt die
/// lokale Sitzung bestehen - eine fehlende Internetverbindung soll niemanden
/// aussperren, nur eine tatsaechliche serverseitige Ablehnung.
#[tauri::command]
pub async fn company_session_status() -> Option<CompanySession> {
    let row = sqlx::query("SELECT user_id, license_id, email, display_name, role, token FROM company_session WHERE id = 1")
        .fetch_optional(db::pool())
        .await
        .ok()??;

    let token: String = row.get("token");
    let session = CompanySession {
        user_id: row.get("user_id"), license_id: row.get("license_id"),
        email: row.get("email"), display_name: row.get("display_name"), role: row.get("role"),
    };

    let Ok(http) = client() else { return Some(session) };
    match http.get(format!("{BASE_URL}/auth/me")).bearer_auth(&token).send().await {
        Ok(response) if response.status() == reqwest::StatusCode::UNAUTHORIZED => {
            // Server sagt ausdruecklich "abgelehnt" - lokal ebenfalls abmelden.
            let _ = sqlx::query("DELETE FROM company_session WHERE id = 1").execute(db::pool()).await;
            None
        }
        _ => Some(session),
    }
}

#[tauri::command]
pub async fn logout_company_account() -> Result<(), ErrorPayloadWrapper> {
    let token: Option<String> = sqlx::query_scalar("SELECT token FROM company_session WHERE id = 1")
        .fetch_optional(db::pool())
        .await
        .map_err(AppError::from)?;

    if let Some(token) = token {
        let http = client()?;
        // Best-effort: der Server-Logout darf fehlschlagen (z. B. offline),
        // die lokale Abmeldung passiert trotzdem.
        let _ = http.delete(format!("{BASE_URL}/auth/session")).bearer_auth(token).send().await;
    }

    sqlx::query("DELETE FROM company_session WHERE id = 1").execute(db::pool()).await.map_err(AppError::from)?;
    Ok(())
}

async fn current_token() -> Result<String, AppError> {
    sqlx::query_scalar("SELECT token FROM company_session WHERE id = 1")
        .fetch_optional(db::pool())
        .await?
        .ok_or_else(|| AppError::License("Nicht angemeldet.".into()))
}

#[tauri::command]
pub async fn list_company_users() -> Result<Vec<CompanyUserSummary>, ErrorPayloadWrapper> {
    let token = current_token().await?;
    let http = client()?;
    let response = http.get(format!("{BASE_URL}/auth/users")).bearer_auth(token).send().await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;

    if !response.status().is_success() {
        return Err(read_server_error(response).await.into());
    }
    let body: serde_json::Value = response.json().await.unwrap_or_default();
    let users = body["users"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|u| {
            Some(CompanyUserSummary {
                id: u["id"].as_str()?.to_string(),
                email: u["email"].as_str()?.to_string(),
                display_name: u["displayName"].as_str()?.to_string(),
                role: u["role"].as_str()?.to_string(),
                active: u["active"].as_bool().unwrap_or(true),
                created_at: u["createdAt"].as_str()?.to_string(),
                last_login_at: u["lastLoginAt"].as_str().map(|s| s.to_string()),
            })
        })
        .collect();
    Ok(users)
}

/// Nur ein Admin darf das erfolgreich aufrufen - der Server prueft das
/// serverseitig noch einmal, unabhaengig davon, was die Oberflaeche anzeigt.
#[tauri::command]
pub async fn create_company_user(
    email: String,
    password: String,
    display_name: String,
    role: String,
) -> Result<CompanyUserSummary, ErrorPayloadWrapper> {
    let token = current_token().await?;
    let http = client()?;
    let response = http
        .post(format!("{BASE_URL}/auth/users"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "email": email.trim(), "password": password, "displayName": display_name.trim(), "role": role }))
        .send()
        .await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;

    if !response.status().is_success() {
        return Err(read_server_error(response).await.into());
    }
    let body: UserPayload = response.json().await.map_err(|_| AppError::License("Antwort unlesbar.".into()))?;
    Ok(CompanyUserSummary {
        id: body.id, email: body.email, display_name: body.display_name, role: body.role,
        active: true, created_at: Utc::now().to_rfc3339(), last_login_at: None,
    })
}
