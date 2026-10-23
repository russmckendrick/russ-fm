//! `collection` command — process the Discogs collection (resume-aware), reusing the
//! single-release pipeline. Sequential to respect upstream rate limits.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cli::CollectionArgs;
use crate::ops::release::{image_client, prefer_key, process_release, MatchPicker, ProgressSink};
use crate::services::Services;
use crate::{Config, Db};

/// A collection entry distilled from the Discogs collection payload.
struct Entry {
    release_id: String,
    instance_id: Option<String>,
    date_added: Option<String>,
}

fn parse_entry(v: &Value) -> Option<Entry> {
    let release_id = v.get("id").map(|i| match i {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    })?;
    Some(Entry {
        release_id,
        instance_id: v.get("instance_id").map(|i| i.to_string()),
        date_added: v.get("date_added").and_then(|d| d.as_str()).map(String::from),
    })
}

pub async fn run(cfg: &Config, args: CollectionArgs) -> Result<()> {
    let services = Services::new(cfg);
    let db = Db::open(cfg.db_path())?;
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }

    let username = args
        .username
        .clone()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| cfg.discogs.username.clone());
    if username.is_empty() {
        bail!("no Discogs username — pass --username or set discogs.username in config.json");
    }

    crate::say!("Fetching collection for {username}...");
    let raw = services.discogs.get_user_collection(&username).await?;
    let mut entries: Vec<Entry> = raw.iter().filter_map(parse_entry).collect();
    crate::say!("Collection has {} releases.", entries.len());

    // Range slicing: [from, to) then limit.
    let from = args.from.unwrap_or(0) as usize;
    let to = args.to.map(|t| t as usize).unwrap_or(entries.len());
    if from < entries.len() {
        entries = entries.into_iter().skip(from).take(to.saturating_sub(from)).collect();
    } else {
        entries.clear();
    }
    if let Some(limit) = args.limit {
        entries.truncate(limit as usize);
    }

    // Resume: skip already-enriched releases unless forcing a refresh.
    if args.resume && !args.force_refresh {
        let before = entries.len();
        let mut kept = Vec::with_capacity(before);
        for e in entries {
            if !db.has_enriched_release(&e.release_id)? {
                kept.push(e);
            }
        }
        let skipped = before - kept.len();
        entries = kept;
        crate::say!("Resume: skipping {skipped} already-enriched; {} to process.", entries.len());
    }

    if entries.is_empty() {
        crate::say!("Nothing to process.");
        return Ok(());
    }

    if args.dry_run {
        crate::say!("[dry-run] would process {} releases:", entries.len());
        for e in entries.iter().take(25) {
            crate::say!("  {}", e.release_id);
        }
        if entries.len() > 25 {
            crate::say!("  ... and {} more", entries.len() - 25);
        }
        return Ok(());
    }

    let client = image_client();
    let prefer = prefer_key(args.prefer);
    let picker = MatchPicker::First; // interactive runs route to the TUI
    let total = entries.len();
    let mut ok = 0usize;
    let mut failed = 0usize;

    for (i, e) in entries.iter().enumerate() {
        super::out::progress(i + 1, total);
        match process_release(cfg, &services, &db, &client, &e.release_id, true, prefer, &picker, e.date_added.as_deref(), None, false).await {
            Ok((rec, flags)) => {
                db.record_processed(&rec.id, &e.release_id, e.instance_id.as_deref(), e.date_added.as_deref())?;
                ok += 1;
                crate::say!(
                    "[{}/{total}] ✓ {} — {} (apple {} spotify {} lastfm {})",
                    i + 1,
                    truncate(&primary_artist(&rec.artists), 24),
                    truncate(&rec.title, 36),
                    yn(flags.apple),
                    yn(flags.spotify),
                    yn(flags.lastfm),
                );
            }
            Err(err) => {
                failed += 1;
                crate::say!("[{}/{total}] ✗ release {} — {err}", i + 1, e.release_id);
            }
        }
    }

    crate::say!("\nDone: {ok} processed, {failed} failed, of {total}.");

    // Check any new videos, so tv.json leaves out ones that won't play.
    if let Err(e) = crate::ops::videos::check_playability(cfg, &db, &services, crate::ops::videos::CheckScope::New, None).await {
        crate::say!("Warning: video playability check failed: {e}");
    }

    // Refresh the frontend index.
    let out = cfg.data_dir().join("collection.json");
    match crate::output::collection::generate(cfg, &db, &out) {
        Ok(n) => crate::say!("Updated {} ({n} entries).", out.display()),
        Err(e) => crate::say!("Warning: collection.json update failed: {e}"),
    }
    Ok(())
}

