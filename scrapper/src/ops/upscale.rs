//! `scrapper upscale`: AI-upscale the site's small images in a batch (see [`crate::upscale`]).
//! Each one runs through the GPU in turn; only images under their target are listed, so a run
//! that stops part way picks up where it left off.

use anyhow::Result;

use crate::cli::UpscaleArgs;
use crate::upscale::{plan, Kind, Upscaler};
use crate::Config;

/// Seconds an upscale takes on an Apple-silicon GPU, for the estimate.
const SECONDS_EACH: f64 = 3.5;

/// An image to upscale: its path under public/, its size and its target.
type Job = (String, (u32, u32), (u32, u32));

pub async fn run(cfg: &Config, args: UpscaleArgs) -> Result<()> {
    let upscaler = Upscaler::find(cfg)?;

    if let Some(list) = args.restore.as_deref() {
        for rel in list.split(',').map(str::trim).filter(|r| !r.is_empty()) {
            let rel = rel.trim_start_matches("public/");
            match upscaler.restore(rel)? {
                true => crate::say!("Restored {rel}"),
                false => crate::say!("No kept original for {rel}"),
            }
        }
        return Ok(());
    }

    let none = !args.artists && !args.fanart && !args.all_fanart && !args.albums;
    let (artists, fanart, albums) = (none || args.artists, none || args.fanart || args.all_fanart, none || args.albums);
    let only: Vec<String> = args.only.as_deref().unwrap_or_default().split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    let wanted = |slug: &str| only.is_empty() || only.iter().any(|o| o == slug);

    let data = cfg.data_dir();
    let mut todo: Vec<Job> = Vec::new();
    let mut add = |rel: String, kind: Kind| {
        if let Ok(p) = plan(&data.join(&rel), kind) {
            if let Some(to) = p.to {
                todo.push((rel, p.from, to));
            }
        }
    };
    if artists || fanart {
        for slug in folders(&cfg.artists_dir()).into_iter().filter(|s| wanted(s)) {
            if artists {
                add(format!("artist/{slug}/{slug}-hi-res.jpg"), Kind::Photo);
            }
            if fanart {
                for file in fanart_files(&cfg.artists_dir(), &slug, args.all_fanart) {
                    add(format!("artist/{slug}/{file}"), Kind::Fanart);
                }
            }
        }
    }
    if albums {
        for slug in folders(&cfg.releases_dir()).into_iter().filter(|s| wanted(s)) {
            add(format!("album/{slug}/{slug}-hi-res.jpg"), Kind::Cover);
        }
    }
    if let Some(l) = args.limit {
        todo.truncate(l as usize);
    }

    let minutes = (todo.len() as f64 * SECONDS_EACH / 60.0).ceil();
    crate::say!("{} image(s) to upscale with {} (about {minutes:.0} min).", todo.len(), cfg.upscale.model);
    if args.dry_run {
        for (rel, from, to) in todo.iter().take(40) {
            crate::say!("  [dry-run] {rel}  {}×{} → {}×{}", from.0, from.1, to.0, to.1);
        }
        if todo.len() > 40 {
            crate::say!("  …and {} more", todo.len() - 40);
        }
        return Ok(());
    }

    let upscaler = std::sync::Arc::new(upscaler);
    let (mut done, mut failed) = (0usize, 0usize);
    let mut artists_done: Vec<String> = Vec::new();
    let total = todo.len();
    for (i, (rel, _, _)) in todo.into_iter().enumerate() {
        let u = upscaler.clone();
        let r = rel.clone();
        match tokio::task::spawn_blocking(move || u.upscale(&r, false)).await? {
            Ok(d) => {
                done += 1;
                if let Some(slug) = rel.strip_prefix("artist/").and_then(|r| r.split('/').next()) {
                    if !artists_done.iter().any(|s| s == slug) {
                        artists_done.push(slug.to_string());
                    }
                }
                crate::say!("[{}/{total}] {rel}  {}×{} → {}×{}", i + 1, d.from.0, d.from.1, d.to.0, d.to.1);
            }
            Err(e) => {
                failed += 1;
                crate::say!("[{}/{total}] {rel}  failed: {e:#}", i + 1);
            }
        }
    }
    crate::say!("Done: {done} upscaled, {failed} failed. Originals are in backups/upscale-originals/ (undo with --restore <path>).");
    if !artists_done.is_empty() {
        // Proportions are kept, so placement stays right; this refreshes sizes and hashes.
        crate::say!("Re-measure the artists for the site: pnpm run generate-artist-images -- --only '{}'", artists_done.join(","));
    }
    Ok(())
}

/// Sub-folders of an output directory, sorted.
fn folders(dir: &std::path::Path) -> Vec<String> {
    let mut out: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    out.sort();
    out
}

/// An artist's fanart files: every one with `all`, else only the one its hero uses (from
/// `<slug>-image.json`, written by the site's generate-artist-images).
fn fanart_files(artist_dir: &std::path::Path, slug: &str, all: bool) -> Vec<String> {
    let dir = artist_dir.join(slug);
    if all {
        let mut files: Vec<String> = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|f| Kind::of(&format!("artist/{slug}/{f}")) == Some(Kind::Fanart))
            .collect();
        files.sort();
        return files;
    }
    std::fs::read_to_string(dir.join(format!("{slug}-image.json")))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|j| j.get("fanart")?.get("file")?.as_str().map(String::from))
        .into_iter()
        .collect()
}
