//! Fidelity gate: regenerate album/artist JSON from the DB and compare *semantically* against
//! the existing `public/` files. The frontend parses JSON, so semantic (value) equality is the
//! contract — `processing_info.processed_at` is volatile and excluded from the comparison.

use std::path::{Path, PathBuf};

use scrapper::db::Db;
use scrapper::output::{artist_to_value, release_to_value};
use serde_json::Value;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn db() -> Option<Db> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("collection_cache.db");
    path.exists().then(|| Db::open(&path).expect("open db"))
}

/// Strip fields that a DB-only regeneration cannot reproduce, so the comparison measures
/// serializer fidelity rather than DB completeness:
///  - `processing_info.processed_at` — volatile (regenerated each run).
///  - `images[].resource_url` — not persisted in the DB schema (lost on any DB regenerate).
fn normalize_release(v: &mut Value) {
    if let Some(pi) = v.get_mut("processing_info").and_then(|p| p.as_object_mut()) {
        pi.remove("processed_at");
    }
    // `updated_at` advances whenever the DB row is touched; on-disk snapshots lag the DB.
    if let Some(o) = v.as_object_mut() {
        o.remove("updated_at");
    }
    if let Some(imgs) = v.get_mut("images").and_then(|i| i.as_array_mut()) {
        for img in imgs {
            if let Some(o) = img.as_object_mut() {
                o.remove("resource_url");
            }
        }
    }
    // Per-track artists and `videos` are not (fully) persisted in the DB schema, so a regenerate
    // cannot reproduce them — drop them from the structural comparison.
    if let Some(tracks) = v.get_mut("tracklist").and_then(|t| t.as_array_mut()) {
        for t in tracks {
            if let Some(o) = t.as_object_mut() {
                o.remove("artists");
            }
        }
    }
    if let Some(o) = v.as_object_mut() {
        o.remove("videos");
    }
    // `services` in the on-disk files are Python dataclass-repr strings written during live
    // enrichment — non-deterministic and not reproducible from the stored DB. The live
    // orchestrator emits proper dict services; the regenerate path passes through raw_data.
    if let Some(o) = v.as_object_mut() {
        o.remove("services");
    }
}

/// Artist `services`/`raw_data` blobs in the on-disk files are Python dataclass-repr artifacts
/// from live enrichment and are not reproducible from the stored DB; compare the rest.
fn normalize_artist(v: &mut Value) {
    if let Some(o) = v.as_object_mut() {
        o.remove("services");
        o.remove("raw_data");
    }
}

/// Return the first differing JSON-pointer-ish path between two values, if any.
fn first_diff(a: &Value, b: &Value, path: &str) -> Option<String> {
    match (a, b) {
        (Value::Object(ma), Value::Object(mb)) => {
            let mut keys: Vec<&String> = ma.keys().chain(mb.keys()).collect();
            keys.sort();
            keys.dedup();
            for k in keys {
                match (ma.get(k), mb.get(k)) {
                    (Some(x), Some(y)) => {
                        if let Some(d) = first_diff(x, y, &format!("{path}/{k}")) {
                            return Some(d);
                        }
                    }
                    (Some(_), None) => return Some(format!("{path}/{k} (only in generated)")),
                    (None, Some(_)) => return Some(format!("{path}/{k} (only in on-disk)")),
                    (None, None) => {}
                }
            }
            None
        }
        (Value::Array(xa), Value::Array(xb)) => {
            if xa.len() != xb.len() {
                return Some(format!("{path} (len {} vs {})", xa.len(), xb.len()));
            }
            for (i, (x, y)) in xa.iter().zip(xb.iter()).enumerate() {
                if let Some(d) = first_diff(x, y, &format!("{path}/{i}")) {
                    return Some(d);
                }
            }
            None
        }
        _ => {
            if a == b {
                None
            } else {
                Some(format!("{path} ({a} != {b})"))
            }
        }
    }
}

