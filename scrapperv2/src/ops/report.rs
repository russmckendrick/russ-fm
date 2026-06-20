//! `report` command — album-matching report. Pending the matching/report port (task 5).

use anyhow::{bail, Result};

use crate::cli::ReportArgs;
use crate::Config;

pub async fn run(_cfg: &Config, _args: ReportArgs) -> Result<()> {
    bail!("Album-matching report is not yet ported (depends on the matching layer).");
}
