//! Output pipeline: public JSON serialization (this module), and — to follow — image download
//! and the collection generator.

pub mod collection;
pub mod images;
pub mod json;
pub mod tv;

pub use json::{
    artist_to_value, format_fields, patch_album_field, patch_album_fields, patch_album_service, release_to_value,
    to_pretty_sorted, Patch,
};
