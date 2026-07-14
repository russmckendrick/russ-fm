//! `output::collection::regenerate` writes `<data>/collection.json` from the DB — the hook every
//! mutating action (CLI save, TUI edit/refresh) relies on to keep the frontend index fresh.

use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::{Db, ReleaseRecord};
use scrapper::Config;
use serde_json::{json, Value};

struct TestEnv {
    cfg: Config,
    db: Db,
    db_path: PathBuf,
    data_dir: PathBuf,
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.db_path);
        let _ = std::fs::remove_dir_all(&self.data_dir);
    }
}

fn test_env() -> Result<TestEnv> {
    let tag = uuid::Uuid::new_v4();
    let db_path = std::env::temp_dir().join(format!("scrapper-regen-{tag}.db"));
    let data_dir = std::env::temp_dir().join(format!("scrapper-regen-data-{tag}"));
    std::fs::create_dir_all(&data_dir)?;
    create_schema(&db_path)?;

    let mut cfg = Config {
        base_dir: data_dir.clone(),
        ..Config::default()
    };
    cfg.data.path = ".".into();
    cfg.releases.path = "album".into();
    cfg.artists.path = "artist".into();

    Ok(TestEnv {
        cfg,
        db: Db::open(&db_path)?,
        db_path,
        data_dir,
    })
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

fn release(id: &str, title: &str, artist: &str, date_added: &str) -> ReleaseRecord {
    ReleaseRecord {
        id: id.to_string(),
        discogs_id: Some(id.to_string()),
        title: title.to_string(),
        artists: json!([{ "name": artist, "discogs_id": id, "role": "" }]),
        year: Some(2026),
        released: None,
        country: None,
        formats: json!(["Vinyl"]),
        labels: json!([]),
        genres: json!(["Rock"]),
        styles: json!([]),
        images: json!([]),
        tracklist: json!([]),
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

#[test]
fn regenerate_writes_collection_json_newest_first() -> Result<()> {
    let env = test_env()?;
    env.db.save_release(&release("100", "Older Album", "Old Band", "2024-01-01T00:00:00-08:00"))?;
    env.db.save_release(&release("200", "Newer Album", "New Band", "2026-06-01T00:00:00-08:00"))?;

    let count = scrapper::output::collection::regenerate(&env.cfg, &env.db)?;
    assert_eq!(count, 2);

    let out = env.data_dir.join("collection.json");
    let entries: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&out)?)?;
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].get("release_name").and_then(|v| v.as_str()), Some("Newer Album"));
    assert_eq!(entries[1].get("release_name").and_then(|v| v.as_str()), Some("Older Album"));

    // An edit followed by another regenerate must be reflected in the index.
    let mut edited = release("100", "Older Album", "Old Band", "2024-01-01T00:00:00-08:00");
    edited.genres = json!(["Jazz"]);
    env.db.save_release(&edited)?;
    scrapper::output::collection::regenerate(&env.cfg, &env.db)?;
    let entries: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&out)?)?;
    let older = entries.iter().find(|e| e.get("release_name").and_then(|v| v.as_str()) == Some("Older Album")).unwrap();
    assert_eq!(older.get("genre_names"), Some(&json!(["Jazz"])));
    Ok(())
}
