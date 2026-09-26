//! `backfill-original-years` — look up each release's Discogs master and store the master's
//! original release year (`raw_data.discogs.master_id` / `master_year`), then regenerate
//! collection.json so `year_original` reaches the frontend.
//!
//! Resumable: rows that already have a `master_year` key (null included, meaning "looked up,
//! unknown") are skipped unless `--force`. Releases whose stored raw_data already carries a
//! `master_id` need only the master lookup; the rest fetch the release first. Masters shared
//! by several releases are looked up once per run.

use std::collections::HashMap;

use anyhow::{bail, Result};
use serde_json::Value;

use crate::cli::BackfillOriginalYearsArgs;
use crate::services::discogs::DiscogsService;
use crate::services::Services;
use crate::{Config, Db};

pub async fn run(cfg: &Config, args: BackfillOriginalYearsArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let candidates = db.releases_for_original_years(args.force, args.limit)?;
    let total = candidates.len();
    let need_release = candidates.iter().filter(|c| c.master_id.is_none()).count();

    if args.dry_run {
        println!("[dry-run] {total} release(s) to look up ({need_release} without a stored master_id):");
        for c in candidates.iter().take(25) {
            println!("  [{}] {} — {}", c.discogs_id, c.artists.join(", "), c.title);
        }
        return Ok(());
    }

    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    println!("Looking up original years for {total} release(s) ({need_release} need a release lookup first)...");

    let mut years: HashMap<String, Option<i64>> = HashMap::new();
    let (mut found, mut no_master, mut failed) = (0usize, 0usize, 0usize);
    for (i, c) in candidates.iter().enumerate() {
        let label = format!("[{}/{total}] {} — {}", i + 1, c.artists.join(", "), c.title);

        let master_id = match &c.master_id {
            Some(m) => Some(m.clone()),
            None => match services.discogs.get_release(&c.discogs_id).await {
                Ok(release) => DiscogsService::master_id_of(&release),
                Err(e) => {
                    println!("{label} ✗ release lookup failed: {e}");
                    failed += 1;
                    continue;
                }
            },
        };

        let Some(master_id) = master_id else {
            db.set_release_master(&c.discogs_id, Value::Null, Value::Null)?;
            no_master += 1;
            println!("{label} · no master");
            continue;
        };

        let year = match years.get(&master_id) {
            Some(y) => *y,
            None => match services.discogs.master_year(&master_id).await {
                Ok(y) => {
                    years.insert(master_id.clone(), y);
                    y
                }
                Err(e) => {
                    println!("{label} ✗ master {master_id} lookup failed: {e}");
                    failed += 1;
                    continue;
                }
            },
        };

        let id_value = master_id.parse::<i64>().map(Value::from).unwrap_or_else(|_| Value::from(master_id.clone()));
        db.set_release_master(&c.discogs_id, id_value, year.map(Value::from).unwrap_or(Value::Null))?;
        found += 1;
        match year {
            Some(y) => println!("{label} → {y}"),
            None => println!("{label} · master {master_id} has no year"),
        }
    }

    println!("\nDone: {found} with a master, {no_master} without, {failed} failed (re-run to retry).");
    if found + no_master > 0 {
        let n = crate::output::collection::regenerate(cfg, &db)?;
        println!("Regenerated collection.json ({n} entries).");
    }
    Ok(())
}
