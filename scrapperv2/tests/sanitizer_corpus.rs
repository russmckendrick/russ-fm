//! Corpus gate: every existing `public/album/*` and `public/artist/*` folder must be
//! reproducible from its JSON via the Rust sanitizer. This guards the data contract — a
//! mismatch means new writes would orphan existing folders.
//!
//! Two documented sources of benign drift are tolerated:
//!  - **Filesystem normalization:** macOS may return folder names in NFD while the sanitizer
//!    emits NFC. macOS resolves both to the same directory, so both sides are NFC-normalized
//!    before comparison.
//!  - **Legacy folders** (see `LEGACY_*` allowlists): created before certain sanitizer rules
//!    existed (accent transliteration, en-dash→dash, the `G_d`→`gd` underscore rule). The
//!    *current* Python sanitizer does not reproduce these either, so they are not port bugs.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use scrapperv2::sanitize::{release_folder_name, sanitize_folder_name};
use unicode_normalization::UnicodeNormalization;

/// Album folders predating sanitizer rules (verified identical to current Python output).
const LEGACY_ALBUMS: &[&str] = &[
    "a-new-career-in-a-new-town-19771982-10919769", // en-dash dropped, now → 1977-1982
    "loving-the-alien-19831988-12645443",           // en-dash dropped, now → 1983-1988
    "who-can-i-be-now-19741976-9088273",            // en-dash dropped, now → 1974-1976
    "g-ds-pee-at-states-end-18068767",              // pre `G_d`→`gd` underscore rule
];

/// Artist folders predating accent transliteration (verified identical to current Python output).
const LEGACY_ARTISTS: &[&str] = &[
    "jóhann-jóhannsson",
    "hilmar-örn-hilmarsson",
    "maría-huld-markan-sigfúsdóttir",
    "queensrÿche",
];

fn nfc(s: &str) -> String {
    s.nfc().collect()
}

/// Locate the repo's `public/` dir relative to this crate (crate lives at `<repo>/scrapperv2`).
fn public_dir() -> Option<PathBuf> {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let candidate = crate_dir.parent()?.join("public");
    candidate.is_dir().then_some(candidate)
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[test]
fn album_folder_slugs_match() {
    let Some(public) = public_dir() else {
        eprintln!("public/ not found — skipping album corpus test");
        return;
    };
    let legacy: HashSet<String> = LEGACY_ALBUMS.iter().map(|s| nfc(s)).collect();
    let album_dir = public.join("album");
    let mut checked = 0usize;
    let mut legacy_seen = 0usize;
    let mut mismatches: Vec<String> = Vec::new();

    for entry in std::fs::read_dir(&album_dir).expect("read album dir").flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let json_path = entry.path().join(format!("{folder}.json"));
        let Some(v) = read_json(&json_path) else { continue };
        let title = v.get("title").and_then(|t| t.as_str()).unwrap_or("");
        let discogs_id = v
            .get("discogs_id")
            .map(|d| match d {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_default();
        let expected = release_folder_name(title, &discogs_id);
        checked += 1;
        if nfc(&expected) != nfc(&folder) {
            if legacy.contains(&nfc(&folder)) {
                legacy_seen += 1;
            } else if mismatches.len() < 40 {
                mismatches.push(format!("  folder={folder}  computed={expected}  title={title:?}"));
            }
        }
    }

    println!("album folders checked: {checked}, legacy tolerated: {legacy_seen}, unexpected mismatches: {}", mismatches.len());
    assert!(
        mismatches.is_empty(),
        "unexpected album slug mismatches ({}):\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}

#[test]
fn artist_folder_slugs_match() {
    let Some(public) = public_dir() else {
        eprintln!("public/ not found — skipping artist corpus test");
        return;
    };
    let legacy: HashSet<String> = LEGACY_ARTISTS.iter().map(|s| nfc(s)).collect();
    let artist_dir = public.join("artist");
    let mut checked = 0usize;
    let mut legacy_seen = 0usize;
    let mut mismatches: Vec<String> = Vec::new();

    for entry in std::fs::read_dir(&artist_dir).expect("read artist dir").flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let json_path = entry.path().join(format!("{folder}.json"));
        let Some(v) = read_json(&json_path) else { continue };
        let name = v.get("name").and_then(|t| t.as_str()).unwrap_or("");
        let expected = sanitize_folder_name(name);
        checked += 1;
        if nfc(&expected) != nfc(&folder) {
            if legacy.contains(&nfc(&folder)) {
                legacy_seen += 1;
            } else if mismatches.len() < 40 {
                mismatches.push(format!("  folder={folder}  computed={expected}  name={name:?}"));
            }
        }
    }

    println!("artist folders checked: {checked}, legacy tolerated: {legacy_seen}, unexpected mismatches: {}", mismatches.len());
    assert!(
        mismatches.is_empty(),
        "unexpected artist slug mismatches ({}):\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}
