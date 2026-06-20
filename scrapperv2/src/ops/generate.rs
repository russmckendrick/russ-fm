//! `generate-collection` — build collection.json for the frontend. Pending the collection
//! generator port (task 5).

use anyhow::{bail, Result};

use crate::cli::GenerateCollectionArgs;
use crate::Config;

pub async fn run(_cfg: &Config, _args: GenerateCollectionArgs) -> Result<()> {
    bail!("collection.json generation is not yet ported (depends on the collection generator).");
}
