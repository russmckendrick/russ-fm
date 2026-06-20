//! Entry point. No subcommand → launch the TUI. A subcommand → run the CLI.

use clap::Parser;

use scrapperv2::cli::{self, Cli};
use scrapperv2::logging;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    if cli.command.is_none() {
        // Bare invocation: launch the TUI (pending — task 7).
        let cfg = cli.load_config()?;
        eprintln!(
            "scrapper TUI is not yet wired up. For now, use a subcommand — try:\n  \
             scrapper status\n  scrapper db list releases --limit 10\n  scrapper --help\n\n\
             (config loaded from {})",
            cfg.base_dir.display()
        );
        return Ok(());
    }

    logging::init_cli(&cli.log_level);
    let cfg = cli.load_config()?;
    cli::run(cli, cfg).await
}
