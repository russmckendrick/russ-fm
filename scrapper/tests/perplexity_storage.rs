//! Perplexity descriptions live at the canonical top-level `raw_data.perplexity`.
//! `update_release_perplexity_description` must write there and clear the legacy
//! `raw_data.services.perplexity` nesting left behind by the Python pipeline.

use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::Db;
use serde_json::{json, Value};

struct TestDb {
    db: Db,
    path: PathBuf,
}

impl Drop for TestDb {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn test_db() -> Result<TestDb> {
    let path = std::env::temp_dir().join(format!("scrapper-pplx-{}.db", uuid::Uuid::new_v4()));
    create_schema(&path)?;
    Ok(TestDb { db: Db::open(&path)?, path })
}

fn create_schema(path: &Path) -> Result<()> {
    let conn = rusqlite::Connection::open(path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE releases (
            id TEXT PRIMARY KEY, discogs_id TEXT, title TEXT, artists TEXT, year INTEGER,
            released TEXT, country TEXT, formats TEXT, labels TEXT, genres TEXT, styles TEXT,
            images TEXT, tracklist TEXT, videos TEXT, release_name_discogs TEXT,
            release_name_apple_music TEXT, release_name_spotify TEXT, apple_music_id TEXT,
            spotify_id TEXT, lastfm_mbid TEXT, discogs_url TEXT, apple_music_url TEXT,
            spotify_url TEXT, lastfm_url TEXT, enrichment_data TEXT, created_at TEXT,
            updated_at TEXT, date_added TEXT, local_images TEXT, raw_data TEXT
        );
        CREATE TABLE artists (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, biography TEXT, discogs_id TEXT,
            apple_music_id TEXT, spotify_id TEXT, lastfm_mbid TEXT, discogs_url TEXT,
            apple_music_url TEXT, spotify_url TEXT, lastfm_url TEXT, wikipedia_url TEXT,
            genres TEXT, popularity INTEGER, followers INTEGER, country TEXT, formed_date TEXT,
            images TEXT, local_images TEXT, enrichment_data TEXT, created_at TEXT,
            updated_at TEXT, raw_data TEXT
        );
        "#,
    )?;
    Ok(())
}

fn insert_release_with_raw(path: &Path, discogs_id: &str, raw_data: &Value) -> Result<()> {
    let conn = rusqlite::Connection::open(path)?;
    conn.execute(
        "INSERT INTO releases (id, discogs_id, title, artists, raw_data) VALUES (?1, ?1, 'T', '[]', ?2)",
        rusqlite::params![discogs_id, raw_data.to_string()],
    )?;
    Ok(())
}

fn raw_data_of(db: &Db, discogs_id: &str) -> Result<Value> {
    let rec = db.get_release_by_discogs_id(discogs_id)?.expect("release exists");
    Ok(rec.raw_data)
}

#[test]
fn perplexity_update_writes_top_level_and_clears_legacy_nesting() -> Result<()> {
    let t = test_db()?;
    insert_release_with_raw(
        &t.path,
        "100",
        &json!({ "services": { "perplexity": {"description": "legacy"}, "other": {"keep": true} } }),
    )?;

    let updated = t.db.update_release_perplexity_description("100", &json!({"description": "fresh"}))?;
    assert!(updated);

    let raw = raw_data_of(&t.db, "100")?;
    assert_eq!(raw.get("perplexity").and_then(|p| p.get("description")), Some(&json!("fresh")));
    assert!(raw.get("services").and_then(|s| s.get("perplexity")).is_none(), "legacy key cleared");
    assert_eq!(raw.get("services").and_then(|s| s.get("other")).and_then(|o| o.get("keep")), Some(&json!(true)));
    Ok(())
}

#[test]
fn releases_without_description_sees_both_layouts() -> Result<()> {
    let t = test_db()?;
    // Top-level (Rust pipeline) description present.
    insert_release_with_raw(&t.path, "1", &json!({ "perplexity": {"description": "x"} }))?;
    // Legacy nested description present.
    insert_release_with_raw(&t.path, "2", &json!({ "services": { "perplexity": {"description": "y"} } }))?;
    // Top-level Apple editorial notes (Rust layout) count as a description too.
    insert_release_with_raw(&t.path, "3", &json!({ "apple_music": {"editorial_notes": "notes"} }))?;
    // Nothing at all.
    insert_release_with_raw(&t.path, "4", &json!({}))?;

    let missing = t.db.get_releases_without_description(None)?;
    let ids: Vec<&str> = missing.iter().filter_map(|r| r.discogs_id.as_deref()).collect();
    assert_eq!(ids, vec!["4"], "only the bare release lacks a description: {ids:?}");
    Ok(())
}
