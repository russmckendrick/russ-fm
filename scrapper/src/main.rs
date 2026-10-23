//! Entry point. No subcommand → launch the web UI (or the TUI with `--tui`). A subcommand →
//! run the CLI.

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
        let cfg = cli.load_config()?;
        if cli.tui {
            return scrapper::tui::run(cfg, scrapper::tui::Launch::Home).await;
        }
        // Bare invocation: serve the web UI and open it in the browser.
        return scrapper::web::serve(cfg, cli.port, !cli.no_open).await;
    }

    let cfg = cli.load_config()?;
    cli::run(cli, cfg).await
}
