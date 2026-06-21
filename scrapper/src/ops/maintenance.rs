//! Collection-vs-filesystem maintenance — folds in `tools/find_missing_artists.py` and
//! `tools/artist_folder_reconciler.py`. Pure local: database + filesystem + sanitizer, no APIs.

use std::collections::HashSet;

use anyhow::Result;

use crate::cli::MaintenanceCommand;
use crate::sanitize::sanitize_folder_name;
use crate::{Config, Db};

pub fn run(cfg: &Config, cmd: MaintenanceCommand) -> Result<()> {
    match cmd {
        MaintenanceCommand::FindMissing { limit, show_orphaned } => find_missing(cfg, limit, show_orphaned),
        MaintenanceCommand::Reconcile { threshold } => reconcile(cfg, threshold),
    }
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

    println!("Artists in DB: {}, folders on disk: {}", artists.len(), folders.len());
    println!("\nMissing folders ({}):", missing.len());
    let shown = limit.map(|l| l as usize).unwrap_or(missing.len());
    for (name, slug) in missing.iter().take(shown) {
        println!("  {name}  ->  {slug}");
    }

    if show_orphaned {
        let orphaned: Vec<&String> = folders.iter().filter(|f| !db_slugs.contains(*f)).collect();
        println!("\nOrphaned folders ({}):", orphaned.len());
        for f in orphaned.iter().take(shown) {
            println!("  {f}");
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

    println!("Reconciling {} orphaned folders against {} missing artists (threshold {threshold})", orphaned.len(), missing.len());
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
                println!("  {folder}  ~  {name}  ({score:.2})");
            }
        }
    }
    Ok(())
}
