//! `backfill-tracklists` — re-map the tracklist of releases stored before headings and suites
//! were told apart, then patch it into their public album JSON.
//!
//! Older records kept only `position/title/duration/artists` from each top-level Discogs row,
//! so a suite (Discogs `type_: "index"`, e.g. Rush's "2112") was stored as a bare position-less
//! title with its movements (`sub_tracks`) dropped, indistinguishable from a side heading. The
//! raw Discogs tracklist isn't kept, so each such release is fetched again.
//!
//! The old scrapper also dropped the per-track artists of compilations credited to "Various",
//! so their tracks can only be shown and scrobbled as "Various"; those are fetched again too.
//!
//! Resumable: only releases with a position-less row that has no `type` yet, or a compilation
//! with no track artists, are fetched (unless `--force`), and every fetched heading or suite
//! gets a type, so a re-run only fetches what a previous run missed. Every release with a typed
//! tracklist or credited compilation tracks then has its album JSON synced from the DB, so a
//! re-run also repairs files an interrupted run never patched.

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

/// Some track carries its own artist credit.
fn has_track_artists(tracklist: &Value) -> bool {
    tracklist
        .as_array()
        .into_iter()
        .flatten()
        .any(|t| t.get("artists").and_then(Value::as_array).is_some_and(|a| !a.is_empty()))
}

/// Credited to Discogs' "Various" placeholder: a compilation.
fn is_compilation(c: &TracklistCandidate) -> bool {
    c.artists.iter().any(|a| super::is_various(a))
}

/// The tracklist has been mapped with row kinds (a heading, a suite or a movement).
fn is_typed(tracklist: &Value) -> bool {
    tracklist.as_array().into_iter().flatten().any(|t| t.get("type").is_some() || t.get("parent").is_some())
}

/// The public JSON form of a stored tracklist, key-sorted like every full album JSON write so
/// only real changes show in the diff.
pub(crate) fn public_tracklist(tracklist: &Value) -> Value {
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
        .filter(|c| args.force || has_untyped_header(&c.tracklist) || (is_compilation(c) && !has_track_artists(&c.tracklist)))
        .collect();
    let album_dir = cfg.releases_dir();
    let to_fetch = args.limit.map_or(candidates.len(), |l| candidates.len().min(l as usize));

    if args.dry_run {
        crate::say!(
            "[dry-run] {} release(s) have untyped position-less rows or uncredited compilation tracks ({to_fetch} this run).",
            candidates.len()
        );
        for c in candidates.iter().take(to_fetch.min(25)) {
            crate::say!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if to_fetch > 0 && !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    crate::say!("Re-fetching the tracklist of {to_fetch} release(s) from Discogs...");

    let (mut fetched, mut failed, mut suites, mut credited) = (0usize, 0usize, 0usize, 0usize);
    for (i, c) in candidates.iter().take(to_fetch).enumerate() {
        super::out::progress(i + 1, to_fetch);
        let label = format!("[{}/{to_fetch}] {} — {}", i + 1, c.artists.join(", "), c.title);
        let release = match services.discogs.get_release(&c.discogs_id).await {
            Ok(r) => r,
            Err(e) => {
                crate::say!("{label} ✗ {e}");
                failed += 1;
                continue;
            }
        };
        let tracklist = crate::ops::release::tracklist_from_discogs(&release);
        if tracklist.is_empty() {
            // Never trade a stored tracklist for nothing.
            crate::say!("{label} ✗ Discogs returned no tracklist");
            failed += 1;
            continue;
        }
        let n = movements(&tracklist);
        let tracklist = Value::Array(tracklist);
        let newly_credited = is_compilation(c) && !has_track_artists(&c.tracklist) && has_track_artists(&tracklist);
        db.set_release_tracklist(&c.discogs_id, &tracklist)?;
        fetched += 1;
        if newly_credited {
            credited += 1;
            crate::say!("{label} → track artists");
        } else if n > 0 {
            suites += 1;
            crate::say!("{label} → {n} movement(s)");
        } else {
            crate::say!("{label}");
        }
    }

    // Sync every typed tracklist into its album JSON: this run's and any an earlier run fetched.
    let (mut written, mut unchanged, mut no_file) = (0usize, 0usize, 0usize);
    let synced = |c: &TracklistCandidate| is_typed(&c.tracklist) || (is_compilation(c) && has_track_artists(&c.tracklist));
    for c in db.releases_for_tracklists()?.into_iter().filter(synced) {
        let folder = release_folder_name(&c.title, &c.discogs_id);
        match patch_album_fields(&album_dir, &folder, &[("tracklist", Some(public_tracklist(&c.tracklist)))]) {
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
        "\nDone: {fetched} fetched from Discogs ({suites} with suites, {credited} compilations credited), {failed} failed (re-run to retry). Album JSON: {written} updated, {unchanged} already current, {no_file} without a file."
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

    #[test]
    fn compilations_without_track_artists_need_a_refetch() {
        let candidate = |artists: &[&str], tracklist: Value| TracklistCandidate {
            discogs_id: "1".into(),
            title: "Help".into(),
            artists: artists.iter().map(|a| a.to_string()).collect(),
            tracklist,
        };
        let bare = json!([{"position": "A1", "title": "Come Together", "artists": []}]);
        let credited = json!([{"position": "A1", "title": "Come Together", "artists": [{"name": "Smokin' Mojo Filters"}]}]);
        assert!(is_compilation(&candidate(&["Various"], bare.clone())) && !has_track_artists(&bare));
        assert!(has_track_artists(&credited));
        assert!(!is_compilation(&candidate(&["Radiohead"], bare)));
        assert!(is_compilation(&candidate(&["Max Richter", "Various"], credited)));
    }
}
