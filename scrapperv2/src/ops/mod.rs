//! Command implementations (the "operations" layer) shared by the CLI and TUI.
//!
//! Network-dependent operations live in their own submodules and build on [`crate::services`]
//! and [`crate::orchestrator`]. Pure-local operations (maintenance) are implemented directly.

pub mod artist;
pub mod collection;
pub mod descriptions;
pub mod generate;
pub mod maintenance;
pub mod release;
pub mod report;
pub mod services;
pub mod videos;
