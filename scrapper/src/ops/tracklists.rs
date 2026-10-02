//! `backfill-tracklists` — re-map the tracklist of releases stored before headings and suites
//! were told apart, then patch it into their public album JSON.
//!
//! Older records kept only `position/title/duration/artists` from each top-level Discogs row,
//! so a suite (Discogs `type_: "index"`, e.g. Rush's "2112") was stored as a bare position-less
//! title with its movements (`sub_tracks`) dropped, indistinguishable from a side heading. The
//! raw Discogs tracklist isn't kept, so each such release is fetched again.
//!
//! Resumable: only releases with a position-less row that has no `type` yet are fetched
//! (unless `--force`), and every fetched heading or suite gets one, so a re-run only fetches
//! what a previous run missed. Every release with a typed tracklist then has its album JSON
//! synced from the DB, so a re-run also repairs files an interrupted run never patched.

use anyhow::{bail, Result};
use serde_json::Value;

use crate::cli::BackfillTracklistsArgs;
use crate::db::TracklistCandidate;
use crate::output::{patch_album_fields, Patch};
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::{Config, Db};

/// A position-less row not yet typed as a heading or suite: could be either.
fn has_untyped_header(tracklist: &Value) -> bool {
    tracklist.as_array().into_iter().flatten().any(|t| {
        t.get("position").and_then(|p| p.as_str()).unwrap_or("").trim().is_empty()
            && t.get("type").is_none()
            && t.get("parent").is_none()
    })
}

/// The tracklist has been mapped with row kinds (a heading, a suite or a movement).
fn is_typed(tracklist: &Value) -> bool {
    tracklist.as_array().into_iter().flatten().any(|t| t.get("type").is_some() || t.get("parent").is_some())
}

/// The public JSON form of a stored tracklist, key-sorted like every full album JSON write so
/// only real changes show in the diff.
fn public_tracklist(tracklist: &Value) -> Value {
    Value::Array(
        tracklist
            .as_array()
            .into_iter()
            .flatten()
            .map(|t| crate::output::json::sort_value(&crate::output::json::track(t)))
            .collect(),
    )
}

/// Movements found in a tracklist (rows under a suite).
fn movements(tracklist: &[Value]) -> usize {
    tracklist.iter().filter(|t| t.get("parent").is_some()).count()
}

pub async fn run(cfg: &Config, args: BackfillTracklistsArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates: Vec<TracklistCandidate> = db
        .releases_for_tracklists()?
        .into_iter()
        .filter(|c| args.force || has_untyped_header(&c.tracklist))
        .collect();
    let album_dir = cfg.releases_dir();
    let to_fetch = args.limit.map_or(candidates.len(), |l| candidates.len().min(l as usize));

    if args.dry_run {
        println!("[dry-run] {} release(s) have untyped position-less rows ({to_fetch} this run).", candidates.len());
        for c in candidates.iter().take(to_fetch.min(25)) {
            println!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if to_fetch > 0 && !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    println!("Re-fetching the tracklist of {to_fetch} release(s) from Discogs...");

    let (mut fetched, mut failed, mut suites) = (0usize, 0usize, 0usize);
    for (i, c) in candidates.iter().take(to_fetch).enumerate() {
        let label = format!("[{}/{to_fetch}] {} — {}", i + 1, c.artists.join(", "), c.title);
        let release = match services.discogs.get_release(&c.discogs_id).await {
            Ok(r) => r,
            Err(e) => {
                println!("{label} ✗ {e}");
                failed += 1;
                continue;
            }
        };
        let tracklist = crate::ops::release::tracklist_from_discogs(&release);
        if tracklist.is_empty() {
            // Never trade a stored tracklist for nothing.
            println!("{label} ✗ Discogs returned no tracklist");
            failed += 1;
            continue;
        }
        let n = movements(&tracklist);
        db.set_release_tracklist(&c.discogs_id, &Value::Array(tracklist))?;
        fetched += 1;
        if n > 0 {
            suites += 1;
            println!("{label} → {n} movement(s)");
        } else {
            println!("{label}");
        }
    }

    // Sync every typed tracklist into its album JSON: this run's and any an earlier run fetched.
    let (mut written, mut unchanged, mut no_file) = (0usize, 0usize, 0usize);
    for c in db.releases_for_tracklists()?.into_iter().filter(|c| is_typed(&c.tracklist)) {
        let folder = release_folder_name(&c.title, &c.discogs_id);
        match patch_album_fields(&album_dir, &folder, &[("tracklist", Some(public_tracklist(&c.tracklist)))]) {
            Ok(Patch::Written) => written += 1,
            Ok(Patch::Unchanged) => unchanged += 1,
            Ok(Patch::Missing) => no_file += 1,
            Err(e) => {
                println!("✗ {folder}: could not update album JSON: {e}");
                failed += 1;
            }
        }
    }

    println!(
        "\nDone: {fetched} fetched from Discogs ({suites} with suites), {failed} failed (re-run to retry). Album JSON: {written} updated, {unchanged} already current, {no_file} without a file."
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn untyped_position_less_rows_need_a_refetch() {
        assert!(has_untyped_header(&json!([{"position": "", "title": "2112"}, {"position": "B1", "title": "Lessons"}])));
        assert!(!has_untyped_header(&json!([
            {"position": "", "title": "2112", "type": "index"},
            {"position": "A-I", "title": "Overture", "parent": "2112"},
            {"position": "", "title": "Bonus Tracks", "type": "heading"}
        ])));
        assert!(!has_untyped_header(&json!([{"position": "A1", "title": "Airbag"}])));
    }
}
