//! Detail-editor setters: every hand-editable field round-trips through
//! `set_release_value`/`set_artist_value` and `Field::get`, validation rejects bad input
//! without saving, and slug-changing title/name edits are refused (until folder renames land).

use std::path::{Path, PathBuf};

use anyhow::Result;
use scrapper::db::{ArtistRecord, Db, ReleaseRecord};
use scrapper::ops::artist::{set_artist_value, ArtistField};
use scrapper::ops::release::{set_release_value, ReleaseField};
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
    let db_path = std::env::temp_dir().join(format!("scrapper-editor-{tag}.db"));
    let data_dir = std::env::temp_dir().join(format!("scrapper-editor-data-{tag}"));
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

fn release() -> ReleaseRecord {
    ReleaseRecord {
        id: "100".into(),
        discogs_id: Some("100".into()),
        title: "Test Album".into(),
        artists: json!([{ "name": "Test Band", "discogs_id": "1", "role": "" }]),
        year: Some(2020),
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

fn artist() -> ArtistRecord {
    ArtistRecord {
        id: "test-band".into(),
        name: "Test Band".into(),
        biography: None,
        discogs_id: Some("1".into()),
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

#[test]
fn release_setters_round_trip_through_get() -> Result<()> {
    let env = test_env()?;
    env.db.save_release(&release())?;
    let rec = env.db.get_release_by_discogs_id("100")?.unwrap();

    let cases: Vec<(ReleaseField, &str)> = vec![
        (ReleaseField::Year, "1994"),
        (ReleaseField::Released, "1994-06-01"),
        (ReleaseField::Country, "UK"),
        (ReleaseField::Labels, "Creation, Sony"),
        (ReleaseField::Formats, "Vinyl, LP"),
        (ReleaseField::Genres, "Rock, Electronic"),
        (ReleaseField::Styles, "Shoegaze"),
        (ReleaseField::Apple, "https://music.apple.com/gb/album/x/123"),
        (ReleaseField::DateAdded, "2026-06-01T00:00:00-08:00"),
        (ReleaseField::Description, "A very fine record."),
    ];
    let mut rec = rec;
    for (field, text) in cases {
        rec = set_release_value(&env.cfg, &env.db, &rec, field, text)?;
        assert_eq!(field.get(&rec), text, "round-trip failed for {}", field.label());
    }

    // Blank clears nullable fields and lists.
    rec = set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Country, "  ")?;
    assert_eq!(rec.country, None);
    rec = set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Genres, "")?;
    assert_eq!(rec.genres, json!([]));

    // The public JSON reflects the edits.
    let path = env.data_dir.join("album/test-album-100/test-album-100.json");
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    assert_eq!(doc.get("year"), Some(&json!(1994)));
    assert_eq!(doc.get("labels"), Some(&json!(["Creation", "Sony"])));
    Ok(())
}

#[test]
fn release_setters_reject_bad_input_without_saving() -> Result<()> {
    let env = test_env()?;
    env.db.save_release(&release())?;
    let rec = env.db.get_release_by_discogs_id("100")?.unwrap();

    assert!(set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Year, "banana").is_err());
    assert!(set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Released, "01/06/1994").is_err());
    assert!(set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Title, "").is_err());
    // A same-slug title change (case only) is allowed and sets the Discogs name too.
    let rec = set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Title, "TEST ALBUM")?;
    assert_eq!(rec.title, "TEST ALBUM");
    assert_eq!(rec.release_name_discogs.as_deref(), Some("TEST ALBUM"));

    let stored = env.db.get_release_by_discogs_id("100")?.unwrap();
    assert_eq!(stored.year, Some(2020), "failed validations must not persist anything");
    Ok(())
}

