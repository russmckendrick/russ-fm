//! scrapper — music collection enrichment as a cohesive Rust web UI/TUI/CLI.
//!
//! Library crate holding the reusable core (config, db, ops, sanitize). The binary
//! (`src/main.rs`) dispatches to the clap CLI, the ratatui TUI or the axum web UI.

pub mod cli;
pub mod config;
pub mod credits;
pub mod db;
pub mod formats;
pub mod logging;
pub mod ops;
pub mod output;
pub mod sanitize;
pub mod services;
pub mod tui;
pub mod upscale;
pub mod util;
pub mod web;

pub use config::Config;
pub use db::Db;
