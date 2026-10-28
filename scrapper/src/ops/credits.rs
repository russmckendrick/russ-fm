//! `backfill-credits` — store each release's Discogs release credits (`extraartists`:
//! producers, engineers, mixers, session players, sleeve designers) as
//! `raw_data.discogs.credits`, merge per-track credits into its tracklist rows as
//! `extraartists`, then write both into its public album JSON.
//!
//! Resumable: releases that already have stored credits never call Discogs (unless `--force`),
//! so a re-run only fetches what a previous run missed. Releases first scraped by the Python
//! tool keep the full Discogs payload in `raw_data.discogs`, so their credits are mapped from it
//! without a request. Every release with stored credits then has its album JSON synced from the
//! DB, so a re-run also repairs files an interrupted run never patched.

use anyhow::{bail, Result};
use serde_json::{json, Value};

use crate::cli::BackfillCreditsArgs;
use crate::credits::{release_credits, stored_credits, stored_payload};
use crate::db::CreditCandidate;
use crate::ops::release::tracklist_from_discogs;
use crate::ops::tracklists::public_tracklist;
use crate::output::{credit_fields, patch_album_fields, Patch};
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::{Config, Db};

/// Where a release's credits come from this run.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Source {
    /// Already stored at `raw_data.discogs.credits`: only the album JSON is synced.
    Stored,
    /// Mapped from the full Discogs payload the Python tool stored (no request).
    Payload,
    /// Fetched from Discogs.
    Fetch,
}

fn source(c: &CreditCandidate, force: bool) -> Source {
    if force {
        Source::Fetch
    } else if stored_credits(&c.raw_data).is_some() {
        Source::Stored
    } else if stored_payload(&c.raw_data).is_some() {
        Source::Payload
    } else {
        Source::Fetch
    }
}

fn key(t: &Value, field: &str) -> String {
    t.get(field).and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase()
}

/// Copy each Discogs row's `extraartists` onto the matching stored tracklist row, keeping every
/// other key (and hand edits) as stored. Rows line up by index when the positions do (the stored
/// tracklist was mapped from the same Discogs list); otherwise a row matches on position and
/// title, then on a position Discogs uses only once. A matched row Discogs credits nothing on
/// loses any stale `extraartists`; an unmatched row is left alone.
fn merge_track_credits(stored: &Value, fresh: &[Value]) -> Value {
    let Some(rows) = stored.as_array() else { return stored.clone() };
    let aligned = rows.len() == fresh.len() && rows.iter().zip(fresh).all(|(a, b)| key(a, "position") == key(b, "position"));
    let merged = rows.iter().enumerate().map(|(i, row)| {
        let (pos, title) = (key(row, "position"), key(row, "title"));
        let matched = if aligned {
            fresh.get(i)
        } else {
            fresh
                .iter()
                .find(|f| !(pos.is_empty() && title.is_empty()) && key(f, "position") == pos && key(f, "title") == title)
                .or_else(|| {
                    let mut same = fresh.iter().filter(|f| !pos.is_empty() && key(f, "position") == pos);
                    match (same.next(), same.next()) {
                        (Some(f), None) => Some(f),
                        _ => None,
                    }
                })
        };
        let mut out = row.clone();
        if let (Some(f), Some(obj)) = (matched, out.as_object_mut()) {
            match f.get("extraartists") {
                Some(extra) => obj.insert("extraartists".into(), extra.clone()),
                None => obj.remove("extraartists"),
            };
        }
        out
    });
    Value::Array(merged.collect())
}

/// Rows carrying per-track credits.
fn credited_tracks(tracklist: &Value) -> usize {
    tracklist.as_array().into_iter().flatten().filter(|t| t.get("extraartists").is_some()).count()
}

