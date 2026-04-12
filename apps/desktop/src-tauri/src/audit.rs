//! Verkettetes Audit-Log.
//!
//! Jeder Eintrag haengt am Hash seines Vorgaengers. Ein nachtraeglich
//! geaenderter Eintrag bricht die Kette und wird von der
//! Integritaetspruefung gefunden.

use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct AuditEntry {
    pub at: String,
    pub action: String,
    pub object_type: String,
    pub object_id: String,
    pub old_json: Option<String>,
    pub new_json: Option<String>,
    pub user_id: String,
    pub device_id: String,
    pub source: String,
}

pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

pub fn entry_hash(prev_hash: &str, entry: &AuditEntry) -> String {
    let mut hasher = Sha256::new();
    for part in [
        prev_hash,
        &entry.at,
        &entry.action,
        &entry.object_type,
        &entry.object_id,
        entry.old_json.as_deref().unwrap_or(""),
        entry.new_json.as_deref().unwrap_or(""),
        &entry.user_id,
        &entry.device_id,
        &entry.source,
    ] {
        hasher.update(part.as_bytes());
        hasher.update([0x1f]); // Trennzeichen, damit Feldgrenzen eindeutig bleiben
    }
    format!("{:x}", hasher.finalize())
}

/// Prueft eine Kette von Eintraegen. Gibt den Index des ersten Bruchs zurueck.
pub fn verify_chain(entries: &[(AuditEntry, String)]) -> Result<(), usize> {
    let mut prev = GENESIS_HASH.to_string();
    for (index, (entry, stored_hash)) in entries.iter().enumerate() {
        let expected = entry_hash(&prev, entry);
        if &expected != stored_hash {
            return Err(index);
        }
        prev = expected;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(action: &str) -> AuditEntry {
        AuditEntry {
            at: "2026-07-26T10:00:00Z".into(),
            action: action.into(),
            object_type: "invoice".into(),
            object_id: "inv-1".into(),
            old_json: None,
            new_json: Some("{\"status\":\"finalized\"}".into()),
            user_id: "user-1".into(),
            device_id: "dev-1".into(),
            source: "desktop".into(),
        }
    }

    #[test]
    fn intakte_kette_wird_akzeptiert() {
        let a = entry("create");
        let b = entry("finalize");
        let hash_a = entry_hash(GENESIS_HASH, &a);
        let hash_b = entry_hash(&hash_a, &b);
        assert!(verify_chain(&[(a, hash_a), (b, hash_b)]).is_ok());
    }

    #[test]
    fn geaenderter_eintrag_bricht_die_kette() {
        let a = entry("create");
        let mut b = entry("finalize");
        let hash_a = entry_hash(GENESIS_HASH, &a);
        let hash_b = entry_hash(&hash_a, &b);
        b.action = "delete".into(); // nachtraegliche Manipulation
        assert_eq!(verify_chain(&[(a, hash_a), (b, hash_b)]), Err(1));
    }
}
