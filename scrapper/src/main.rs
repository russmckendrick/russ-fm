//! Entry point. No subcommand → launch the TUI. A subcommand → run the CLI.

use clap::Parser;

use scrapper::cli::{self, Cli};
use scrapper::logging;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Suppress stderr logging on TUI paths (it would corrupt the alternate screen).
    if !cli.launches_tui() {
        logging::init_cli(&cli.log_level);
    }

    if cli.command.is_none() {
        // Bare invocation: launch the interactive TUI.
        let cfg = cli.load_config()?;
        return scrapper::tui::run(cfg, scrapper::tui::Launch::Home).await;
    }

    let cfg = cli.load_config()?;
    cli::run(cli, cfg).await
}