// ── Picking new releases (TUI Collection screen, web UI Add page) ──────────────────────────

/// A release in the Discogs collection, distilled from the collection payload's
/// `basic_information` for the Collection screen's picker.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CollectionCandidate {
    pub release_id: String,
    pub instance_id: Option<String>,
    pub date_added: Option<String>,
    pub artist: String,
    pub title: String,
    pub year: Option<i64>,
    pub format: String,
}

impl CollectionCandidate {
    pub fn from_entry(v: &serde_json::Value) -> Option<Self> {
        let release_id = v.get("id").map(|i| match i {
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        })?;
        let info = v.get("basic_information");
        let str_of = |key: &str| info.and_then(|b| b.get(key)).and_then(|t| t.as_str()).unwrap_or("").to_string();
        let artist = info
            .and_then(|b| b.get("artists"))
            .and_then(|a| a.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                    .map(strip_discogs_suffix)
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        // "Vinyl, LP, Album" — the first format's name plus its descriptions.
        let format = info
            .and_then(|b| b.get("formats"))
            .and_then(|f| f.as_array())
            .and_then(|f| f.first())
            .map(|f| {
                let mut parts: Vec<&str> = f.get("name").and_then(|n| n.as_str()).into_iter().collect();
                if let Some(d) = f.get("descriptions").and_then(|d| d.as_array()) {
                    parts.extend(d.iter().filter_map(|x| x.as_str()));
                }
                parts.join(", ")
            })
            .unwrap_or_default();
        Some(Self {
            release_id,
            instance_id: v.get("instance_id").map(|i| i.to_string()),
            date_added: v.get("date_added").and_then(|d| d.as_str()).map(String::from),
            artist,
            title: str_of("title"),
            year: info.and_then(|b| b.get("year")).and_then(|y| y.as_i64()).filter(|y| *y > 0),
            format,
        })
    }
}

/// Drop Discogs's artist disambiguation suffix: "Placebo (2)" → "Placebo".
fn strip_discogs_suffix(name: &str) -> &str {
    match name.rsplit_once(" (") {
        Some((base, n)) if n.strip_suffix(')').is_some_and(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit())) => base,
        _ => name,
    }
}

/// How many of the newest collection pages (100 releases each) the picker scans.
const CANDIDATE_PAGES: u32 = 3;
/// The most new releases the picker lists.
const CANDIDATE_LIMIT: usize = 50;

/// Load the newest releases in the Discogs collection that aren't enriched in the DB yet, for
/// the Collection screen's picker. Pages newest-first and stops at the first page with nothing
/// new on it (everything older is already processed), after [`CANDIDATE_PAGES`] pages, or once
/// [`CANDIDATE_LIMIT`] are found.
pub async fn new_candidates(cfg: &Config, db: &Db) -> Result<Vec<CollectionCandidate>> {
    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        anyhow::bail!("Discogs not configured — set discogs.access_token in config.json");
    }
    let username = cfg.discogs.username.clone();
    if username.is_empty() {
        anyhow::bail!("no Discogs username — set discogs.username in config.json");
    }
    let have = db.enriched_release_ids()?;
    let mut out = Vec::new();
    for page in 1..=CANDIDATE_PAGES {
        let (entries, pages) = services.discogs.get_user_collection_page(&username, page).await?;
        let before = out.len();
        out.extend(
            entries
                .iter()
                .filter_map(CollectionCandidate::from_entry)
                .filter(|c| !have.contains(&c.release_id) && !out.iter().any(|o: &CollectionCandidate| o.release_id == c.release_id))
                .collect::<Vec<_>>(),
        );
        if out.len() == before || out.len() >= CANDIDATE_LIMIT || page >= pages {
            break;
        }
    }
    out.truncate(CANDIDATE_LIMIT);
    Ok(out)
}


