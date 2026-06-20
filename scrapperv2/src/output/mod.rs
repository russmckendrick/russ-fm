//! Output pipeline: public JSON serialization (this module), and — to follow — image download
//! and the collection generator.

pub mod collection;
pub mod images;
pub mod json;

pub use json::{
    artist_to_value, patch_album_field, patch_album_service, release_to_value, to_pretty_sorted,
};
