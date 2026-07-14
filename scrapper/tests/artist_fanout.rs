//! `persist_artist` must rewrite every release JSON that embeds the artist — release files
//! join biography/wikipedia/service ids from the artists table at write time, so an artist
//! edit that only rewrote the artist JSON would leave them stale.

use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::{ArtistRecord, Db, ReleaseRecord};
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
    let db_path = std::env::temp_dir().join(format!("scrapper-fanout-{tag}.db"));
    let data_dir = std::env::temp_dir().join(format!("scrapper-fanout-data-{tag}"));
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

fn artist(name: &str, discogs_id: &str) -> ArtistRecord {
    ArtistRecord {
        id: name.to_lowercase().replace(' ', "-"),
        name: name.to_string(),
        biography: Some("Original bio".to_string()),
        discogs_id: Some(discogs_id.to_string()),
        apple_music_id: None,
        spotify_id: None,
        lastfm_mbid: None,
        discogs_url: None,
        apple_music_url: None,
        spotify_url: None,
        lastfm_url: None,
        wikipedia_url: None,
        genres: json!([]),
        popularity: None,
        followers: None,
        country: None,
        formed_date: None,
        images: json!([]),
        local_images: json!({}),
        enrichment_data: json!({}),
        raw_data: json!({}),
        created_at: None,
        updated_at: None,
    }
}

fn release(id: &str, title: &str, artists: Value) -> ReleaseRecord {
    ReleaseRecord {
        id: id.to_string(),
        discogs_id: Some(id.to_string()),
        title: title.to_string(),
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

fn release_json(env: &TestEnv, folder: &str) -> Result<Value> {
    let path = env.data_dir.join("album").join(folder).join(format!("{folder}.json"));
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn embedded_bio(v: &Value, artist_name: &str) -> Option<String> {
    v.get("artists")?
        .as_array()?
        .iter()
        .find(|a| a.get("name").and_then(|n| n.as_str()) == Some(artist_name))?
        .get("biography")?
        .as_str()
        .map(String::from)
}

#[test]
fn artist_edit_fans_out_to_embedding_release_jsons() -> Result<()> {
    let env = test_env()?;
    let a = artist("Steve White", "264979");
    env.db.save_artist(&a)?;
    // One release matches the artist by discogs_id, the other only by (case-insensitive) name.
    env.db.save_release(&release(
        "100",
        "By Id Album",
        json!([{ "name": "Steve White", "discogs_id": "264979", "role": "" }]),
    ))?;
    env.db.save_release(&release(
        "200",
        "By Name Album",
        json!([{ "name": "steve white", "role": "" }]),
    ))?;
    env.db.save_release(&release(
        "300",
        "Unrelated Album",
        json!([{ "name": "Someone Else", "discogs_id": "1", "role": "" }]),
    ))?;

    let matched = env.db.releases_embedding_artist(Some("264979"), "Steve White")?;
    assert_eq!(matched.len(), 2, "matched: {:?}", matched.iter().map(|r| &r.title).collect::<Vec<_>>());

    let (_, fanout) =
        scrapper::ops::artist::set_artist_value(&env.cfg, &env.db, &a, scrapper::ops::artist::ArtistField::Biography, "A brand new biography")?;
    assert_eq!(fanout, 2);

    // The artist JSON and both embedding release JSONs carry the new biography.
    let artist_json: Value =
        serde_json::from_str(&std::fs::read_to_string(env.data_dir.join("artist/steve-white/steve-white.json"))?)?;
    assert_eq!(artist_json.get("biography").and_then(|b| b.as_str()), Some("A brand new biography"));
    assert_eq!(embedded_bio(&release_json(&env, "by-id-album-100")?, "Steve White").as_deref(), Some("A brand new biography"));
    assert_eq!(embedded_bio(&release_json(&env, "by-name-album-200")?, "steve white").as_deref(), Some("A brand new biography"));
    // The unrelated release JSON was not written at all.
    assert!(!env.data_dir.join("album/unrelated-album-300").exists());
    Ok(())
}
