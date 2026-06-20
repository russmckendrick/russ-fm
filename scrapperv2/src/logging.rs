//! Logging setup. CLI mode logs to stderr (respecting the config level); the TUI feeds logs
//! into an in-app pane via a channel layer (wired separately).

use std::str::FromStr;

use tracing_subscriber::{filter::LevelFilter, EnvFilter};

/// Map the Python-style level strings (`DEBUG`/`INFO`/...) to a tracing [`LevelFilter`].
pub fn level_filter(level: &str) -> LevelFilter {
    match level.to_ascii_uppercase().as_str() {
        "DEBUG" => LevelFilter::DEBUG,
        "WARNING" | "WARN" => LevelFilter::WARN,
        "ERROR" => LevelFilter::ERROR,
        "TRACE" => LevelFilter::TRACE,
        _ => LevelFilter::INFO,
    }
}

/// Initialise stderr logging for CLI mode. Honours `RUST_LOG` if set, else the config level.
pub fn init_cli(level: &str) {
    let filter = EnvFilter::from_str(&format!("scrapperv2={}", level.to_ascii_lowercase()))
        .unwrap_or_else(|_| EnvFilter::default().add_directive(level_filter(level).into()));
    let filter = match std::env::var("RUST_LOG") {
        Ok(v) if !v.is_empty() => EnvFilter::new(v),
        _ => filter,
    };
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_target(false)
        .try_init();
}