pub async fn run(cfg: &Config, args: BackfillCreditsArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates: Vec<CreditCandidate> = db
        .releases_for_credits()?
        .into_iter()
        .filter(|c| args.release.is_empty() || args.release.contains(&c.discogs_id))
        .collect();
    if !args.release.is_empty() && candidates.is_empty() {
        bail!("no release in the database has Discogs id {}", args.release.join(", "));
    }

    let count = |s: Source| candidates.iter().filter(|c| source(c, args.force) == s).count();
    let (stored, from_payload, missing) = (count(Source::Stored), count(Source::Payload), count(Source::Fetch));
    let to_fetch = args.limit.map_or(missing, |l| missing.min(l as usize));

    if args.dry_run {
        crate::say!(
            "[dry-run] {} release(s): {missing} need their credits fetched from Discogs ({to_fetch} this run), {from_payload} mapped from the stored Discogs payload, {stored} already stored.",
            candidates.len(),
        );
        for c in candidates.iter().filter(|c| source(c, args.force) == Source::Fetch).take(to_fetch.min(25)) {
            crate::say!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if to_fetch > 0 && !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    crate::say!(
        "Fetching credits for {to_fetch} release(s) from Discogs and mapping {from_payload} from stored payloads, then syncing album JSON..."
    );

    let album_dir = cfg.releases_dir();
    let (mut fetched, mut mapped, mut failed) = (0usize, 0usize, 0usize);
    let (mut written, mut unchanged, mut no_file) = (0usize, 0usize, 0usize);
    for c in &candidates {
        let mut raw = c.raw_data.clone();
        let mut tracklist = c.tracklist.clone();
        let release = match source(c, args.force) {
            Source::Stored => None,
            Source::Payload => {
                mapped += 1;
                stored_payload(&c.raw_data).cloned()
            }
            Source::Fetch if fetched + failed < to_fetch => {
                super::out::progress(fetched + failed + 1, to_fetch);
                match services.discogs.get_release(&c.discogs_id).await {
                    Ok(r) => {
                        fetched += 1;
                        Some(r)
                    }
                    Err(e) => {
                        crate::say!("[{}] {} — {} ✗ {e}", c.discogs_id, c.artists.join(", "), c.title);
                        failed += 1;
                        continue;
                    }
                }
            }
            // Over this run's --limit: nothing stored yet, so nothing to sync either.
            Source::Fetch => continue,
        };

        if let Some(release) = release {
            let credits = release_credits(&release);
            let merged = merge_track_credits(&c.tracklist, &tracklist_from_discogs(&release));
            if merged != c.tracklist {
                db.set_release_tracklist(&c.discogs_id, &merged)?;
                tracklist = merged;
            }
            if let Some(updated) = db.set_release_discogs_credits(&c.discogs_id, json!(credits))? {
                raw = updated;
            }
            crate::say!(
                "[{}] {} — {} → {} credit(s), {} track(s) with credits",
                c.discogs_id,
                c.artists.join(", "),
                c.title,
                credits.len(),
                credited_tracks(&tracklist)
            );
        }

        if stored_credits(&raw).is_none() {
            continue;
        }
        let mut edits = credit_fields(&raw).to_vec();
        if credited_tracks(&tracklist) > 0 {
            edits.push(("tracklist", Some(public_tracklist(&tracklist))));
        }
        let folder = release_folder_name(&c.title, &c.discogs_id);
        match patch_album_fields(&album_dir, &folder, &edits) {
            Ok(Patch::Written) => written += 1,
            Ok(Patch::Unchanged) => unchanged += 1,
            Ok(Patch::Missing) => no_file += 1,
            Err(e) => {
                crate::say!("✗ {folder}: could not update album JSON: {e}");
                failed += 1;
            }
        }
    }

    crate::say!(
        "\nDone: {fetched} fetched from Discogs, {mapped} mapped from stored payloads, {failed} failed (re-run to retry). Album JSON: {written} updated, {unchanged} already current, {no_file} without a file."
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_aligned_rows_by_index_and_keeps_hand_edits() {
        let stored = json!([
            {"position": "A1", "title": "Beauty And The Beast (edit)", "duration": "3:32", "artists": []},
            {"position": "A2", "title": "Joe The Lion", "duration": "3:05", "artists": [], "extraartists": [{"name": "Stale"}]},
        ]);
        let fresh = vec![
            json!({"position": "A1", "title": "Beauty And The Beast", "extraartists": [{"name": "Robert Fripp"}]}),
            json!({"position": "A2", "title": "Joe The Lion"}),
        ];
        let merged = merge_track_credits(&stored, &fresh);
        assert_eq!(merged[0]["title"], "Beauty And The Beast (edit)");
        assert_eq!(merged[0]["extraartists"], json!([{"name": "Robert Fripp"}]));
        assert!(merged[1].get("extraartists").is_none());
    }

    #[test]
    fn merges_misaligned_rows_by_position_and_title() {
        let stored = json!([
            {"position": "1", "title": "Opener"},
            {"position": "1", "title": "Second Disc Opener"},
            {"position": "2", "title": "Hand Retitled"},
        ]);
        let fresh = vec![
            json!({"position": "", "title": "Disc One", "type": "heading"}),
            json!({"position": "1", "title": "Opener", "extraartists": [{"name": "A"}]}),
            json!({"position": "1", "title": "Second Disc Opener", "extraartists": [{"name": "B"}]}),
            json!({"position": "2", "title": "Original Title", "extraartists": [{"name": "C"}]}),
        ];
        let merged = merge_track_credits(&stored, &fresh);
        assert_eq!(merged[0]["extraartists"], json!([{"name": "A"}]));
        assert_eq!(merged[1]["extraartists"], json!([{"name": "B"}]));
        assert_eq!(merged[2]["extraartists"], json!([{"name": "C"}]));
        assert_eq!(credited_tracks(&merged), 3);
    }
}
