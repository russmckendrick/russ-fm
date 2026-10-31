//! Collection-vs-filesystem maintenance — folds in `tools/find_missing_artists.py` and
//! `tools/artist_folder_reconciler.py`, plus the band-member credit backfill and the "Various"
//! reset. Pure local: database + filesystem + sanitizer, no APIs.

use std::collections::HashSet;

use anyhow::{bail, Result};
use serde_json::{json, Map, Value};

use crate::cli::MaintenanceCommand;
use crate::sanitize::sanitize_folder_name;
use crate::{Config, Db};

pub fn run(cfg: &Config, cmd: MaintenanceCommand) -> Result<()> {
    match cmd {
        MaintenanceCommand::FindMissing { limit, show_orphaned } => find_missing(cfg, limit, show_orphaned),
        MaintenanceCommand::Reconcile { threshold } => reconcile(cfg, threshold),
        MaintenanceCommand::BandMembers { dry_run } => band_members(cfg, dry_run),
        MaintenanceCommand::Various { dry_run } => reset_various(cfg, dry_run),
    }
}

/// The "Various" page's own line: Discogs has no profile for its placeholder.
pub const VARIOUS_BIOGRAPHY: &str = "Soundtracks, tributes, label samplers and the odd Now album. Everything here is credited to more than one artist, so it's filed together rather than under any one name.";

/// Clear what the old scrapper matched by name onto Discogs' "Various" placeholder (a dubstep
/// duo's biography, Apple Music, Spotify and Last.fm links, a stray album cover as its photo).
/// The Discogs ID, hand-set overrides and the photo files on disk are kept.
fn clear_various(rec: &mut crate::db::ArtistRecord) {
    rec.biography = Some(VARIOUS_BIOGRAPHY.into());
    rec.apple_music_id = None;
    rec.apple_music_url = None;
    rec.spotify_id = None;
    rec.spotify_url = None;
    rec.lastfm_mbid = None;
    rec.lastfm_url = None;
    rec.wikipedia_url = None;
    rec.genres = json!([]);
    rec.popularity = None;
    rec.followers = None;
    rec.country = None;
    rec.formed_date = None;
    rec.images = json!([]);
    rec.enrichment_data = json!({});
    let kept: Map<String, Value> = rec
        .raw_data
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(k, _)| matches!(k.as_str(), "discogs" | "overrides"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    rec.raw_data = Value::Object(kept);
}

fn reset_various(cfg: &Config, dry_run: bool) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let Some(mut rec) = db.get_artist_by_name("Various")? else { bail!("No \"Various\" artist in the database") };
    let before = rec.clone();
    clear_various(&mut rec);
    let cleared: Vec<&str> = [
        ("biography", before.biography != rec.biography),
        ("Apple Music", before.apple_music_id.is_some()),
        ("Spotify", before.spotify_id.is_some()),
        ("Last.fm", before.lastfm_url.is_some() || before.lastfm_mbid.is_some()),
        ("Wikipedia", before.wikipedia_url.is_some()),
        ("remote photos", before.images.as_array().is_some_and(|a| !a.is_empty())),
        ("raw service data", before.raw_data != rec.raw_data),
    ]
    .into_iter()
    .filter_map(|(label, changed)| changed.then_some(label))
    .collect();
    if cleared.is_empty() {
        crate::say!("\"Various\" is already clean.");
        return Ok(());
    }
    crate::say!("{}\"Various\": clearing {}.", if dry_run { "[dry-run] " } else { "" }, cleared.join(", "));
    if dry_run {
        return Ok(());
    }
    let releases = crate::ops::artist::persist_artist(cfg, &db, &rec)?;
    let entries = crate::output::collection::regenerate(cfg, &db)?;
    crate::say!("Rewrote its JSON, {releases} album JSON(s) and collection.json ({entries} entries).");
    Ok(())
}

/// Folder slugs present under `public/artist`.
fn existing_artist_folders(cfg: &Config) -> HashSet<String> {
    let mut set = HashSet::new();
    if let Ok(rd) = std::fs::read_dir(cfg.artists_dir()) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                set.insert(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    set
}

fn find_missing(cfg: &Config, limit: Option<u32>, show_orphaned: bool) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let folders = existing_artist_folders(cfg);
    let artists = db.list_artists(u32::MAX, "name")?;

    let mut db_slugs = HashSet::new();
    let mut missing = Vec::new();
    for a in &artists {
        let slug = sanitize_folder_name(&a.name);
        db_slugs.insert(slug.clone());
        if !folders.contains(&slug) {
            missing.push((a.name.clone(), slug));
        }
    }

    crate::say!("Artists in DB: {}, folders on disk: {}", artists.len(), folders.len());
    crate::say!("\nMissing folders ({}):", missing.len());
    let shown = limit.map(|l| l as usize).unwrap_or(missing.len());
    for (name, slug) in missing.iter().take(shown) {
        crate::say!("  {name}  ->  {slug}");
    }

    if show_orphaned {
        let orphaned: Vec<&String> = folders.iter().filter(|f| !db_slugs.contains(*f)).collect();
        crate::say!("\nOrphaned folders ({}):", orphaned.len());
        for f in orphaned.iter().take(shown) {
            crate::say!("  {f}");
        }
    }
    Ok(())
}

