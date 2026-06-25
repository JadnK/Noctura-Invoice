//! Fehlertypen mit stabilen Codes. Die Oberflaeche zeigt Beschreibung, Ursache
//! und Loesungsvorschlag; technische Details liegen im aufklappbaren Bereich.
//! Die Codes entsprechen dem Katalog in `apps/desktop/src/lib/errors.ts`.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Die Summen der Oberfläche weichen von der Neuberechnung ab.")]
    CalculationMismatch { expected: i64, actual: i64 },
    #[error("Die Rechnungsnummer {0} ist bereits vergeben.")]
    DuplicateNumber(String),
    #[error("Der Beleg ist bereits finalisiert und kann nicht mehr geändert werden.")]
    AlreadyFinalized,
    #[error("Pflichtfelder fehlen: {0}")]
    MissingFields(String),
    #[error("Datenbankfehler")]
    Database(#[from] sqlx::Error),
    #[error("Lizenz erlaubt diese Aktion nicht: {0}")]
    LicenseRestricted(String),
    #[error("PDF konnte nicht erzeugt werden: {0}")]
    PdfFailed(String),
    #[error("E-Mail-Versand fehlgeschlagen: {1}")]
    Smtp(&'static str, String),
    #[error("Sicherung fehlgeschlagen: {0}")]
    Backup(String),
    #[error("Lizenzserver: {0}")]
    License(String),
    #[error("Datei- oder Verzeichnisfehler: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}

#[derive(Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::CalculationMismatch { .. } => "E_CALC_MISMATCH",
            AppError::DuplicateNumber(_) => "E_DUPLICATE_NUMBER",
            AppError::AlreadyFinalized => "E_ALREADY_FINALIZED",
            AppError::MissingFields(_) => "E_MISSING_FIELDS",
            AppError::Database(_) => "E_DATABASE",
            AppError::LicenseRestricted(_) => "E_LICENSE_RESTRICTED",
            AppError::PdfFailed(_) => "E_PDF_FAILED",
            AppError::Smtp(_, _) => "E_SMTP_CONNECT",
            AppError::Backup(_) => "E_BACKUP_CORRUPT",
            AppError::License(_) => "E_LICENSE_UNREACHABLE",
            AppError::Io(_) => "E_EXPORT_DIR",
        }
    }
}

pub struct ErrorPayloadWrapper(pub AppError);

impl Serialize for ErrorPayloadWrapper {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.0.code(),
            message: self.0.to_string(),
            // Datenbankinterna erreichen die Oberfläche nicht: ein Fehlertext mit
            // Tabellennamen hilft niemandem und verrät Struktur.
            detail: match &self.0 {
                AppError::Database(_) => None,
                AppError::Smtp(kind, detail) => Some(format!("{kind}: {detail}")),
                other => Some(format!("{other:?}")),
            },
        }
        .serialize(s)
    }
}

impl From<AppError> for ErrorPayloadWrapper {
    fn from(value: AppError) -> Self {
        ErrorPayloadWrapper(value)
    }
}