#[test]
fn slug_changing_title_edit_renames_the_public_folder() -> Result<()> {
    let env = test_env()?;
    env.db.save_release(&release())?;
    let rec = env.db.get_release_by_discogs_id("100")?.unwrap();
    // Seed the current public folder with an image and JSON under the old slug.
    let old_dir = env.data_dir.join("album/test-album-100");
    std::fs::create_dir_all(&old_dir)?;
    std::fs::write(old_dir.join("test-album-100-hi-res.jpg"), "jpg")?;
    std::fs::write(old_dir.join("test-album-100.json"), "{}")?;

    let rec = set_release_value(&env.cfg, &env.db, &rec, ReleaseField::Title, "Completely Different")?;
    assert_eq!(rec.title, "Completely Different");

    let new_dir = env.data_dir.join("album/completely-different-100");
    assert!(!old_dir.exists(), "old folder moved");
    assert!(new_dir.join("completely-different-100-hi-res.jpg").exists(), "image carried and renamed");
    assert!(!new_dir.join("test-album-100.json").exists(), "stale JSON dropped");
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(new_dir.join("completely-different-100.json"))?)?;
    assert_eq!(doc.get("title"), Some(&json!("Completely Different")));
    assert!(
        doc.get("local_images").and_then(|l| l.get("hi-res")).and_then(|v| v.as_str()).unwrap_or_default().contains("completely-different-100"),
        "local_images repointed at the new slug"
    );
    Ok(())
}

#[test]
fn slug_changing_artist_rename_moves_folder_and_renames_release_entries() -> Result<()> {
    let env = test_env()?;
    env.db.save_artist(&artist())?;
    let a = env.db.get_artist_by_discogs_id("1")?.unwrap();
    env.db.save_release(&release())?; // embeds "Test Band" by discogs_id 1
    let old_dir = env.data_dir.join("artist/test-band");
    std::fs::create_dir_all(&old_dir)?;
    std::fs::write(old_dir.join("test-band-avatar.jpg"), "jpg")?;
    std::fs::write(old_dir.join("test-band.json"), "{}")?;

    let (a, fanout) = set_artist_value(&env.cfg, &env.db, &a, ArtistField::Name, "Renamed Band")?;
    assert_eq!(a.name, "Renamed Band");
    assert_eq!(fanout, 1, "the embedding release JSON was rewritten");

    let new_dir = env.data_dir.join("artist/renamed-band");
    assert!(!old_dir.exists(), "old folder moved");
    assert!(new_dir.join("renamed-band-avatar.jpg").exists(), "avatar carried and renamed");
    assert!(new_dir.join("renamed-band.json").exists(), "fresh artist JSON under the new slug");

    // The embedding release row and its public JSON now carry the new name.
    let r = env.db.get_release_by_discogs_id("100")?.unwrap();
    assert_eq!(r.artists[0].get("name"), Some(&json!("Renamed Band")));
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(
        env.data_dir.join("album/test-album-100/test-album-100.json"),
    )?)?;
    assert_eq!(doc.get("artists").and_then(|a| a.get(0)).and_then(|a| a.get("name")), Some(&json!("Renamed Band")));
    Ok(())
}

#[test]
fn artist_setters_validate_and_round_trip() -> Result<()> {
    let env = test_env()?;
    env.db.save_artist(&artist())?;
    let rec = env.db.get_artist_by_discogs_id("1")?.unwrap();

    let (rec, _) = set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Country, "Wales")?;
    assert_eq!(ArtistField::Country.get(&rec), "Wales");
    let (rec, _) = set_artist_value(&env.cfg, &env.db, &rec, ArtistField::FormedDate, "1989")?;
    assert_eq!(rec.formed_date.as_deref(), Some("1989"));
    let (rec, _) = set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Popularity, "85")?;
    assert_eq!(rec.popularity, Some(85));
    let (rec, _) = set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Followers, "16300000")?;
    assert_eq!(rec.followers, Some(16_300_000));

    assert!(set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Popularity, "101").is_err());
    assert!(set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Followers, "-3").is_err());
    assert!(set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Name, "").is_err());
    // Same-slug rename (case only) is fine and needs no folder move.
    let (rec, _) = set_artist_value(&env.cfg, &env.db, &rec, ArtistField::Name, "TEST BAND")?;
    assert_eq!(rec.name, "TEST BAND");
    Ok(())
}
