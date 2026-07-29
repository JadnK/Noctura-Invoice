//! Produktive Firmen-, Steuer-, Bank- und Nummernkreis-Einstellungen.

use crate::commands::db;
use crate::error::{AppError, ErrorPayloadWrapper};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessSettings {
    pub legal_name: String,
    pub legal_form: String,
    pub owner_first_name: String,
    pub owner_last_name: String,
    pub email: String,
    pub phone: String,
    pub website: String,
    pub vat_id: String,
    pub tax_number: String,
    pub creditor_id: String,
    pub street: String,
    pub house_no: String,
    pub address_recipient: String,
    pub postal_code: String,
    pub city: String,
    pub country: String,
    pub bank_holder: String,
    pub bank_name: String,
    pub iban: String,
    pub bic: String,
    pub tax_scheme: String,
    pub default_tax_rate_bp: i64,
    pub prices_include_tax: bool,
    pub taxation_method: String,
    pub small_business_note: String,
    pub invoice_pattern: String,
    pub quote_pattern: String,
    pub credit_note_pattern: String,
    pub payment_terms_days: i64,
    pub logo_path: String,
}

impl Default for BusinessSettings {
    fn default() -> Self {
        Self {
            legal_name: String::new(),
            legal_form: String::new(),
            owner_first_name: String::new(),
            owner_last_name: String::new(),
            email: String::new(),
            phone: String::new(),
            website: String::new(),
            vat_id: String::new(),
            tax_number: String::new(),
            creditor_id: String::new(),
            street: String::new(),
            house_no: String::new(),
            address_recipient: String::new(),
            postal_code: String::new(),
            city: String::new(),
            country: "DE".into(),
            bank_holder: String::new(),
            bank_name: String::new(),
            iban: String::new(),
            bic: String::new(),
            tax_scheme: "standard".into(),
            default_tax_rate_bp: 1900,
            prices_include_tax: false,
            taxation_method: "actual".into(),
            small_business_note: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.".into(),
            invoice_pattern: "RE-{YYYY}-{COUNTER}".into(),
            quote_pattern: "ANG-{YYYY}-{COUNTER}".into(),
            credit_note_pattern: "GS-{YYYY}-{COUNTER}".into(),
            payment_terms_days: 14,
            logo_path: String::new(),
        }
    }
}

fn text(row: &sqlx::sqlite::SqliteRow, name: &str) -> String {
    row.try_get::<Option<String>, _>(name)
        .ok()
        .flatten()
        .unwrap_or_default()
}

pub async fn get_setting(key: &str) -> Result<Option<String>, AppError> {
    Ok(sqlx::query_scalar("SELECT value FROM app_setting WHERE key = ?1")
        .bind(key)
        .fetch_optional(db::pool())
        .await?)
}

