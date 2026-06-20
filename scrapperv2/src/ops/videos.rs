//! `backfill-videos` — fetch release videos from Discogs and write them to the DB + public JSON.

use anyhow::{bail, Result};
use serde_json::json;

use crate::cli::BackfillVideosArgs;
use crate::sanitize::release_folder_name;
use crate::services::discogs::DiscogsService;
use crate::services::Services;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: BackfillVideosArgs) -> Result<()> {
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
                let folder = release_folder_name(&r.title, discogs_id);
                let _ = crate::output::patch_album_field(&album_dir, &folder, "videos", videos_json);
                updated += 1;
                if n > 0 {
                    with_videos += 1;
                }
                println!("[{}/{total}] {} — {} ({n} videos)", i + 1, r.artists.join(", "), r.title);
            }
            Err(e) => println!("[{}/{total}] ✗ {} — {e}", i + 1, discogs_id),
        }

        // Pause between batches when requested (headless-friendly).
        if let Some(pause) = args.pause {
            if (i + 1) % args.batch_size as usize == 0 && i + 1 < total {
                println!("  …pausing {pause}s between batches");
                tokio::time::sleep(std::time::Duration::from_secs(pause)).await;
            }
        }
    }

    println!("\nDone: checked {updated}, {with_videos} had videos.");
    Ok(())
}
