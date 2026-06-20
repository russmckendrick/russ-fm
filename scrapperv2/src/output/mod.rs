//! Output pipeline: public JSON serialization (this module), and — to follow — image download
//! and the collection generator.

pub mod images;
pub mod json;

pub use json::{artist_to_value, release_to_value, to_pretty_sorted};
