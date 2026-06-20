//! `enrich-description` — generate album descriptions via Perplexity. `--list-missing` is
//! implemented locally; generation is wired through the Perplexity service.

use anyhow::{bail, Result};

use crate::cli::EnrichDescriptionArgs;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: EnrichDescriptionArgs) -> Result<()> {
    if args.list_missing {
        let db = Db::open(cfg.db_path())?;
        let missing = db.get_releases_without_description(Some(args.limit))?;
        println!("Releases without any description ({} shown):", missing.len());
        for r in &missing {
            println!(
                "  [{}] {} — {} ({})",
                r.discogs_id.as_deref().unwrap_or("?"),
                r.artists.join(", "),
                r.title,
                r.year.unwrap_or(0)
            );
        }
        return Ok(());
    }

    if args.identifier.is_none() {
        bail!("enrich-description requires an identifier (Discogs ID / title) unless --list-missing is used");
    }

    crate::ops::release::enrich_descriptions(cfg, &args).await
}
