//! `release` command and shared description-enrichment helper.
//!
//! Pending the services + orchestrator layers (tasks 4–5).

use anyhow::{bail, Result};

use crate::cli::{EnrichDescriptionArgs, ReleaseArgs};
use crate::Config;

pub async fn run(_cfg: &Config, args: ReleaseArgs) -> Result<()> {
    bail!(
        "`release {}` needs the services/orchestrator layer (not yet ported). \
         Read-only browsing is available via `db search release {0}`.",
        args.discogs_id
    );
}

pub async fn enrich_descriptions(_cfg: &Config, _args: &EnrichDescriptionArgs) -> Result<()> {
    bail!("Perplexity description generation needs the services layer (not yet ported). Use `enrich-description --list-missing` to inspect candidates.");
}
