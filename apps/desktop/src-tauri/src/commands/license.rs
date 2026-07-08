//! Lizenzcommands: Aktivierung, Heartbeat, Statusabfrage.
//!
//! Der oeffentliche Schluessel ist zur Kompilierzeit eingebettet und zur Laufzeit
//! nicht ersetzbar. Jede Serverantwort wird lokal gegen ihn geprueft, bevor
//! irgendetwas gespeichert wird.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

pub const LICENSE_PUBLIC_KEY_PEM: &str = include_str!("../../keys/license-signing.pub");
const BASE_URL: &str = "https://rechnungsapp.jadenk.de/api/v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub status: String,
    pub plan: Option<String>,
    pub features: Vec<String>,
    pub expires_at: Option<String>,
    pub last_online_at: Option<String>,
    pub grace_days: i64,
    pub check_interval_h: i64,
    pub device_id: String,
}

#[derive(Debug, Deserialize)]
struct ActivateResponse {
    payload: String,
    signature: String,
}

#[derive(Debug, Deserialize)]
struct TokenPayload {
    lic: String,
    dev: String,
    plan: String,
    feat: Vec<String>,
    exp: Option<String>,
    nonce: String,
    #[serde(rename = "graceDays")]
    grace_days: i64,
    #[serde(rename = "checkIntervalH")]
    check_interval_h: i64,
}

fn public_key() -> Result<VerifyingKey, AppError> {
    if LICENSE_PUBLIC_KEY_PEM.contains("PLATZHALTER") {
        return Err(AppError::License(
            "Dieses Programm wurde ohne echten Signaturschlüssel gebaut und kann keine Lizenz prüfen.".into(),
        ));
    }
    let body: String = LICENSE_PUBLIC_KEY_PEM
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();
    let der = base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .map_err(|_| AppError::License("Der eingebettete Schlüssel ist unlesbar.".into()))?;
    // SPKI-Huelle: die letzten 32 Bytes sind der rohe Ed25519-Schluessel.
    let raw: [u8; 32] = der[der.len().saturating_sub(32)..]
        .try_into()
        .map_err(|_| AppError::License("Der eingebettete Schlüssel hat die falsche Länge.".into()))?;
    VerifyingKey::from_bytes(&raw).map_err(|_| AppError::License("Schlüssel ungültig.".into()))
}

fn verify(payload: &str, signature: &str) -> Result<TokenPayload, AppError> {
    let key = public_key()?;
    let raw_signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(signature)
        .map_err(|_| AppError::License("Signatur unlesbar.".into()))?;
    let signature: Signature = raw_signature[..]
        .try_into()
        .map_err(|_| AppError::License("Signatur hat die falsche Länge.".into()))?;

    key.verify(payload.as_bytes(), &signature)
        .map_err(|_| AppError::License("Die Antwort des Lizenzservers ist nicht echt.".into()))?;

    let json = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| AppError::License("Token unlesbar.".into()))?;
    serde_json::from_slice(&json).map_err(|_| AppError::License("Token hat ein unerwartetes Format.".into()))
}

/// Geraetekennung: 32 Zufallsbytes beim ersten Start, danach stabil.
/// Keine Hardwaremerkmale, keine MAC-Adresse, keine Seriennummer.
pub async fn device_id() -> Result<String, AppError> {
    let pool = db::pool();
    if let Some(existing) = sqlx::query_scalar::<_, String>("SELECT device_id FROM license_cache WHERE id = 1")
        .fetch_optional(pool)
        .await?
    {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }

    let mut seed = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut seed);
    let digest = blake3::keyed_hash(&seed, b"de.jadenk.noctura.invoice");
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
    let id: String = digest.as_bytes()[..26]
        .iter()
        .map(|byte| alphabet[(*byte as usize) % alphabet.len()] as char)
        .collect();

    sqlx::query(
        "INSERT INTO license_cache (id, status, device_id, updated_at)
         VALUES (1, 'unlicensed', ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET device_id = ?1, updated_at = ?2",
    )
    .bind(&id)
    .bind(Utc::now().to_rfc3339())
    .execute(pool)
    .await?;

    Ok(id)
}

