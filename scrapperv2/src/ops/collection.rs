//! `collection` command — process the Discogs collection (resume-aware), reusing the
//! single-release pipeline. Sequential to respect upstream rate limits.

use anyhow::{bail, Result};
use serde_json::Value;

use crate::cli::CollectionArgs;
use crate::ops::release::{image_client, prefer_key, process_release, MatchPicker};
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

    println!("Fetching collection for {username}...");
    let raw = services.discogs.get_user_collection(&username).await?;
    let mut entries: Vec<Entry> = raw.iter().filter_map(parse_entry).collect();
    println!("Collection has {} releases.", entries.len());

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
        println!("Resume: skipping {skipped} already-enriched; {} to process.", entries.len());
    }

    if entries.is_empty() {
        println!("Nothing to process.");
        return Ok(());
    }

    if args.dry_run {
        println!("[dry-run] would process {} releases:", entries.len());
        for e in entries.iter().take(25) {
            println!("  {}", e.release_id);
        }
        if entries.len() > 25 {
            println!("  ... and {} more", entries.len() - 25);
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
        match process_release(cfg, &services, &db, &client, &e.release_id, true, prefer, &picker, e.date_added.as_deref()).await {
            Ok((rec, flags)) => {
                db.record_processed(&rec.id, &e.release_id, e.instance_id.as_deref(), e.date_added.as_deref())?;
                ok += 1;
                println!(
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
                println!("[{}/{total}] ✗ release {} — {err}", i + 1, e.release_id);
            }
        }
    }

    println!("\nDone: {ok} processed, {failed} failed, of {total}.");

    // Refresh the frontend index.
    let out = cfg.data_dir().join("collection.json");
    match crate::output::collection::generate(cfg, &db, &out) {
        Ok(n) => println!("Updated {} ({n} entries).", out.display()),
        Err(e) => println!("Warning: collection.json update failed: {e}"),
    }
    Ok(())
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
