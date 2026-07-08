//! PDF-Erzeugung ueber Typst (ADR-0004).
//!
//! Kein Browser, kein externer Prozess, keine Systemschriften: die Schriften
//! liegen als Bytes im Programm. Damit sieht dasselbe Dokument auf jedem
//! Rechner gleich aus, auch in fuenf Jahren.

use crate::error::AppError;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use typst::foundations::{Bytes, Datetime};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, World};

/// Mitgelieferte Schriften. Die Auswahl ist bewusst klein: jede zusaetzliche
/// Schrift vergroessert das Programm und muss lizenzrechtlich geklaert sein.
const FONTS: &[&[u8]] = &[
    include_bytes!("../fonts/Inter-Regular.ttf"),
    include_bytes!("../fonts/Inter-SemiBold.ttf"),
    include_bytes!("../fonts/IBMPlexMono-Regular.ttf"),
    include_bytes!("../fonts/SourceSerif4-Regular.ttf"),
];

pub struct NocturaWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    source: typst::syntax::Source,
    /// Bilder, die die Vorlage einbindet: Logo, Stempel, QR-Code.
    assets: Vec<(String, Bytes)>,
}

impl NocturaWorld {
    pub fn new(markup: String, assets: Vec<(String, Vec<u8>)>) -> Self {
        let fonts: Vec<Font> = FONTS
            .iter()
            .flat_map(|data| Font::iter(Bytes::from_static(data)))
            .collect();
        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
            source: typst::syntax::Source::detached(markup),
            assets: assets.into_iter().map(|(name, data)| (name, Bytes::from(data))).collect(),
        }
    }
}

impl World for NocturaWorld {
    fn library(&self) -> &LazyHash<Library> { &self.library }
    fn book(&self) -> &LazyHash<FontBook> { &self.book }
    fn main(&self) -> typst::syntax::FileId { self.source.id() }

    fn source(&self, id: typst::syntax::FileId) -> typst::diag::FileResult<typst::syntax::Source> {
        if id == self.source.id() { Ok(self.source.clone()) }
        else { Err(typst::diag::FileError::NotFound(PathBuf::from("unbekannt"))) }
    }

    fn file(&self, id: typst::syntax::FileId) -> typst::diag::FileResult<Bytes> {
        let name = id.vpath().as_rootless_path().to_string_lossy().to_string();
        self.assets
            .iter()
            .find(|(asset, _)| *asset == name)
            .map(|(_, bytes)| bytes.clone())
            // Ein Dokument darf nur auf Dateien zugreifen, die ihm ausdruecklich
            // mitgegeben wurden. Kein Zugriff auf das Dateisystem.
            .ok_or_else(|| typst::diag::FileError::NotFound(PathBuf::from(name)))
    }

    fn font(&self, index: usize) -> Option<Font> { self.fonts.get(index).cloned() }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        let now = chrono::Utc::now();
        Datetime::from_ymd(
            now.format("%Y").to_string().parse().ok()?,
            now.format("%m").to_string().parse().ok()?,
            now.format("%d").to_string().parse().ok()?,
        )
    }
}

pub struct PdfResult {
    pub path: PathBuf,
    pub sha256: String,
    pub pages: usize,
}

/// Rendert Typst-Markup zu einer PDF-Datei und legt die Pruefsumme mit ab.
pub fn render_to_file(
    markup: String,
    assets: Vec<(String, Vec<u8>)>,
    target: &Path,
) -> Result<PdfResult, AppError> {
    let world = NocturaWorld::new(markup, assets);
    let warned = typst::compile(&world);
    let document = warned.output.map_err(|diagnostics| {
        let first = diagnostics
            .first()
            .map(|d| d.message.to_string())
            .unwrap_or_else(|| "unbekannter Vorlagenfehler".into());
        AppError::PdfFailed(first)
    })?;

    let options = typst_pdf::PdfOptions::default();
    let bytes = typst_pdf::pdf(&document, &options)
        .map_err(|_| AppError::PdfFailed("PDF konnte nicht geschrieben werden".into()))?;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::PdfFailed(e.to_string()))?;
    }
    std::fs::write(target, &bytes).map_err(|e| AppError::PdfFailed(e.to_string()))?;

    Ok(PdfResult {
        path: target.to_path_buf(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
        pages: document.pages.len(),
    })
}

/// GiroCode als SVG, damit er im PDF scharf bleibt.
pub fn girocode_svg(payload: &str) -> Result<Vec<u8>, AppError> {
    let code = qrcode::QrCode::with_error_correction_level(payload, qrcode::EcLevel::M)
        .map_err(|e| AppError::PdfFailed(e.to_string()))?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(200, 200)
        .quiet_zone(true)
        .build()
        .into_bytes())
}
