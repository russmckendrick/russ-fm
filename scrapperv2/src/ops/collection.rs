//! `collection` command — process the Discogs collection (resume-aware).
//! Pending the services + orchestrator layers (tasks 4–5).

use anyhow::{bail, Result};

use crate::cli::CollectionArgs;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: CollectionArgs) -> Result<()> {
    if args.dry_run {
        // Dry-run can preview the resume queue without any network access.
        let db = Db::open(cfg.db_path())?;
        let pending = db.get_unprocessed_items(args.limit)?;
        println!("[dry-run] {} unprocessed collection item(s) would be processed.", pending.len());
        for id in pending.iter().take(20) {
            println!("  {id}");
        }
        if pending.len() > 20 {
            println!("  ... and {} more", pending.len() - 20);
        }
        return Ok(());
    }
    bail!("Live collection processing needs the services/orchestrator layer (not yet ported). `collection --dry-run` previews the resume queue.");
}