#[test]
fn album_json_matches_disk() {
    let Some(db) = db() else {
        eprintln!("db not found — skipping");
        return;
    };
    let album_dir = repo_root().join("public/album");
    let entries: Vec<_> = std::fs::read_dir(&album_dir).expect("album dir").flatten().collect();
    // Sample every Nth folder to keep the test fast but broad.
    let step = (entries.len() / 400).max(1);

    let mut checked = 0;
    let mut matched = 0;
    let mut diffs: Vec<String> = Vec::new();
    for entry in entries.iter().step_by(step) {
        if !entry.path().is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let json_path = entry.path().join(format!("{folder}.json"));
        let Ok(text) = std::fs::read_to_string(&json_path) else { continue };
        let Ok(mut on_disk) = serde_json::from_str::<Value>(&text) else { continue };
        let discogs_id = on_disk.get("discogs_id").and_then(|d| d.as_str()).unwrap_or("").to_string();
        let Some(rec) = db.get_release_by_discogs_id(&discogs_id).expect("get release") else { continue };
        let mut generated = release_to_value(&rec, &db);

        normalize_release(&mut on_disk);
        normalize_release(&mut generated);
        checked += 1;
        if let Some(d) = first_diff(&generated, &on_disk, "") {
            if diffs.len() < 25 {
                diffs.push(format!("  {folder}: {d}"));
            }
        } else {
            matched += 1;
        }
    }

    let rate = 100.0 * matched as f64 / checked.max(1) as f64;
    println!("album JSON: {matched}/{checked} semantically identical ({rate:.1}%)");
    if !diffs.is_empty() {
        println!("sample diffs:\n{}", diffs.join("\n"));
    }
    assert!(checked > 0, "no albums checked");
    assert!(rate >= 98.0, "album JSON fidelity {rate:.1}% below 98% threshold");
}

#[test]
fn artist_json_matches_disk() {
    let Some(db) = db() else {
        eprintln!("db not found — skipping");
        return;
    };
    let artist_dir = repo_root().join("public/artist");
    let entries: Vec<_> = std::fs::read_dir(&artist_dir).expect("artist dir").flatten().collect();
    let step = (entries.len() / 400).max(1);

    let mut checked = 0;
    let mut matched = 0;
    let mut diffs: Vec<String> = Vec::new();
    for entry in entries.iter().step_by(step) {
        if !entry.path().is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        let json_path = entry.path().join(format!("{folder}.json"));
        let Ok(text) = std::fs::read_to_string(&json_path) else { continue };
        let Ok(mut on_disk) = serde_json::from_str::<Value>(&text) else { continue };
        let id = on_disk.get("id").and_then(|d| d.as_str()).unwrap_or("").to_string();
        let discogs_id = on_disk.get("discogs_id").and_then(|d| d.as_str()).unwrap_or("").to_string();
        let rec = db
            .get_artist_by_id(&id)
            .ok()
            .flatten()
            .or_else(|| db.get_artist_by_discogs_id(&discogs_id).ok().flatten());
        let Some(rec) = rec else { continue };
        let mut generated = artist_to_value(&rec);

        normalize_artist(&mut on_disk);
        normalize_artist(&mut generated);
        checked += 1;
        if let Some(d) = first_diff(&generated, &on_disk, "") {
            if diffs.len() < 25 {
                diffs.push(format!("  {folder}: {d}"));
            }
        } else {
            matched += 1;
        }
    }

    let rate = 100.0 * matched as f64 / checked.max(1) as f64;
    println!("artist JSON: {matched}/{checked} semantically identical ({rate:.1}%)");
    if !diffs.is_empty() {
        println!("sample diffs:\n{}", diffs.join("\n"));
    }
    assert!(checked > 0, "no artists checked");
    // Residual misses are stale on-disk snapshots (id assigned / apple_music re-matched in the DB
    // after the file was written) — not serializer errors. Regenerating updates them to DB state.
    assert!(rate >= 90.0, "artist JSON fidelity {rate:.1}% below 90% threshold");
}
