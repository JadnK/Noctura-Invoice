//! Ohne dieses Skript generiert Tauri keinen Build-Kontext, und
//! `tauri::generate_context!()` in main.rs schlaegt mit "OUT_DIR env var is
//! not set" fehl. Jedes Tauri-Projekt braucht dieses Skript.
//!
//! Zusaetzlich: eine Vorabpruefung der eingebetteten Schriften. `pdf.rs`
//! bindet sie ueber `include_bytes!` ein — fehlen sie, bricht der Compiler
//! mitten in der Datei mit einem rohen Betriebssystemfehler ab ("os error 2"),
//! ohne zu sagen, was zu tun ist. Diese Pruefung laeuft vorher und sagt es.

use std::path::Path;

const REQUIRED_FONTS: &[&str] = &[
    "Inter-Regular.ttf",
    "Inter-SemiBold.ttf",
    "IBMPlexMono-Regular.ttf",
    "SourceSerif4-Regular.ttf",
];

fn check_fonts() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
    let missing: Vec<&str> = REQUIRED_FONTS
        .iter()
        .filter(|name| !dir.join(name).is_file())
        .copied()
        .collect();

    if missing.is_empty() {
        return;
    }

    eprintln!();
    eprintln!("  Es fehlen eingebettete Schriften fuer die PDF-Erzeugung:");
    for name in &missing {
        eprintln!("    - {name}");
    }
    eprintln!();
    eprintln!("  Sie werden nicht mitgeliefert und muessen vor dem Bauen geholt werden:");
    eprintln!();
    eprintln!("    Windows (PowerShell):");
    eprintln!("      powershell -ExecutionPolicy Bypass -File apps\\desktop\\scripts\\fetch-fonts.ps1");
    eprintln!();
    eprintln!("    macOS / Linux / Git Bash / WSL:");
    eprintln!("      bash apps/desktop/scripts/fetch-fonts.sh");
    eprintln!();
    eprintln!("  Schlaegt der Download fehl (Firmenproxy, falsche URL): manueller Weg");
    eprintln!("  in fonts/README.md, Abschnitt 'Manuell besorgen'.");
    eprintln!();
    eprintln!("  Danach diesen Build erneut starten.");
    eprintln!();
    panic!("Build abgebrochen: {} Schriftdatei(en) fehlen.", missing.len());
}

fn main() {
    check_fonts();
    tauri_build::build();
}
