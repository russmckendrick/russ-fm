//! `backfill-artist-discogs` — re-fetch the Discogs artist (members, groups, aliases, profile)
//! for artist rows that only hold a placeholder where it belongs.
//!
//! Two placeholders exist: the Python scrapper's failed-fetch stub
//! (`raw_data.discogs.raw_data = {id, note: "Failed to fetch data automatically", resource_url}`)
//! and the `{id, original_name, role}` release credit `save_release` seeds a new artist row with.
//! Neither carries members or groups, so /explore draws no band links for those artists. The
//! artist is fetched by its stored Discogs ID — no name search, so no wrong match — and only
//! `raw_data.discogs` (plus a missing `discogs_url`) changes.
//!
//! Resumable: artists with a real Discogs payload are skipped (unless `--force`).

use anyhow::Result;
use serde_json::Value;

use crate::cli::BackfillArtistDiscogsArgs;
use crate::db::ArtistRecord;
use crate::services::Services;
use crate::util::now_iso;
use crate::{Config, Db};

/// The Discogs artist payload on an artist row: the Python scrapper wrapped it as
/// `raw_data.discogs.raw_data`, the Rust one stores it as `raw_data.discogs` itself.
pub fn discogs_payload(raw: &Value) -> Option<&Value> {
    let d = raw.get("discogs")?;
    d.get("raw_data").filter(|r| r.is_object()).or(Some(d))
}

/// True when the row holds a real Discogs artist rather than a placeholder (neither the stub
/// nor a seeded release credit has a `name`).
pub fn has_discogs_detail(raw: &Value) -> bool {
    discogs_payload(raw).and_then(|d| d.get("name")).and_then(Value::as_str).is_some_and(|n| !n.trim().is_empty())
}

/// The artist's Discogs ID: the column, else the one on the stored block.
fn discogs_id_of(rec: &ArtistRecord) -> Option<String> {
    rec.discogs_id
        .clone()
        .filter(|d| !d.is_empty())
        .or_else(|| discogs_payload(&rec.raw_data)?.get("id").map(|i| i.as_str().map(String::from).unwrap_or_else(|| i.to_string())))
        .filter(|d| d != "0" && d.bytes().all(|b| b.is_ascii_digit()))
}

