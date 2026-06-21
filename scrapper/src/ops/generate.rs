//! `generate-collection` — build collection.json for the frontend from the database.

use anyhow::Result;

use crate::cli::GenerateCollectionArgs;
use crate::output::collection;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: GenerateCollectionArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;

    // Default output: <data_dir>/collection.json (e.g. ../public/collection.json).
    let output = args
        .output
        .clone()
        .or_else(|| args.data_path.clone().map(|d| d.join("collection.json")))
        .unwrap_or_else(|| cfg.data_dir().join("collection.json"));

    println!("Generating collection.json...");
    let count = collection::generate(cfg, &db, &output)?;
    println!("Wrote {count} entries to {}", output.display());
    Ok(())
}
