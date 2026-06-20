//! `artist` and `artist-batch` commands. Pending the services + orchestrator layers (tasks 4–5).

use anyhow::{bail, Result};

use crate::cli::{ArtistArgs, ArtistBatchArgs};
use crate::Config;

pub async fn run(_cfg: &Config, args: ArtistArgs) -> Result<()> {
    bail!(
        "`artist {:?}` needs the services/orchestrator layer (not yet ported). \
         Read-only browsing is available via `db search artist <name>`.",
        args.name
    );
}

pub async fn run_batch(_cfg: &Config, _args: ArtistBatchArgs) -> Result<()> {
    bail!("`artist-batch` needs the services/orchestrator layer (not yet ported).");
}