/// Fetch the artist by its stored Discogs ID and swap it in for the placeholder. Returns the
/// updated record (not yet persisted).
pub async fn fetch(services: &Services, rec: &ArtistRecord) -> Result<Option<ArtistRecord>> {
    let Some(id) = discogs_id_of(rec) else { return Ok(None) };
    let mut payload = match services.discogs.get_artist(&id).await {
        Ok(p) => p,
        // Discogs' own placeholders (Various, Unknown Artist) and removed artists 404.
        Err(crate::services::http::ServiceError::NotFound) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if !payload.get("name").and_then(Value::as_str).is_some_and(|n| !n.trim().is_empty()) {
        return Ok(None);
    }
    let mut raw = rec.raw_data.as_object().cloned().unwrap_or_default();
    // The release credit's spelling ("Sleep (2)" style) feeds discogs_original_name.
    if let (Some(orig), Some(p)) = (raw.get("discogs").and_then(|d| d.get("original_name")).cloned(), payload.as_object_mut()) {
        p.insert("original_name".into(), orig);
    }
    let mut updated = rec.clone();
    if updated.discogs_url.as_deref().is_none_or(str::is_empty) {
        updated.discogs_url = payload.get("uri").and_then(Value::as_str).map(String::from);
    }
    updated.discogs_id = Some(id);
    raw.insert("discogs".into(), payload);
    updated.raw_data = Value::Object(raw);
    updated.updated_at = Some(now_iso());
    Ok(Some(updated))
}

/// After a release is added: give each of its artists still on a placeholder the real Discogs
/// artist, so a new record's band links reach /explore without a backfill. Returns how many.
pub async fn refresh_release_artists(cfg: &Config, services: &Services, db: &Db, rec: &crate::db::ReleaseRecord) -> usize {
    let credits = rec.artists.as_array().cloned().unwrap_or_default();
    let mut updated = 0;
    for credit in crate::credits::headliners(&credits) {
        let by_id = credit
            .get("discogs_id")
            .and_then(|d| d.as_str())
            .and_then(|d| db.get_artist_by_discogs_id(d).ok().flatten());
        let name = credit.get("name").and_then(|n| n.as_str()).unwrap_or("").trim();
        let Some(artist) = by_id.or_else(|| db.get_artist_by_name(name).ok().flatten()) else { continue };
        if has_discogs_detail(&artist.raw_data) {
            continue;
        }
        match fetch(services, &artist).await {
            Ok(Some(a)) => match crate::ops::artist::persist_artist(cfg, db, &a) {
                Ok(_) => updated += 1,
                Err(e) => tracing::warn!("saving Discogs artist for {}: {e}", artist.name),
            },
            Ok(None) => {}
            Err(e) => tracing::warn!("Discogs artist for {}: {e}", artist.name),
        }
    }
    updated
}

pub async fn run(cfg: &Config, args: BackfillArtistDiscogsArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let services = Services::new(cfg);

    let mut todo: Vec<ArtistRecord> = Vec::new();
    let mut no_id = Vec::new();
    for s in db.list_artists(u32::MAX, "name")? {
        if args.artist.as_deref().is_some_and(|a| !s.name.eq_ignore_ascii_case(a)) {
            continue;
        }
        let Some(rec) = db.get_artist_by_id(&s.id)? else { continue };
        if !args.force && has_discogs_detail(&rec.raw_data) {
            continue;
        }
        if discogs_id_of(&rec).is_none() {
            no_id.push(rec.name);
            continue;
        }
        todo.push(rec);
    }
    if let Some(l) = args.limit {
        todo.truncate(l as usize);
    }
    crate::say!(
        "{} artist(s) without a Discogs artist payload{}...",
        todo.len(),
        if args.dry_run { " (dry run: nothing is fetched or written)" } else { "; fetching by stored Discogs ID" }
    );

    let (mut done, mut missing, mut failed) = (0usize, 0usize, 0usize);
    for rec in &todo {
        if args.dry_run {
            crate::say!("  {} (Discogs {})", rec.name, discogs_id_of(rec).unwrap_or_default());
            continue;
        }
        match fetch(&services, rec).await {
            Ok(Some(updated)) => match crate::ops::artist::persist_artist(cfg, &db, &updated) {
                Ok(_) => {
                    let p = discogs_payload(&updated.raw_data);
                    let n = |k: &str| p.and_then(|p| p.get(k)).and_then(Value::as_array).map_or(0, Vec::len);
                    crate::say!("✓ {}: {} member(s), {} group(s), {} alias(es)", rec.name, n("members"), n("groups"), n("aliases"));
                    done += 1;
                }
                Err(e) => {
                    crate::say!("✗ {}: {e}", rec.name);
                    failed += 1;
                }
            },
            Ok(None) => {
                crate::say!("· {}: Discogs returned no artist", rec.name);
                missing += 1;
            }
            Err(e) => {
                crate::say!("✗ {}: {e}", rec.name);
                failed += 1;
            }
        }
    }

    if !no_id.is_empty() {
        let mut names: Vec<String> = no_id.iter().map(|n| n.split_whitespace().collect::<Vec<_>>().join(" ")).collect();
        names.sort_by_key(|n| n.to_lowercase());
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        crate::say!("\n{} artist(s) with no Discogs ID to fetch by (set one in the artist editor): {}", names.len(), names.join(", "));
    }
    if args.dry_run {
        crate::say!("\nDone: {} artist(s) would be fetched.", todo.len());
    } else {
        crate::say!("\nDone: {done} artist(s) updated, {missing} not found on Discogs, {failed} failed (re-run to retry).");
        if done > 0 {
            crate::say!("Rebuild the explore graph: pnpm run generate-explore");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn placeholders_have_no_detail() {
        let stub = json!({ "discogs": { "id": "57916", "members": [], "raw_data": { "id": "57916", "note": "Failed to fetch data automatically" } } });
        let seeded = json!({ "discogs": { "id": "57916", "original_name": "Sleep", "role": "" } });
        assert!(!has_discogs_detail(&stub));
        assert!(!has_discogs_detail(&seeded));
        assert!(!has_discogs_detail(&json!({})));
    }

    #[test]
    fn both_payload_shapes_count() {
        let python = json!({ "discogs": { "id": "3852", "raw_data": { "name": "Primal Scream", "members": [{ "id": 1 }] } } });
        let rust = json!({ "discogs": { "id": 3852, "name": "Primal Scream", "members": [] } });
        assert!(has_discogs_detail(&python));
        assert!(has_discogs_detail(&rust));
        assert_eq!(discogs_payload(&python).and_then(|p| p.get("members")).and_then(Value::as_array).map(Vec::len), Some(1));
    }
}