/// The first `limit` releases of the collection, newest first, processed or not.
pub async fn newest_candidates(cfg: &Config, limit: usize) -> Result<Vec<CollectionCandidate>> {
    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs not configured — set discogs.access_token in config.json");
    }
    let entries = services.discogs.get_user_collection(&cfg.discogs.username).await?;
    Ok(entries.iter().filter_map(CollectionCandidate::from_entry).take(limit).collect())
}

/// Force-refresh and save each picked release, choosing service matches with `picker`, then
/// regenerate collection.json. Lines and per-release progress go to `sink`.
pub async fn process_candidates(
    cfg: &Config,
    db: &Db,
    items: &[CollectionCandidate],
    picker: &MatchPicker,
    sink: &ProgressSink<'_>,
) -> Result<()> {
    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs not configured — set discogs.access_token in config.json");
    }
    let total = items.len();
    sink.log(format!("Processing {total} release(s) (interactive)"));
    let client = image_client();

    for (i, item) in items.iter().enumerate() {
        let (id, date_added, instance) = (&item.release_id, &item.date_added, &item.instance_id);
        sink.log(format!("▶ [{}/{total}] release {id} — fetching from Discogs…", i + 1));
        match process_release(cfg, &services, db, &client, id, true, None, picker, date_added.as_deref(), None, false).await {
            Ok((rec, f)) => {
                let _ = db.record_processed(&rec.id, id, instance.as_deref(), date_added.as_deref());
                sink.log(format!("  {} — {}", primary_artist(&rec.artists), rec.title));
                sink.log(format!(
                    "    apple {} · spotify {} · lastfm {} · wiki {} · perplexity {} · artwork {} · saved ✓",
                    svc_mark(f.apple, rec.release_name_apple_music.as_deref()),
                    svc_mark(f.spotify, rec.release_name_spotify.as_deref()),
                    yn(f.lastfm),
                    yn(f.wikipedia),
                    yn(f.perplexity),
                    yn(f.image)
                ));
            }
            Err(e) => sink.log(format!("  ✗ {id} — {e}")),
        }
        sink.progress(i + 1, total);
    }

    // Refresh the frontend index so the new releases show up.
    let out = cfg.data_dir().join("collection.json");
    sink.log(format!("Updating {}…", out.display()));
    match crate::output::collection::generate(cfg, db, &out) {
        Ok(n) => sink.log(format!("✓ wrote {n} entries to collection.json")),
        Err(e) => sink.log(format!("✗ collection.json update failed: {e}")),
    }
    Ok(())
}

/// Service tick that names the matched item, so auto- and picked matches are visible in the log.
fn svc_mark(found: bool, name: Option<&str>) -> String {
    match (found, name) {
        (true, Some(n)) if !n.is_empty() => format!("✓ \"{n}\""),
        (true, _) => "✓".into(),
        (false, _) => "–".into(),
    }
}

fn primary_artist(artists: &Value) -> String {
    artists
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("?")
        .to_string()
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max - 1).collect::<String>())
    }
}

fn yn(b: bool) -> &'static str {
    if b {
        "✓"
    } else {
        "–"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_from_collection_entry() {
        let v = serde_json::json!({
            "id": 15464999,
            "instance_id": 123,
            "date_added": "2026-10-20T09:15:00-07:00",
            "basic_information": {
                "title": "So Tonight That I Might See",
                "year": 1993,
                "artists": [{ "name": "Mazzy Star" }, { "name": "Placebo (2)" }],
                "formats": [{ "name": "Vinyl", "descriptions": ["LP", "Album"] }]
            }
        });
        let c = CollectionCandidate::from_entry(&v).unwrap();
        assert_eq!(c.release_id, "15464999");
        assert_eq!(c.instance_id.as_deref(), Some("123"));
        assert_eq!(c.artist, "Mazzy Star, Placebo");
        assert_eq!(c.title, "So Tonight That I Might See");
        assert_eq!(c.year, Some(1993));
        assert_eq!(c.format, "Vinyl, LP, Album");
    }

    #[test]
    fn strips_only_numeric_disambiguation() {
        assert_eq!(strip_discogs_suffix("Placebo (2)"), "Placebo");
        assert_eq!(strip_discogs_suffix("Sunn O)))"), "Sunn O)))");
        assert_eq!(strip_discogs_suffix("Jesus Jones (UK)"), "Jesus Jones (UK)");
    }
}
