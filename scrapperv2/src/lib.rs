//! scrapperv2 — music collection enrichment as a cohesive Rust TUI/CLI.
//!
//! Library crate holding the reusable core (config, db, ops, sanitize). The binary
//! (`src/main.rs`) dispatches to either the clap CLI or the ratatui TUI.

pub mod cli;
pub mod config;
pub mod db;
pub mod logging;
pub mod ops;
pub mod sanitize;
pub mod services;
pub mod util;

pub use config::Config;
pub use db::Db;
