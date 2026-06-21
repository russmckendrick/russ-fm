//! `enrich-description` — generate album descriptions via Perplexity and store them in the DB
//! (`raw_data.services.perplexity`) and the public JSON.

use anyhow::{bail, Result};

use crate::cli::EnrichDescriptionArgs;
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::{Config, Db};

/// A release targeted for description generation.
struct Target {
    discogs_id: String,
    title: String,
    artist: String,
    genres: Vec<String>,
    labels: Vec<String>,
}

pub async fn run(cfg: &Config, args: EnrichDescriptionArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;

    if args.list_missing {
        let missing = db.get_releases_without_description(Some(args.limit))?;
        println!("Releases without any description ({} shown):", missing.len());
        for r in &missing {
            println!("  [{}] {} — {} ({})", r.discogs_id.as_deref().unwrap_or("?"), r.artists.join(", "), r.title, r.year.unwrap_or(0));
        }
        return Ok(());
    }

    // Build the target list.
    let mut targets: Vec<Target> = Vec::new();
    if let Some(identifier) = &args.identifier {
        for id in identifier.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if let Some(rec) = db.get_release_by_discogs_id(id)? {
                targets.push(Target {
                    discogs_id: id.to_string(),
                    title: rec.title.clone(),
                    artist: first_artist(&rec.artists),
                    genres: str_list(&rec.genres),
                    labels: str_list(&rec.labels),
                });
            } else {
                // Fall back to a title search.
                for r in db.search_releases(id, 1)? {
                    if let Some(did) = r.discogs_id {
                        if let Some(rec) = db.get_release_by_discogs_id(&did)? {
                            targets.push(Target {
                                discogs_id: did,
                                title: rec.title.clone(),
                                artist: first_artist(&rec.artists),
                                genres: str_list(&rec.genres),
                                labels: str_list(&rec.labels),
                            });
                        }
                    }
                }
            }
        }
        if targets.is_empty() {
            bail!("no release matched '{identifier}'");
        }
    } else {
        // Batch over releases missing a description (bounded by --limit to control cost).
        for r in db.get_releases_without_description(Some(args.limit))? {
            if let Some(did) = r.discogs_id {
                targets.push(Target { discogs_id: did, title: r.title, artist: first(&r.artists), genres: r.genres, labels: r.labels });
            }
        }
        if targets.is_empty() {
            println!("No releases are missing a description.");
            return Ok(());
        }
    }

    let services = Services::new(cfg);
    if !services.perplexity.is_configured() {
        bail!("Perplexity is not configured — set perplexity.api_key in config.json");
    }
    let album_dir = cfg.releases_dir();
    let context = args.perplexity_context.as_deref();

    let total = targets.len();
    let mut ok = 0usize;
    for (i, t) in targets.iter().enumerate() {
        // Skip if a description already exists and we're not forcing.
        if !args.force && db.has_enriched_release(&t.discogs_id).unwrap_or(false) {
            if let Some(rec) = db.get_release_by_discogs_id(&t.discogs_id)? {
                let has = rec.raw_data.get("services").and_then(|s| s.get("perplexity")).and_then(|p| p.get("description")).map(|d| !d.is_null()).unwrap_or(false)
                    || rec.raw_data.get("perplexity").and_then(|p| p.get("description")).map(|d| !d.is_null()).unwrap_or(false);
                if has {
                    println!("[{}/{total}] – {} — already has a description (use --force)", i + 1, t.title);
                    continue;
                }
            }
        }

        match services.perplexity.generate_album_description(&t.artist, &t.title, &t.genres, &t.labels, context).await {
            Ok(data) => {
                let preview: String = data.get("description").and_then(|d| d.as_str()).unwrap_or("").chars().take(100).collect();
                if args.dry_run {
                    println!("[{}/{total}] (dry-run) {} — {}…", i + 1, t.title, preview);
                } else {
                    db.update_release_perplexity_description(&t.discogs_id, &data)?;
                    let folder = release_folder_name(&t.title, &t.discogs_id);
                    let _ = crate::output::patch_album_service(&album_dir, &folder, "perplexity", data);
                    ok += 1;
                    println!("[{}/{total}] ✓ {} — {}…", i + 1, t.title, preview);
                }
            }
            Err(e) => println!("[{}/{total}] ✗ {} — {e}", i + 1, t.title),
        }
    }

    if !args.dry_run {
        println!("\nDone: {ok}/{total} descriptions generated.");
    }
    Ok(())
}

fn first(v: &[String]) -> String {
    v.first().cloned().unwrap_or_default()
}

fn first_artist(artists: &serde_json::Value) -> String {
    artists
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .to_string()
}

fn str_list(v: &serde_json::Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}
