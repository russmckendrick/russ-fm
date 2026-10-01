//! `backfill-videos` — fill in the video sources behind tv.json, then regenerate it.
//!
//! - default: each release's own Discogs videos — the URL list (`videos` column + album JSON)
//!   and the full objects at `raw_data.discogs.videos`, which tv.json reads.
//! - `--masters`: the Discogs master's `videos[]` at `raw_data.discogs.master_videos`. A master
//!   collects the videos of every edition, so it usually lists far more than one pressing.
//! - `--theaudiodb`: each artist's official music videos from TheAudioDB, at the artist's
//!   `raw_data.theaudiodb_videos`; tv.json matches them to records by album or track title.
//!
//! - `--check`: check every video tv.json could list against YouTube's embed page and cache
//!   the verdict (`video_playability`), so private, deleted and embed-blocked videos are left
//!   out. Unchecked ids and ids last checked over 30 days ago; `--force` rechecks them all.
//!
//! All are resumable: rows already done are skipped unless `--force`. Each one ends by checking
//! any video ids it added, then regenerating collection.json and tv.json.

use std::collections::HashMap;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use crate::cli::BackfillVideosArgs;
use crate::sanitize::release_folder_name;
use crate::services::discogs::DiscogsService;
use crate::services::http::{ServiceError, ServiceResult};
use crate::services::theaudiodb::TheAudioDbService;
use crate::services::Services;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: BackfillVideosArgs) -> Result<()> {
    if args.check {
        let db = Db::open(cfg.db_path())?;
        let scope = if args.force { CheckScope::All } else { CheckScope::Stale(RECHECK_DAYS) };
        if args.dry_run {
            let ids = ids_to_check(cfg, &db, scope, args.limit)?;
            println!("[dry-run] {} video id(s) to check.", ids.len());
            return Ok(());
        }
        let services = Services::new(cfg);
        let summary = check_playability(cfg, &db, &services, scope, args.limit).await?;
        return regenerate(cfg, &db, summary.checked);
    }
    if args.masters {
        return run_masters(cfg, &args).await;
    }
    if args.theaudiodb {
        return run_theaudiodb(cfg, &args).await;
    }
    let db = Db::open(cfg.db_path())?;

    if args.dry_run {
        let candidates = db.releases_for_backfill(args.force, args.limit, args.from.as_deref())?;
        println!("[dry-run] {} release(s) to check for videos:", candidates.len());
        for r in candidates.iter().take(25) {
            println!("  [{}] {} — {}", r.discogs_id.as_deref().unwrap_or("?"), r.artists.join(", "), r.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }

    let candidates = db.releases_for_backfill(args.force, args.limit, args.from.as_deref())?;
    let total = candidates.len();
    println!("Backfilling videos for {total} release(s)...");
    let album_dir = cfg.releases_dir();

    let mut updated = 0usize;
    let mut with_videos = 0usize;
    for (i, r) in candidates.iter().enumerate() {
        let Some(discogs_id) = r.discogs_id.as_deref() else { continue };
        match services.discogs.get_release(discogs_id).await {
            Ok(release) => {
                let videos = DiscogsService::extract_video_uris(&release);
                let n = videos.len();
                let videos_json = json!(videos);
                db.update_release_videos(discogs_id, &videos_json.to_string())?;
                db.merge_release_discogs(discogs_id, [("videos", DiscogsService::videos_of(&release))], false)?;
                let folder = release_folder_name(&r.title, discogs_id);
                // Order-preserving, and no write when the list is unchanged.
                let _ = crate::output::json::patch_album_fields(&album_dir, &folder, &[("videos", Some(videos_json))]);
                updated += 1;
                if n > 0 {
                    with_videos += 1;
                }
                println!("[{}/{total}] {} — {} ({n} videos)", i + 1, r.artists.join(", "), r.title);
            }
            Err(e) => println!("[{}/{total}] ✗ {} — {e}", i + 1, discogs_id),
        }
        pause_between_batches(&args, i, total).await;
    }

    println!("\nDone: checked {updated}, {with_videos} had videos.");
    check_then_regenerate(cfg, &db, &services, updated).await
}

/// `--masters`: store each release's Discogs master videos. Masters shared by several releases
/// are fetched once per run; releases without a stored `master_id` fetch the release first.
async fn run_masters(cfg: &Config, args: &BackfillVideosArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates = db.releases_for_master_videos(args.force, args.limit)?;
    let total = candidates.len();
    let need_release = candidates.iter().filter(|c| c.master_id.is_none()).count();

    if args.dry_run {
        println!("[dry-run] {total} release(s) to fetch master videos for ({need_release} without a stored master_id):");
        for c in candidates.iter().take(25) {
            println!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    println!("Fetching master videos for {total} release(s) ({need_release} need a release lookup first)...");

    let mut masters: HashMap<String, Value> = HashMap::new();
    let (mut stored, mut no_master, mut failed, mut found) = (0usize, 0usize, 0usize, 0usize);
    for (i, c) in candidates.iter().enumerate() {
        let label = format!("[{}/{total}] {} — {}", i + 1, c.artists.join(", "), c.title);

        let master_id = match &c.master_id {
            Some(m) => Some(m.clone()),
            None => match services.discogs.get_release(&c.discogs_id).await {
                Ok(release) => {
                    // Worth keeping while we have it: the pressing's own video objects.
                    db.merge_release_discogs(&c.discogs_id, [("videos", DiscogsService::videos_of(&release))], false)?;
                    DiscogsService::master_id_of(&release)
                }
                Err(e) => {
                    println!("{label} ✗ release lookup failed: {e}");
                    failed += 1;
                    continue;
                }
            },
        };
        let Some(master_id) = master_id else {
            db.merge_release_discogs(&c.discogs_id, [("master_id", Value::Null), ("master_videos", json!([]))], false)?;
            no_master += 1;
            println!("{label} · no master");
            continue;
        };

        let videos = match masters.get(&master_id) {
            Some(v) => v.clone(),
            None => match services.discogs.master(&master_id).await {
                Ok(master) => {
                    let v = DiscogsService::videos_of(&master);
                    masters.insert(master_id.clone(), v.clone());
                    v
                }
                // A stale master (merged or deleted upstream): record it as empty so the run
                // moves on; `backfill-original-years --force` re-points the release.
                Err(ServiceError::NotFound) => {
                    println!("{label} · master {master_id} is gone");
                    json!([])
                }
                Err(e) => {
                    println!("{label} ✗ master {master_id} lookup failed: {e}");
                    failed += 1;
                    continue;
                }
            },
        };
        let n = videos.as_array().map_or(0, Vec::len);
        let id_value = master_id.parse::<i64>().map(Value::from).unwrap_or_else(|_| Value::from(master_id.clone()));
        db.merge_release_discogs(&c.discogs_id, [("master_id", id_value), ("master_videos", videos)], false)?;
        stored += 1;
        if n > 0 {
            found += 1;
        }
        println!("{label} → {n} master video(s)");
        pause_between_batches(args, i, total).await;
    }

    println!("\nDone: {stored} stored ({found} with videos), {no_master} without a master, {failed} failed (re-run to retry).");
    check_then_regenerate(cfg, &db, &services, stored + no_master).await
}

/// `--theaudiodb`: store each artist's TheAudioDB music videos.
async fn run_theaudiodb(cfg: &Config, args: &BackfillVideosArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates = db.artists_for_theaudiodb_videos(args.force, args.limit)?;
    let total = candidates.len();

    if args.dry_run {
        println!("[dry-run] {total} artist(s) with a TheAudioDB id to fetch music videos for:");
        for (_, name, tadb_id) in candidates.iter().take(25) {
            println!("  [{tadb_id}] {name}");
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    println!("Fetching TheAudioDB music videos for {total} artist(s)...");
    let (mut stored, mut found, mut videos_total, mut failed) = (0usize, 0usize, 0usize, 0usize);
    for (i, (artist_id, name, tadb_id)) in candidates.iter().enumerate() {
        match theaudiodb_videos(&services, tadb_id).await {
            Ok(videos) => {
                let n = videos.as_array().map_or(0, Vec::len);
                db.set_artist_raw_key(artist_id, "theaudiodb_videos", videos)?;
                stored += 1;
                videos_total += n;
                if n > 0 {
                    found += 1;
                }
                println!("[{}/{total}] {name} → {n} video(s)", i + 1);
            }
            Err(e) => {
                failed += 1;
                println!("[{}/{total}] ✗ {name} — {e}", i + 1);
            }
        }
        pause_between_batches(args, i, total).await;
    }

    println!("\nDone: {stored} artist(s) stored, {found} with videos ({videos_total} in all), {failed} failed (re-run to retry).");
    check_then_regenerate(cfg, &db, &services, stored).await
}

/// After a new release is saved: refetch the TheAudioDB music videos of its headline artists,
/// so a new album's videos (often added to TheAudioDB after the artist was last fetched)
/// reach tv.json. An artist with no TheAudioDB id yet (a brand-new artist, seeded by
/// `save_release`) is looked up by name first, and the match is kept only when the names
/// agree, then stored as `raw_data.theaudiodb`. Failures are logged, never fatal. Returns the
/// number of artists updated.
pub async fn refresh_release_artist_videos(services: &Services, db: &Db, rec: &crate::db::ReleaseRecord) -> usize {
    let credits = rec.artists.as_array().cloned().unwrap_or_default();
    let mut updated = 0;
    for credit in crate::credits::headliners(&credits) {
        let name = credit.get("name").and_then(|n| n.as_str()).unwrap_or("").trim();
        if name.is_empty() || plain_name(name) == "various" {
            continue;
        }
        let by_id = credit
            .get("discogs_id")
            .and_then(|d| d.as_str())
            .and_then(|d| db.get_artist_by_discogs_id(d).ok().flatten());
        let Some(artist) = by_id.or_else(|| db.get_artist_by_name(name).ok().flatten()) else { continue };

        let stored = artist.raw_data.get("theaudiodb").and_then(TheAudioDbService::artist_id_of);
        let tadb_id = match stored {
            Some(id) => id,
            None => match services.theaudiodb.search_artist(&artist.name).await {
                Ok(resp) => {
                    let found = resp.get("artists").and_then(|a| a.as_array()).and_then(|a| a.first()).cloned();
                    let matched = found.filter(|f| {
                        f.get("strArtist").and_then(|s| s.as_str()).is_some_and(|s| plain_name(s) == plain_name(&artist.name))
                    });
                    let Some(block) = matched else { continue };
                    let Some(id) = TheAudioDbService::artist_id_of(&block) else { continue };
                    if let Err(e) = db.set_artist_raw_key(&artist.id, "theaudiodb", block) {
                        tracing::warn!("storing TheAudioDB match for {}: {e}", artist.name);
                        continue;
                    }
                    id
                }
                Err(e) => {
                    tracing::warn!("TheAudioDB search for {}: {e}", artist.name);
                    continue;
                }
            },
        };
        match theaudiodb_videos(services, &tadb_id).await {
            Ok(videos) => match db.set_artist_raw_key(&artist.id, "theaudiodb_videos", videos) {
                Ok(_) => updated += 1,
                Err(e) => tracing::warn!("storing TheAudioDB videos for {}: {e}", artist.name),
            },
            Err(e) => tracing::warn!("TheAudioDB videos for {}: {e}", artist.name),
        }
    }
    updated
}

/// Lowercase alphanumerics, `&` as "and", no leading "The" — for comparing artist names.
fn plain_name(s: &str) -> String {
    let lower = s.to_lowercase().replace('&', " and ");
    let lower = lower.trim_start();
    let lower = lower.strip_prefix("the ").unwrap_or(lower);
    lower.chars().filter(|c| c.is_alphanumeric()).collect()
}

/// An artist's TheAudioDB music videos in the stored `raw_data.theaudiodb_videos` shape:
/// `{ id, uri, track, album }`, `album` resolved from the artist's album list (null when
/// TheAudioDB doesn't link one). The album list is only fetched when there are videos.
pub async fn theaudiodb_videos(services: &Services, tadb_id: &str) -> ServiceResult<Value> {
    let resp = services.theaudiodb.get_music_videos(tadb_id).await?;
    let mvids = resp.get("mvids").and_then(|m| m.as_array()).cloned().unwrap_or_default();
    if mvids.is_empty() {
        return Ok(json!([]));
    }
    let albums: HashMap<String, String> = services
        .theaudiodb
        .get_artist_albums(tadb_id)
        .await?
        .get("album")
        .and_then(|a| a.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|a| Some((str_of(a, "idAlbum")?, str_of(a, "strAlbum")?)))
                .collect()
        })
        .unwrap_or_default();
    let videos: Vec<Value> = mvids
        .iter()
        .filter_map(|v| {
            let uri = str_of(v, "strMusicVid")?;
            let album = str_of(v, "idAlbum").and_then(|id| albums.get(&id).cloned());
            Some(json!({ "id": str_of(v, "idTrack"), "uri": uri, "track": str_of(v, "strTrack"), "album": album }))
        })
        .collect();
    Ok(Value::Array(videos))
}

fn str_of(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Pause between batches when requested (headless-friendly).
async fn pause_between_batches(args: &BackfillVideosArgs, i: usize, total: usize) {
    if let Some(pause) = args.pause {
        if (i + 1).is_multiple_of(args.batch_size as usize) && i + 1 < total {
            println!("  …pausing {pause}s between batches");
            tokio::time::sleep(std::time::Duration::from_secs(pause)).await;
        }
    }
}

/// Re-check playable videos after this many days (`--check` without `--force`).
const RECHECK_DAYS: i64 = 30;
/// Embed pages fetched at once (the YouTube client also rate-limits).
const CHECK_CONCURRENCY: usize = 8;

/// Which video ids a playability check covers.
#[derive(Clone, Copy)]
pub enum CheckScope {
    /// Never checked.
    New,
    /// Never checked, or last checked more than this many days ago.
    Stale(i64),
    All,
}

#[derive(Default)]
pub struct CheckSummary {
    pub checked: usize,
    pub unplayable: usize,
    pub failed: usize,
    /// YouTube asked for a bot check, so the run stopped early.
    pub stopped: bool,
}

fn ids_to_check(cfg: &Config, db: &Db, scope: CheckScope, limit: Option<u32>) -> Result<Vec<String>> {
    let releases = db.get_all_releases()?;
    let artist_videos = db.theaudiodb_artist_videos()?;
    let known = db.video_playability()?;
    let cutoff = match scope {
        CheckScope::Stale(days) => Some((chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339()),
        _ => None,
    };
    let mut ids: Vec<String> = crate::output::tv::candidate_ids(cfg, &releases, &artist_videos)
        .into_iter()
        .filter(|id| match (scope, known.get(id)) {
            (CheckScope::All, _) | (_, None) => true,
            (CheckScope::New, Some(_)) => false,
            (CheckScope::Stale(_), Some((_, at))) => cutoff.as_deref().is_some_and(|c| at.as_str() < c),
        })
        .collect();
    ids.sort();
    if let Some(l) = limit {
        ids.truncate(l as usize);
    }
    Ok(ids)
}

/// Check video ids against YouTube's embed page and cache each verdict. Stops early (keeping
/// what it has) if YouTube starts asking for a bot check.
pub async fn check_playability(
    cfg: &Config,
    db: &Db,
    services: &Services,
    scope: CheckScope,
    limit: Option<u32>,
) -> Result<CheckSummary> {
    use futures::stream::{self, StreamExt};
    use crate::services::youtube::Playability;

    let ids = ids_to_check(cfg, db, scope, limit)?;
    let total = ids.len();
    let mut summary = CheckSummary::default();
    if total == 0 {
        return Ok(summary);
    }
    println!("Checking {total} video(s) on YouTube...");
    let mut results = stream::iter(ids)
        .map(|id| async move {
            let r = services.youtube.playability(&id).await;
            (id, r)
        })
        .buffer_unordered(CHECK_CONCURRENCY);
    while let Some((id, result)) = results.next().await {
        match result {
            Ok(Playability::Playable) => {
                db.set_video_playability(&id, true, None)?;
                summary.checked += 1;
            }
            Ok(Playability::Unplayable(detail)) => {
                db.set_video_playability(&id, false, Some(&detail))?;
                summary.checked += 1;
                summary.unplayable += 1;
            }
            Err(ServiceError::RateLimited) => {
                summary.stopped = true;
                break;
            }
            Err(e) => {
                summary.failed += 1;
                tracing::warn!("youtube {id}: {e}");
            }
        }
        let done = summary.checked + summary.failed;
        if done % 500 == 0 {
            println!("  …{done}/{total} checked, {} unplayable", summary.unplayable);
        }
    }
    println!(
        "Checked {} video(s): {} unplayable, {} failed{}.",
        summary.checked,
        summary.unplayable,
        summary.failed,
        if summary.stopped { " — stopped early: YouTube asked for a bot check, re-run later" } else { "" }
    );
    Ok(summary)
}

/// Check any video ids nobody has checked yet, then rewrite collection.json and tv.json.
async fn check_then_regenerate(cfg: &Config, db: &Db, services: &Services, changed: usize) -> Result<()> {
    let checked = match check_playability(cfg, db, services, CheckScope::New, None).await {
        Ok(s) => s.checked,
        Err(e) => {
            println!("Warning: video playability check failed: {e}");
            0
        }
    };
    regenerate(cfg, db, changed + checked)
}

/// Rewrite collection.json and tv.json when anything changed.
fn regenerate(cfg: &Config, db: &Db, changed: usize) -> Result<()> {
    if changed > 0 {
        let n = crate::output::collection::regenerate(cfg, db)?;
        println!("Regenerated collection.json and tv.json ({n} entries).");
    }
    Ok(())
}