fn nonce() -> String {
    let mut bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

async fn call(path: &str, body: serde_json::Value) -> Result<ActivateResponse, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(concat!("NocturaInvoice/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::License(e.to_string()))?;

    let response = client
        .post(format!("{BASE_URL}{path}"))
        .json(&body)
        .send()
        .await
        .map_err(|_| AppError::License("Lizenzserver nicht erreichbar.".into()))?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await.unwrap_or_default();
        let code = error["error"]["code"].as_str().unwrap_or("LIC_UNKNOWN");
        let message = error["error"]["message"].as_str().unwrap_or("Unbekannter Fehler");
        return Err(AppError::License(format!("{code}: {message}")));
    }

    response
        .json::<ActivateResponse>()
        .await
        .map_err(|_| AppError::License("Antwort des Lizenzservers unlesbar.".into()))
}

async fn store(payload: &str, signature: &str, token: &TokenPayload) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE license_cache SET token_payload = ?1, token_signature = ?2, status = 'valid',
                                  last_online_at = ?3, expires_at = ?4, updated_at = ?3
         WHERE id = 1",
    )
    .bind(payload)
    .bind(signature)
    .bind(&now)
    .bind(&token.exp)
    .execute(db::pool())
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn activate_license(key: String) -> Result<LicenseState, ErrorPayloadWrapper> {
    let device = device_id().await?;
    let response = call(
        "/licenses/activate",
        serde_json::json!({
            "key": key.trim(),
            "deviceId": device,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "os": if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" },
            "nonce": nonce(),
            "ts": Utc::now().to_rfc3339(),
        }),
    )
    .await?;

    let token = verify(&response.payload, &response.signature)?;
    if token.dev != device {
        return Err(AppError::License("Das Token gehört zu einem anderen Gerät.".into()).into());
    }
    store(&response.payload, &response.signature, &token).await?;

    Ok(LicenseState {
        status: "valid".into(),
        plan: Some(token.plan),
        features: token.feat,
        expires_at: token.exp,
        last_online_at: Some(Utc::now().to_rfc3339()),
        grace_days: token.grace_days,
        check_interval_h: token.check_interval_h,
        device_id: device,
    })
}

/// Regelmaessige Bestaetigung. Ein Fehlschlag durch fehlende Verbindung ist
/// kein Fehler fuer den Nutzer — die Offline-Toleranz laeuft einfach weiter.
#[tauri::command]
pub async fn license_heartbeat() -> Result<LicenseState, ErrorPayloadWrapper> {
    let state = license_status().await;
    let pool = db::pool();
    let stored: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT token_payload, token_signature FROM license_cache WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(AppError::from)?;

    let Some((Some(payload), Some(signature))) = stored else {
        return Ok(state);
    };

    match call(
        "/licenses/heartbeat",
        serde_json::json!({
            "token": payload,
            "deviceId": state.device_id,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "nonce": nonce(),
            "ts": Utc::now().to_rfc3339(),
        }),
    )
    .await
    {
        Ok(response) => {
            let token = verify(&response.payload, &response.signature)?;
            store(&response.payload, &response.signature, &token).await?;
            Ok(license_status().await)
        }
        Err(error) => {
            tracing::info!(?error, "Heartbeat fehlgeschlagen, Offline-Toleranz läuft weiter");
            let _ = signature;
            Ok(state)
        }
    }
}

#[tauri::command]
pub async fn license_status() -> LicenseState {
    let pool = db::pool();
    let row = sqlx::query_as::<_, (String, Option<String>, Option<String>, String, Option<String>)>(
        "SELECT status, expires_at, last_online_at, device_id, token_payload FROM license_cache WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let Some((status, expires_at, last_online_at, device, payload)) = row else {
        return LicenseState {
            status: "none".into(), plan: None, features: vec![], expires_at: None,
            last_online_at: None, grace_days: 7, check_interval_h: 24,
            device_id: String::new(),
        };
    };

    let token = payload
        .and_then(|value| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(value).ok())
        .and_then(|json| serde_json::from_slice::<TokenPayload>(&json).ok());

    // Abgelaufen wird lokal erkannt, ohne den Server zu fragen.
    let expired = expires_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|value| value < Utc::now());

    LicenseState {
        status: if expired { "expired".into() } else { status },
        plan: token.as_ref().map(|t| t.plan.clone()),
        features: token.as_ref().map(|t| t.feat.clone()).unwrap_or_default(),
        expires_at,
        last_online_at,
        grace_days: token.as_ref().map(|t| t.grace_days).unwrap_or(7),
        check_interval_h: token.as_ref().map(|t| t.check_interval_h).unwrap_or(24),
        device_id: device,
    }
}

/// Prueft, ob eine Faehigkeit derzeit erlaubt ist. Lesen, Exportieren und
/// Sichern bleiben immer moeglich — eine Lizenz sperrt nie die eigenen Daten.
pub async fn ensure_allowed(capability: &str) -> Result<(), AppError> {
    const ALWAYS: &[&str] = &[
        "invoices.read", "invoices.export", "invoices.print", "payments.record",
        "customers.read", "products.read", "backup.create", "backup.restore",
        "settings.read", "license.manage",
    ];
    if ALWAYS.contains(&capability) {
        return Ok(());
    }

    let state = license_status().await;
    if state.status != "valid" {
        return Err(AppError::LicenseRestricted(capability.into()));
    }

    if let Some(last_online) = state
        .last_online_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
    {
        if Utc::now() - last_online.with_timezone(&Utc) > Duration::days(state.grace_days) {
            return Err(AppError::LicenseRestricted(capability.into()));
        }
    }
    Ok(())
}
