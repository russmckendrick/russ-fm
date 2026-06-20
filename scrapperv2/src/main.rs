//! Entry point. No subcommand → launch the TUI. A subcommand → run the CLI.

use clap::Parser;

use scrapperv2::cli::{self, Cli};
use scrapperv2::logging;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    if cli.command.is_none() {
        // Bare invocation: launch the interactive TUI.
        let cfg = cli.load_config()?;
        return scrapperv2::tui::run(cfg).await;
    }

    logging::init_cli(&cli.log_level);
    let cfg = cli.load_config()?;
    cli::run(cli, cfg).await
}