/// Simple Sørensen-Dice bigram similarity over slug strings.
fn similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let bigrams = |s: &str| -> Vec<[char; 2]> {
        let chars: Vec<char> = s.chars().collect();
        chars.windows(2).map(|w| [w[0], w[1]]).collect()
    };
    let (ba, bb) = (bigrams(a), bigrams(b));
    if ba.is_empty() || bb.is_empty() {
        return 0.0;
    }
    let mut bb_used = vec![false; bb.len()];
    let mut matches = 0usize;
    for x in &ba {
        for (j, y) in bb.iter().enumerate() {
            if !bb_used[j] && x == y {
                bb_used[j] = true;
                matches += 1;
                break;
            }
        }
    }
    2.0 * matches as f64 / (ba.len() + bb.len()) as f64
}

fn reconcile(cfg: &Config, threshold: f64) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let folders = existing_artist_folders(cfg);
    let artists = db.list_artists(u32::MAX, "name")?;

    let db_slugs: HashSet<String> = artists.iter().map(|a| sanitize_folder_name(&a.name)).collect();
    let orphaned: Vec<&String> = folders.iter().filter(|f| !db_slugs.contains(*f)).collect();
    let missing: Vec<(String, String)> = artists
        .iter()
        .map(|a| (a.name.clone(), sanitize_folder_name(&a.name)))
        .filter(|(_, slug)| !folders.contains(slug))
        .collect();

    crate::say!("Reconciling {} orphaned folders against {} missing artists (threshold {threshold})", orphaned.len(), missing.len());
    for folder in &orphaned {
        let mut best: Option<(&str, f64)> = None;
        for (name, slug) in &missing {
            let score = similarity(folder, slug);
            if best.map(|(_, s)| score > s).unwrap_or(true) {
                best = Some((name, score));
            }
        }
        if let Some((name, score)) = best {
            if score >= threshold {
                crate::say!("  {folder}  ~  {name}  ({score:.2})");
            }
        }
    }
    Ok(())
}

/// Backfill `role: "member"` onto stored releases whose credits match the band-plus-line-up
/// shape (see [`crate::credits::mark_band_members`]), rewrite their release JSON and regenerate
/// `collection.json`. Releases with any hand-set role are skipped.
fn band_members(cfg: &Config, dry_run: bool) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let mut changed = 0usize;
    for mut rec in db.get_all_releases()? {
        let Some(mut credits) = rec.artists.as_array().cloned() else { continue };
        if !crate::credits::mark_band_members(&mut credits) {
            continue;
        }
        let names: Vec<String> = credits.iter().filter_map(crate::ops::release::credit_label).collect();
        crate::say!("  {} — {}", rec.title, names.join(", "));
        changed += 1;
        if dry_run {
            continue;
        }
        rec.artists = serde_json::Value::Array(credits);
        rec.updated_at = Some(crate::util::now_iso());
        db.save_release(&rec)?;
        crate::ops::release::write_release_json(cfg, &db, &rec)?;
    }
    if dry_run {
        crate::say!("{changed} release(s) would be updated (dry run)");
    } else {
        crate::say!("{changed} release(s) updated");
        if changed > 0 {
            let n = crate::output::collection::regenerate(cfg, &db)?;
            crate::say!("collection.json regenerated ({n} entries)");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn various_keeps_only_discogs_and_overrides() {
        let mut rec = crate::db::ArtistRecord {
            id: "various-1".into(),
            name: "Various".into(),
            biography: Some("Not to be confused with Various Artists.".into()),
            discogs_id: Some("194".into()),
            apple_music_id: Some("59442734".into()),
            spotify_id: Some("77zM".into()),
            lastfm_mbid: Some("89ad".into()),
            discogs_url: Some("https://www.discogs.com/artist/194".into()),
            apple_music_url: Some("https://music.apple.com/x".into()),
            spotify_url: Some("https://open.spotify.com/x".into()),
            lastfm_url: Some("https://www.last.fm/music/Various".into()),
            wikipedia_url: Some("https://en.wikipedia.org/wiki/Various_Artists".into()),
            genres: json!(["Electronic"]),
            popularity: Some(1),
            followers: Some(444),
            country: None,
            formed_date: None,
            images: json!([{"url": "https://example.com/a.jpg"}]),
            local_images: json!({"hi-res": "public/artist/various/various-hi-res.jpg"}),
            enrichment_data: json!({"apple_music": {}}),
            raw_data: json!({"discogs": {"id": 194}, "spotify": {}, "identity": {}, "overrides": {"hero": "photo"}}),
            created_at: None,
            updated_at: None,
        };
        clear_various(&mut rec);
        assert_eq!(rec.biography.as_deref(), Some(VARIOUS_BIOGRAPHY));
        assert!(rec.apple_music_id.is_none() && rec.spotify_url.is_none() && rec.wikipedia_url.is_none());
        assert_eq!(rec.discogs_url.as_deref(), Some("https://www.discogs.com/artist/194"));
        assert_eq!(rec.raw_data, json!({"discogs": {"id": 194}, "overrides": {"hero": "photo"}}));
        assert_eq!(rec.local_images, json!({"hi-res": "public/artist/various/various-hi-res.jpg"}));
    }
}
