//! `backfill-videos` — fetch release videos from Discogs. `--dry-run` previews locally; live
//! fetch is pending the Discogs service (task 4).

use anyhow::{bail, Result};

use crate::cli::BackfillVideosArgs;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: BackfillVideosArgs) -> Result<()> {
    if args.dry_run {
        let db = Db::open(cfg.db_path())?;
        let candidates = db.get_releases_without_videos(args.limit, args.from.as_deref())?;
        println!("[dry-run] {} release(s) without videos:", candidates.len());
        for r in candidates.iter().take(25) {
            println!(
                "  [{}] {} — {}",
                r.discogs_id.as_deref().unwrap_or("?"),
                r.artists.join(", "),
                r.title
            );
        }
        return Ok(());
    }
    bail!("Live video backfill needs the Discogs service (not yet ported). Use `backfill-videos --dry-run` to preview candidates.");
}
