use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::{ArtistRecord, Db, ReleaseRecord};
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
    let path = std::env::temp_dir().join(format!("scrapper-test-{}.db", uuid::Uuid::new_v4()));
    create_schema(&path)?;
    Ok(TestDb {
        db: Db::open(&path)?,
        path,
    })
}

fn create_schema(path: &Path) -> Result<()> {
    let conn = rusqlite::Connection::open(path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE releases (
            id TEXT PRIMARY KEY,
            discogs_id TEXT,
            title TEXT,
            artists TEXT,
            year INTEGER,
            released TEXT,
            country TEXT,
            formats TEXT,
            labels TEXT,
            genres TEXT,
            styles TEXT,
            images TEXT,
            tracklist TEXT,
            videos TEXT,
            release_name_discogs TEXT,
            release_name_apple_music TEXT,
            release_name_spotify TEXT,
            apple_music_id TEXT,
            spotify_id TEXT,
            lastfm_mbid TEXT,
            discogs_url TEXT,
            apple_music_url TEXT,
            spotify_url TEXT,
            lastfm_url TEXT,
            enrichment_data TEXT,
            created_at TEXT,
            updated_at TEXT,
            date_added TEXT,
            local_images TEXT,
            raw_data TEXT
        );

        CREATE TABLE artists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            biography TEXT,
            discogs_id TEXT,
            apple_music_id TEXT,
            spotify_id TEXT,
            lastfm_mbid TEXT,
            discogs_url TEXT,
            apple_music_url TEXT,
            spotify_url TEXT,
            lastfm_url TEXT,
            wikipedia_url TEXT,
            genres TEXT,
            popularity INTEGER,
            followers INTEGER,
            country TEXT,
            formed_date TEXT,
            images TEXT,
            local_images TEXT,
            enrichment_data TEXT,
            created_at TEXT,
            updated_at TEXT,
            raw_data TEXT
        );
        "#,
    )?;
    Ok(())
}

fn release_with_artists(artists: Value) -> ReleaseRecord {
    ReleaseRecord {
        id: "36819544".to_string(),
        discogs_id: Some("36819544".to_string()),
        title: "Soul Drums".to_string(),
        artists,
        year: Some(2026),
        released: None,
        country: None,
        formats: json!([]),
        labels: json!([]),
        genres: json!([]),
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
        date_added: None,
    }
}

#[test]
fn save_release_should_seed_missing_release_artists() -> Result<()> {
    let test = test_db()?;
    let rec = release_with_artists(json!([
        { "name": "Steve White Trio", "discogs_id": "17473426", "role": "" },
        { "name": "Steve White", "discogs_id": 264979, "role": "" }
    ]));

    test.db.save_release(&rec)?;

    let artists = test.db.list_unenriched_artists(10)?;
    assert!(
        artists
            .iter()
            .any(|artist| artist.name == "Steve White Trio"
                && artist.discogs_id.as_deref() == Some("17473426")),
        "seeded artists: {artists:#?}"
    );
    assert!(
        artists
            .iter()
            .any(|artist| artist.name == "Steve White"
                && artist.discogs_id.as_deref() == Some("264979")),
        "seeded artists: {artists:#?}"
    );
    Ok(())
}

#[test]
fn seed_missing_artists_from_releases_should_backfill_existing_release_rows() -> Result<()> {
    let test = test_db()?;
    let conn = rusqlite::Connection::open(&test.path)?;
    conn.execute(
        "INSERT INTO releases (id, discogs_id, title, artists) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            "36819544",
            "36819544",
            "Soul Drums",
            json!([
                { "name": "Steve White Trio", "discogs_id": "17473426", "role": "" }
            ])
            .to_string()
        ],
    )?;
    drop(conn);

    let seeded = test.db.seed_missing_artists_from_releases()?;

    assert_eq!(seeded, 1);
    let artists = test.db.list_unenriched_artists(10)?;
    assert!(
        artists
            .iter()
            .any(|artist| artist.name == "Steve White Trio"
                && artist.discogs_id.as_deref() == Some("17473426")),
        "seeded artists: {artists:#?}"
    );
    Ok(())
}

#[test]
fn save_release_should_preserve_existing_artist_rows() -> Result<()> {
    let test = test_db()?;
    let existing = ArtistRecord {
        id: "steve-white-trio-existing".to_string(),
        name: "Steve White Trio".to_string(),
        biography: Some("Already enriched".to_string()),
        discogs_id: Some("17473426".to_string()),
        apple_music_id: Some("apple-id".to_string()),
        spotify_id: None,
        lastfm_mbid: None,
        discogs_url: None,
        apple_music_url: None,
        spotify_url: None,
        lastfm_url: None,
        wikipedia_url: None,
        genres: json!(["jazz"]),
        popularity: None,
        followers: None,
        country: None,
        formed_date: None,
        images: json!([]),
        local_images: json!({}),
        enrichment_data: json!({}),
        raw_data: json!({}),
        created_at: Some("2026-01-01T00:00:00.000000".to_string()),
        updated_at: Some("2026-01-01T00:00:00.000000".to_string()),
    };
    test.db.save_artist(&existing)?;
    let rec = release_with_artists(json!([
        { "name": "Steve White Trio", "discogs_id": "17473426", "role": "" }
    ]));

    test.db.save_release(&rec)?;

    let artist = test
        .db
        .get_artist_by_name("Steve White Trio")?
        .expect("existing artist should remain");
    assert_eq!(artist.id, "steve-white-trio-existing");
    assert_eq!(artist.biography.as_deref(), Some("Already enriched"));
    Ok(())
}
