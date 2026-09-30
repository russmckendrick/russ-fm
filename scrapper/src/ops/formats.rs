//! `backfill-formats` — store each release's Discogs `formats[]` (vinyl colour lives in a
//! format's `text`) as `raw_data.discogs.formats`, then write `format_details` / `vinyl_colours`
//! into its public album JSON and regenerate collection.json.
//!
//! Resumable: releases that already have stored formats never call Discogs (unless `--force`),
//! so a re-run only fetches what a previous run missed. Every release's album JSON is still
//! synced from the DB — that is how releases scraped by the old Python tool, whose full Discogs
//! payload is already stored, reach the public files without a single request.

use anyhow::{bail, Result};
use serde_json::json;

use crate::cli::BackfillFormatsArgs;
use crate::db::FormatCandidate;
use crate::output::{format_fields, patch_album_fields, Patch};
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: BackfillFormatsArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates = db.releases_for_formats()?;

    let needs_fetch = |c: &FormatCandidate| args.force || crate::formats::details_from_raw(&c.raw_data).is_none();
    let missing = candidates.iter().filter(|c| needs_fetch(c)).count();
    let to_fetch = args.limit.map_or(missing, |l| missing.min(l as usize));
    let coloured = candidates.iter().filter(|c| !crate::formats::vinyl_colours(&c.raw_data).is_empty()).count();

    if args.dry_run {
        println!(
            "[dry-run] {} release(s): {missing} need their formats fetched from Discogs ({to_fetch} this run), {} already stored ({coloured} coloured).",
            candidates.len(),
            candidates.len() - missing,
        );
        for c in candidates.iter().filter(|c| needs_fetch(c)).take(to_fetch.min(25)) {
            println!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if to_fetch > 0 && !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    println!("Fetching formats for {to_fetch} release(s) from Discogs, then syncing {} album JSON file(s)...", candidates.len());

    let album_dir = cfg.releases_dir();
    let (mut fetched, mut failed) = (0usize, 0usize);
    let (mut written, mut unchanged, mut no_file) = (0usize, 0usize, 0usize);
    for c in &candidates {
        let mut raw = c.raw_data.clone();
        if needs_fetch(c) && fetched + failed < to_fetch {
            let label = format!("[{}/{to_fetch}] {} — {}", fetched + failed + 1, c.artists.join(", "), c.title);
            match services.discogs.get_release(&c.discogs_id).await {
                Ok(release) => {
                    let formats = release.get("formats").cloned().unwrap_or(json!([]));
                    if let Some(updated) = db.set_release_discogs_formats(&c.discogs_id, formats)? {
                        raw = updated;
                    }
                    fetched += 1;
                    let colours = crate::formats::vinyl_colours(&raw);
                    if colours.is_empty() {
                        println!("{label}");
                    } else {
                        println!("{label} → {}", colours.join(", "));
                    }
                }
                Err(e) => {
                    println!("{label} ✗ {e}");
                    failed += 1;
                    continue;
                }
            }
        }

        let folder = release_folder_name(&c.title, &c.discogs_id);
        match patch_album_fields(&album_dir, &folder, &format_fields(&raw)) {
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
        "\nDone: {fetched} fetched from Discogs, {failed} failed (re-run to retry). Album JSON: {written} updated, {unchanged} already current, {no_file} without a file."
    );
    let n = crate::output::collection::regenerate(cfg, &db)?;
    println!("Regenerated collection.json ({n} entries).");
    Ok(())
}
