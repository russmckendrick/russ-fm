//! `Db::list_boxsets` / `Db::boxset_member_counts`: the queries behind the TUI Boxsets screen.

use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::{Db, ReleaseRecord};
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
    let path = std::env::temp_dir().join(format!("scrapper-boxsets-test-{}.db", uuid::Uuid::new_v4()));
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

fn release(id: &str, title: &str, formats: Value, tracklist: Value, date_added: &str) -> ReleaseRecord {
    ReleaseRecord {
        id: id.to_string(),
        discogs_id: Some(id.to_string()),
        title: title.to_string(),
        artists: json!([{ "name": "Simple Minds", "discogs_id": "25522", "role": "" }]),
        year: Some(2015),
        released: None,
        country: None,
        formats,
        labels: json!([]),
        genres: json!([]),
        styles: json!([]),
        images: json!([]),
        tracklist,
        videos: json!([]),
        apple_music_id: None,
        spotify_id: None,
        lastfm_mbid: None,
        discogs_url: None,
        apple_music_url: None,
        spotify_url: None,
        lastfm_url: None,
        release_name_discogs: None,
        release_name_apple_music: None,
        release_name_spotify: None,
        enrichment_data: json!({}),
        local_images: json!({}),
        raw_data: json!({}),
        created_at: None,
        updated_at: None,
        date_added: Some(date_added.to_string()),
    }
}

fn headered_tracklist() -> Value {
    json!([
        { "position": "", "title": "Life In A Day", "duration": "" },
        { "position": "A1", "title": "Someone", "duration": "3:39" },
        { "position": "", "title": "Real To Real Cacophony", "duration": "" },
        { "position": "B1", "title": "Real To Real", "duration": "3:23" }
    ])
}

fn flat_tracklist() -> Value {
    json!([{ "position": "A1", "title": "Airbag" }, { "position": "A2", "title": "Paranoid Android" }])
}

#[test]
fn list_boxsets_reports_headers_members_and_order() -> Result<()> {
    let t = test_db()?;
    // Processed box (older): headered tracklist, one linked member.
    t.db.save_release(&release("7709507", "The Vinyl Collection 79-84", json!(["Box Set", "LP"]), headered_tracklist(), "2025-01-01T00:00:00"))?;
    let mut member = release("3974877", "Life In A Day", json!(["Vinyl", "LP"]), flat_tracklist(), "2025-01-01T00:00:00");
    member.raw_data = json!({ "boxset": { "parent_discogs_id": "7709507" } });
    t.db.save_release(&member)?;
    // Unprocessed, headerless box (newer): "BOX" appears mid-list, no members.
    t.db.save_release(&release("6035012", "Marillion.com", json!(["Vinyl", "LP", "BOX"]), flat_tracklist(), "2026-03-03T00:00:00"))?;
    // Plain release: never a box.
    t.db.save_release(&release("1389988", "OK Computer", json!(["CD", "Album"]), flat_tracklist(), "2026-04-04T00:00:00"))?;

    let boxes = t.db.list_boxsets()?;
    let ids: Vec<&str> = boxes.iter().map(|b| b.discogs_id.as_str()).collect();
    assert_eq!(ids, vec!["6035012", "7709507"], "box-format rows only, newest first: {boxes:#?}");

    let marillion = &boxes[0];
    assert!(!marillion.has_headers);
    assert_eq!(marillion.member_count, 0);
    assert!(!marillion.is_processed());
    assert_eq!(marillion.artist_names, vec!["Simple Minds".to_string()]);

    let vinyl = &boxes[1];
    assert!(vinyl.has_headers);
    assert_eq!(vinyl.member_count, 1);
    assert!(vinyl.is_processed());

    let counts = t.db.boxset_member_counts()?;
    assert_eq!(counts.get("7709507").copied(), Some(1));
    assert_eq!(counts.len(), 1);
    Ok(())
}

#[test]
fn boxset_queries_tolerate_malformed_json_columns() -> Result<()> {
    let t = test_db()?;
    t.db.save_release(&release("7709507", "The Vinyl Collection 79-84", json!(["Box Set"]), headered_tracklist(), "2025-01-01T00:00:00"))?;
    let conn = rusqlite::Connection::open(&t.path)?;
    // Legacy rows: empty / non-JSON raw_data and formats text (Python-era leftovers).
    conn.execute(
        "INSERT INTO releases (id, discogs_id, title, artists, formats, tracklist, raw_data) VALUES (?1, ?1, ?2, '[]', 'box set text', '', '')",
        rusqlite::params!["1", "Empty"],
    )?;
    conn.execute(
        "INSERT INTO releases (id, discogs_id, title, artists, formats, tracklist, raw_data) VALUES (?1, ?1, ?2, '[]', '[\"Box Set\"]', '[]', 'not json')",
        rusqlite::params!["2", "Broken"],
    )?;

    let counts = t.db.boxset_member_counts()?;
    assert!(counts.is_empty(), "{counts:?}");
    let boxes = t.db.list_boxsets()?;
    let ids: Vec<&str> = boxes.iter().map(|b| b.discogs_id.as_str()).collect();
    // 'box set text' is not a JSON list so the Rust-side rule excludes it; the broken raw_data
    // row is still a valid box.
    assert!(ids.contains(&"7709507") && ids.contains(&"2") && !ids.contains(&"1"), "{ids:?}");
    Ok(())
}