async fn put_setting(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    key: &str,
    value: &str,
    now: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO app_setting (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .bind(now)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn onboarding_status() -> Result<bool, ErrorPayloadWrapper> {
    Ok(get_setting("onboarding_complete")
        .await?
        .as_deref()
        .map(|value| value == "true")
        .unwrap_or(false))
}

#[tauri::command]
pub async fn get_business_settings() -> Result<BusinessSettings, ErrorPayloadWrapper> {
    let mut result = BusinessSettings::default();

    if let Some(row) = sqlx::query(
        "SELECT legal_name, legal_form, owner_first_name, owner_last_name, email, phone,
                website, vat_id, tax_number, creditor_id, logo_path
         FROM company_profile ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    {
        result.legal_name = row.get("legal_name");
        result.legal_form = text(&row, "legal_form");
        result.owner_first_name = text(&row, "owner_first_name");
        result.owner_last_name = text(&row, "owner_last_name");
        result.email = text(&row, "email");
        result.phone = text(&row, "phone");
        result.website = text(&row, "website");
        result.vat_id = text(&row, "vat_id");
        result.tax_number = text(&row, "tax_number");
        result.creditor_id = text(&row, "creditor_id");
        result.logo_path = text(&row, "logo_path");
    }

    if let Some(row) = sqlx::query(
        "SELECT street, house_no, addition, postal_code, city, country
         FROM company_address WHERE kind='main' LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    {
        result.street = text(&row, "street");
        result.house_no = text(&row, "house_no");
        result.address_recipient = text(&row, "addition");
        result.postal_code = text(&row, "postal_code");
        result.city = text(&row, "city");
        result.country = row.try_get("country").unwrap_or_else(|_| "DE".to_string());
    }

    if let Some(row) = sqlx::query(
        "SELECT holder, bank_name, iban, bic FROM bank_account WHERE is_default=1 LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    {
        result.bank_holder = row.get("holder");
        result.bank_name = text(&row, "bank_name");
        result.iban = row.get("iban");
        result.bic = text(&row, "bic");
    }

    if let Some(row) = sqlx::query(
        "SELECT scheme, default_rate_bp, prices_include_tax, taxation_method, small_business_note
         FROM tax_setting LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    {
        result.tax_scheme = row.get("scheme");
        result.default_tax_rate_bp = row.get("default_rate_bp");
        result.prices_include_tax = row.get::<i64, _>("prices_include_tax") != 0;
        result.taxation_method = row.get("taxation_method");
        result.small_business_note = row.get("small_business_note");
    }

    let patterns = sqlx::query("SELECT doc_type, pattern FROM number_sequence")
        .fetch_all(db::pool())
        .await?;
    for row in patterns {
        let kind: String = row.get("doc_type");
        let pattern: String = row.get("pattern");
        match kind.as_str() {
            "invoice" => result.invoice_pattern = pattern,
            "quote" => result.quote_pattern = pattern,
            "credit_note" => result.credit_note_pattern = pattern,
            _ => {}
        }
    }

    result.payment_terms_days = get_setting("default_payment_terms_days")
        .await?
        .and_then(|value| value.parse().ok())
        .unwrap_or(14);

    Ok(result)
}

fn validate(settings: &BusinessSettings) -> Result<(), AppError> {
    if settings.legal_name.trim().is_empty() {
        return Err(AppError::MissingFields("Unternehmensname".into()));
    }
    if !matches!(
        settings.tax_scheme.as_str(),
        "standard" | "small_business" | "reverse_charge" | "intra_community" | "tax_exempt"
    ) {
        return Err(AppError::MissingFields("gültige Steuerregel".into()));
    }
    if !(0..=10_000).contains(&settings.default_tax_rate_bp) {
        return Err(AppError::MissingFields("gültiger Standardsteuersatz".into()));
    }
    if !matches!(settings.taxation_method.as_str(), "actual" | "accrual") {
        return Err(AppError::MissingFields("gültige Besteuerungsart".into()));
    }
    let country = settings.country.trim();
    if !country.is_empty()
        && (country.len() != 2 || !country.chars().all(|character| character.is_ascii_alphabetic()))
    {
        return Err(AppError::MissingFields("gültiger zweistelliger Ländercode".into()));
    }
    if !settings.email.trim().is_empty() {
        let email = settings.email.trim();
        if email.chars().any(char::is_whitespace)
            || !email.contains('@')
            || email.starts_with('@')
            || email.ends_with('@')
        {
            return Err(AppError::MissingFields("gültige E-Mail-Adresse".into()));
        }
    }
    if !(0..=365).contains(&settings.payment_terms_days) {
        return Err(AppError::MissingFields("Zahlungsziel zwischen 0 und 365 Tagen".into()));
    }
    for (name, pattern) in [
        ("Rechnungen", &settings.invoice_pattern),
        ("Angebote", &settings.quote_pattern),
        ("Gutschriften", &settings.credit_note_pattern),
    ] {
        if !pattern.contains("{COUNTER}") {
            return Err(AppError::MissingFields(format!(
                "Nummernkreis {name} benötigt {{COUNTER}}"
            )));
        }
    }
    if !settings.iban.is_empty() {
        let compact = settings.iban.replace(' ', "");
        if compact.len() < 15 || !compact.chars().all(|character| character.is_ascii_alphanumeric()) {
            return Err(AppError::MissingFields("gültige IBAN".into()));
        }
    }
    Ok(())
}

async fn save_inner(settings: &BusinessSettings, complete: bool) -> Result<(), AppError> {
    validate(settings)?;
    let now = Utc::now().to_rfc3339();
    let mut tx = db::pool().begin().await?;

    let company_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM company_profile ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| "company-main".into());

    sqlx::query(
        "INSERT INTO company_profile
           (id, legal_name, legal_form, owner_first_name, owner_last_name, email, phone,
            website, vat_id, tax_number, creditor_id, logo_path, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)
         ON CONFLICT(id) DO UPDATE SET
           legal_name=excluded.legal_name, legal_form=excluded.legal_form,
           owner_first_name=excluded.owner_first_name, owner_last_name=excluded.owner_last_name,
           email=excluded.email, phone=excluded.phone, website=excluded.website,
           vat_id=excluded.vat_id, tax_number=excluded.tax_number, creditor_id=excluded.creditor_id,
           logo_path=excluded.logo_path, updated_at=excluded.updated_at",
    )
    .bind(&company_id)
    .bind(settings.legal_name.trim())
    .bind(settings.legal_form.trim())
    .bind(settings.owner_first_name.trim())
    .bind(settings.owner_last_name.trim())
    .bind(settings.email.trim())
    .bind(settings.phone.trim())
    .bind(settings.website.trim())
    .bind(settings.vat_id.trim())
    .bind(settings.tax_number.trim())
    .bind(settings.creditor_id.trim())
    .bind(settings.logo_path.trim())
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    let address_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM company_address WHERE company_id=?1 AND kind='main' LIMIT 1",
    )
    .bind(&company_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    sqlx::query(
        "INSERT INTO company_address
           (id, company_id, kind, street, house_no, addition, postal_code, city, country)
         VALUES (?1,?2,'main',?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id, kind='main',
           street=excluded.street, house_no=excluded.house_no, addition=excluded.addition,
           postal_code=excluded.postal_code, city=excluded.city, country=excluded.country",
    )
    .bind(address_id)
    .bind(&company_id)
    .bind(settings.street.trim())
    .bind(settings.house_no.trim())
    .bind(settings.address_recipient.trim())
    .bind(settings.postal_code.trim())
    .bind(settings.city.trim())
    .bind(if settings.country.trim().is_empty() { "DE".to_string() } else { settings.country.trim().to_ascii_uppercase() })
    .execute(&mut *tx)
    .await?;

    if settings.iban.trim().is_empty() {
        sqlx::query("DELETE FROM bank_account WHERE company_id=?1 AND is_default=1")
            .bind(&company_id)
            .execute(&mut *tx)
            .await?;
    } else {
        let bank_id = sqlx::query_scalar::<_, String>(
            "SELECT id FROM bank_account WHERE company_id=?1 AND is_default=1 LIMIT 1",
        )
        .bind(&company_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
        sqlx::query(
            "INSERT INTO bank_account
               (id, company_id, holder, bank_name, iban, bic, is_default)
             VALUES (?1,?2,?3,?4,?5,?6,1)
             ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,
               holder=excluded.holder, bank_name=excluded.bank_name,
               iban=excluded.iban, bic=excluded.bic, is_default=1",
        )
        .bind(bank_id)
        .bind(&company_id)
        .bind(if settings.bank_holder.trim().is_empty() {
            settings.legal_name.trim()
        } else {
            settings.bank_holder.trim()
        })
        .bind(settings.bank_name.trim())
        .bind(settings.iban.replace(' ', ""))
        .bind(settings.bic.replace(' ', ""))
        .execute(&mut *tx)
        .await?;
    }

    let tax_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM tax_setting WHERE company_id=?1 LIMIT 1",
    )
    .bind(&company_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    sqlx::query(
        "INSERT INTO tax_setting
           (id, company_id, scheme, default_rate_bp, prices_include_tax, taxation_method,
            show_line_tax, show_tax_summary, small_business_note, default_country)
         VALUES (?1,?2,?3,?4,?5,?6,1,1,?7,?8)
         ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,
           scheme=excluded.scheme, default_rate_bp=excluded.default_rate_bp,
           prices_include_tax=excluded.prices_include_tax,
           taxation_method=excluded.taxation_method,
           small_business_note=excluded.small_business_note,
           default_country=excluded.default_country",
    )
    .bind(tax_id)
    .bind(&company_id)
    .bind(&settings.tax_scheme)
    .bind(settings.default_tax_rate_bp)
    .bind(if settings.prices_include_tax { 1_i64 } else { 0_i64 })
    .bind(&settings.taxation_method)
    .bind(&settings.small_business_note)
    .bind(if settings.country.trim().is_empty() { "DE".to_string() } else { settings.country.trim().to_ascii_uppercase() })
    .execute(&mut *tx)
    .await?;

    for (kind, pattern) in [
        ("invoice", &settings.invoice_pattern),
        ("quote", &settings.quote_pattern),
        ("credit_note", &settings.credit_note_pattern),
    ] {
        sqlx::query("UPDATE number_sequence SET pattern=?2 WHERE doc_type=?1")
            .bind(kind)
            .bind(pattern.trim())
            .execute(&mut *tx)
            .await?;
    }

    put_setting(
        &mut tx,
        "default_payment_terms_days",
        &settings.payment_terms_days.to_string(),
        &now,
    )
    .await?;
    if complete {
        put_setting(&mut tx, "onboarding_complete", "true", &now).await?;
    }

    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn save_business_settings(settings: BusinessSettings) -> Result<(), ErrorPayloadWrapper> {
    save_inner(&settings, false).await?;
    Ok(())
}

#[tauri::command]
pub async fn complete_onboarding(settings: BusinessSettings) -> Result<(), ErrorPayloadWrapper> {
    save_inner(&settings, true).await?;
    Ok(())
}


fn logo_mime(path: &std::path::Path) -> Option<&'static str> {
    match path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        _ => None,
    }
}

#[tauri::command]
pub async fn choose_company_logo(app: tauri::AppHandle) -> Result<Option<String>, ErrorPayloadWrapper> {
    let selected = app
        .dialog()
        .file()
        .set_title("Firmenlogo auswählen")
        .add_filter("Bilddateien", &["png", "jpg", "jpeg"])
        .blocking_pick_file();
    let Some(selected) = selected else { return Ok(None) };
    let source = selected
        .into_path()
        .map_err(|error| AppError::Io(format!("Logo-Pfad ist ungültig: {error}")))?;
    let mime = logo_mime(&source).ok_or_else(|| {
        AppError::MissingFields("Logo als PNG oder JPG".into())
    })?;
    let metadata = std::fs::metadata(&source).map_err(|error| {
        AppError::Io(format!("Logo-Metadaten konnten nicht gelesen werden: {error}"))
    })?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err(AppError::MissingFields("Logo kleiner als 10 MB".into()).into());
    }
    let extension = match mime {
        "image/png" => "png",
        _ => "jpg",
    };
    let directory = db::data_dir().join("branding");
    std::fs::create_dir_all(&directory).map_err(|error| {
        AppError::Io(format!("Branding-Verzeichnis konnte nicht angelegt werden: {error}"))
    })?;
    let target = directory.join(format!("company-logo.{extension}"));
    std::fs::copy(&source, &target).map_err(|error| {
        AppError::Io(format!("Firmenlogo konnte nicht gespeichert werden: {error}"))
    })?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn remove_company_logo() -> Result<(), ErrorPayloadWrapper> {
    let current: Option<String> = sqlx::query_scalar(
        "SELECT logo_path FROM company_profile ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    .flatten();
    sqlx::query("UPDATE company_profile SET logo_path=NULL, updated_at=?1")
        .bind(Utc::now().to_rfc3339())
        .execute(db::pool())
        .await?;
    if let Some(path) = current.filter(|value| !value.trim().is_empty()) {
        let path = std::path::PathBuf::from(path);
        if path.starts_with(db::data_dir().join("branding")) {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn company_logo_data_url() -> Result<Option<String>, ErrorPayloadWrapper> {
    let path: Option<String> = sqlx::query_scalar(
        "SELECT logo_path FROM company_profile ORDER BY created_at LIMIT 1",
    )
    .fetch_optional(db::pool())
    .await?
    .flatten();
    let Some(path) = path.filter(|value| !value.trim().is_empty()) else { return Ok(None) };
    let path = std::path::PathBuf::from(path);
    let Some(mime) = logo_mime(&path) else { return Ok(None) };
    let bytes = std::fs::read(path).map_err(|error| {
        AppError::Io(format!("Firmenlogo konnte nicht gelesen werden: {error}"))
    })?;
    Ok(Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes))))
}
