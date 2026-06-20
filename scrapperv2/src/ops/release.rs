//! `release` command — fetch a release from Discogs, enrich it across services, and (with
//! `--save`) persist to the DB and write the public JSON + hi-res artwork.

use anyhow::{bail, Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Map, Value};

use crate::cli::{EnrichDescriptionArgs, ImageSource, OutputFormat, ReleaseArgs};
use crate::db::{Db, ReleaseRecord};
use crate::output::{images, release_to_value, to_pretty_sorted};
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::util::now_iso;
use crate::Config;

/// Strip a Discogs disambiguation suffix like " (2)" from an artist name.
fn clean_artist_name(name: &str) -> String {
    static SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*\(\d+\)$").unwrap());
    SUFFIX.replace(name.trim(), "").to_string()
}

fn prefer_key(p: Option<ImageSource>) -> Option<&'static str> {
    p.map(|s| match s {
        ImageSource::AppleMusic => "apple_music",
        ImageSource::Spotify => "spotify",
        ImageSource::Theaudiodb => "theaudiodb",
        ImageSource::Discogs => "discogs",
        ImageSource::V1 => "v1",
    })
}

fn str_field(v: &Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for p in path {
        cur = cur.get(p)?;
    }
    cur.as_str().map(String::from)
}

pub async fn run(cfg: &Config, args: ReleaseArgs) -> Result<()> {
    let services = Services::new(cfg);
    let db = Db::open(cfg.db_path())?;

    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }

    println!("Fetching Discogs release {}...", args.discogs_id);
    let discogs = services
        .discogs
        .get_release(&args.discogs_id)
        .await
        .with_context(|| format!("fetching Discogs release {}", args.discogs_id))?;

    // --- Parse the Discogs release ---
    let title = str_field(&discogs, &["title"]).unwrap_or_default();
    let primary_artist = discogs
        .get("artists")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .map(clean_artist_name)
        .unwrap_or_default();

    let artists_json: Vec<Value> = discogs
        .get("artists")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|a| {
                    json!({
                        "name": clean_artist_name(a.get("name").and_then(|n| n.as_str()).unwrap_or("")),
                        "role": a.get("role").cloned().unwrap_or_else(|| json!("")),
                        "discogs_id": a.get("id").map(|i| json!(i.to_string())).unwrap_or(Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let name_list = |key: &str| -> Vec<Value> {
        discogs
            .get(key)
            .and_then(|a| a.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.get("name").cloned()).collect())
            .unwrap_or_default()
    };
    let formats = name_list("formats");
    let labels = name_list("labels");
    let genres = discogs.get("genres").cloned().unwrap_or_else(|| json!([]));
    let styles = discogs.get("styles").cloned().unwrap_or_else(|| json!([]));

    let images_json: Vec<Value> = discogs
        .get("images")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|img| {
                    json!({
                        "url": img.get("uri").cloned().unwrap_or(Value::Null),
                        "type": img.get("type").cloned().unwrap_or(Value::Null),
                        "width": img.get("width").cloned().unwrap_or(Value::Null),
                        "height": img.get("height").cloned().unwrap_or(Value::Null),
                        "resource_url": img.get("resource_url").cloned().unwrap_or(Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let tracklist_json: Vec<Value> = discogs
        .get("tracklist")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|t| {
                    json!({
                        "position": t.get("position").cloned().unwrap_or_else(|| json!("")),
                        "title": t.get("title").cloned().unwrap_or_else(|| json!("")),
                        "duration": t.get("duration").cloned().unwrap_or_else(|| json!("")),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let videos = crate::services::discogs::DiscogsService::extract_video_uris(&discogs);
    let discogs_url = str_field(&discogs, &["uri"]);

    // --- Enrich concurrently ---
    println!("Enriching: {} — {}", primary_artist, title);
    let (apple, spotify, lastfm) = tokio::join!(
        enrich_apple(&services, &primary_artist, &title),
        enrich_spotify(&services, &primary_artist, &title),
        enrich_lastfm(&services, &primary_artist, &title),
    );

    // --- Assemble raw_data + external IDs ---
    let mut raw = Map::new();
    raw.insert("discogs".into(), json!({ "images": discogs.get("images").cloned().unwrap_or(json!([])) }));

    let (mut apple_id, mut apple_url, mut apple_name) = (None, None, None);
    if let Some(a) = &apple {
        apple_id = a.get("id").and_then(|v| v.as_str()).map(String::from);
        apple_url = a.get("url").and_then(|v| v.as_str()).map(String::from);
        apple_name = a.get("name").and_then(|v| v.as_str()).map(String::from);
        raw.insert("apple_music".into(), a.clone());
    }
    let (mut spotify_id, mut spotify_url, mut spotify_name) = (None, None, None);
    if let Some(s) = &spotify {
        spotify_id = s.get("id").and_then(|v| v.as_str()).map(String::from);
        spotify_url = s.get("url").and_then(|v| v.as_str()).map(String::from);
        spotify_name = s.get("name").and_then(|v| v.as_str()).map(String::from);
        raw.insert("spotify".into(), s.clone());
    }
    let (mut lastfm_mbid, mut lastfm_url) = (None, None);
    if let Some(l) = &lastfm {
        lastfm_mbid = l.get("mbid").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
        lastfm_url = l.get("url").and_then(|v| v.as_str()).map(String::from);
        raw.insert("lastfm".into(), l.clone());
    }
    let raw_data = Value::Object(raw);

    // Preserve created_at/date_added if the release already exists.
    let existing = db.get_release_by_discogs_id(&args.discogs_id)?;
    let now = now_iso();
    let created_at = existing.as_ref().and_then(|r| r.created_at.clone()).unwrap_or_else(|| now.clone());
    let date_added = existing.as_ref().and_then(|r| r.date_added.clone());

    let folder = release_folder_name(&title, &args.discogs_id);
    let data_rel = format!("{}/{}", cfg.data.path, cfg.releases.path); // e.g. ../public/album
    let local_images = json!({
        "hi-res": format!("{data_rel}/{folder}/{folder}-hi-res.jpg"),
        "medium": format!("{data_rel}/{folder}/{folder}-medium.jpg"),
        "small": format!("{data_rel}/{folder}/{folder}-small.jpg"),
    });

    let mut rec = ReleaseRecord {
        id: args.discogs_id.clone(),
        discogs_id: Some(args.discogs_id.clone()),
        title: title.clone(),
        artists: Value::Array(artists_json),
        year: discogs.get("year").and_then(|y| y.as_i64()),
        released: str_field(&discogs, &["released"]),
        country: str_field(&discogs, &["country"]),
        formats: Value::Array(formats),
        labels: Value::Array(labels),
        genres,
        styles,
        images: Value::Array(images_json),
        tracklist: Value::Array(tracklist_json),
        videos: json!(videos),
        apple_music_id: apple_id.take(),
        spotify_id: spotify_id.take(),
        lastfm_mbid: lastfm_mbid.take(),
        discogs_url,
        apple_music_url: apple_url.take(),
        spotify_url: spotify_url.take(),
        lastfm_url: lastfm_url.take(),
        release_name_discogs: Some(title.clone()),
        release_name_apple_music: apple_name.take(),
        release_name_spotify: spotify_name.take(),
        enrichment_data: json!({}),
        local_images: local_images.clone(),
        raw_data,
        created_at: Some(created_at),
        updated_at: Some(now),
        date_added,
    };

    // --- Display ---
    print_summary(&rec, apple.is_some(), spotify.is_some(), lastfm.is_some());
    if matches!(args.output, OutputFormat::Json) {
        let value = release_to_value(&rec, &db);
        println!("{}", to_pretty_sorted(&value));
    }

    if !args.save {
        println!("\n(dry view — pass --save to write to the database, JSON and artwork)");
        return Ok(());
    }

    // --- Persist: image, DB, JSON ---
    let album_dir = cfg.releases_dir();
    let target = cfg
        .image_sizes
        .hi_res
        .split('x')
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(2000);
    let client = reqwest::Client::builder()
        .user_agent("MusicCollectionManager/1.0")
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    match images::download_release_hires(&client, &album_dir, &folder, &rec.raw_data, target, prefer_key(args.prefer)).await {
        Some(p) => println!("Saved artwork: {}", p.display()),
        None => println!("Warning: could not download artwork from any source"),
    }

    db.save_release(&rec).context("saving release to database")?;
    println!("Saved release to database.");

    // Re-fetch from DB so the written JSON reflects persisted state.
    if let Some(saved) = db.get_release_by_discogs_id(&args.discogs_id)? {
        rec = saved;
    }
    let value = release_to_value(&rec, &db);
    let release_folder = album_dir.join(&folder);
    std::fs::create_dir_all(&release_folder)?;
    let json_path = release_folder.join(format!("{folder}.json"));
    std::fs::write(&json_path, to_pretty_sorted(&value))?;
    println!("Wrote {}", json_path.display());

    Ok(())
}

fn print_summary(rec: &ReleaseRecord, apple: bool, spotify: bool, lastfm: bool) {
    let mark = |b: bool| if b { "✓" } else { "–" };
    println!("\n  {}  ({})", rec.title, rec.year.unwrap_or(0));
    println!("  discogs_id: {}", rec.discogs_id.as_deref().unwrap_or("?"));
    let tracks = rec.tracklist.as_array().map(|a| a.len()).unwrap_or(0);
    println!("  tracks: {tracks}");
    println!("  enrichment: apple {} | spotify {} | lastfm {}", mark(apple), mark(spotify), mark(lastfm));
}

/// Apple Music: search by artist+album, take the first album, build the public service dict.
async fn enrich_apple(services: &Services, artist: &str, album: &str) -> Option<Value> {
    if !services.apple_music.is_configured() {
        return None;
    }
    let resp = services.apple_music.search_release(artist, album).await.ok()?;
    let item = resp.get("results")?.get("albums")?.get("data")?.as_array()?.first()?;
    let attrs = item.get("attributes").cloned().unwrap_or(json!({}));
    Some(json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": attrs.get("name").cloned().unwrap_or(Value::Null),
        "url": attrs.get("url").cloned().unwrap_or(Value::Null),
        "artwork_url": attrs.get("artwork").and_then(|a| a.get("url")).cloned().unwrap_or(Value::Null),
        "preview_url": Value::Null,
        "copyright": attrs.get("copyright").cloned().unwrap_or(Value::Null),
        "editorial_notes": attrs.get("editorialNotes").and_then(|e| e.get("standard")).cloned().unwrap_or(Value::Null),
        "is_complete": attrs.get("isComplete").cloned().unwrap_or(json!(false)),
        "content_rating": attrs.get("contentRating").cloned().unwrap_or(Value::Null),
        "raw_attributes": attrs,
    }))
}

/// Spotify: search by artist+album, take the first album.
async fn enrich_spotify(services: &Services, artist: &str, album: &str) -> Option<Value> {
    if !services.spotify.is_configured() {
        return None;
    }
    let resp = services.spotify.search_release(artist, album).await.ok()?;
    let item = resp.get("albums")?.get("items")?.as_array()?.first()?;
    Some(json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": item.get("name").cloned().unwrap_or(Value::Null),
        "url": item.get("external_urls").and_then(|e| e.get("spotify")).cloned().unwrap_or(Value::Null),
        "images": item.get("images").cloned().unwrap_or(json!([])),
        "album_type": item.get("album_type").cloned().unwrap_or(Value::Null),
        "total_tracks": item.get("total_tracks").cloned().unwrap_or(Value::Null),
        "release_date": item.get("release_date").cloned().unwrap_or(Value::Null),
        "release_date_precision": item.get("release_date_precision").cloned().unwrap_or(Value::Null),
        "popularity": item.get("popularity").cloned().unwrap_or(Value::Null),
    }))
}

/// Last.fm: album.getInfo, build the public service dict.
async fn enrich_lastfm(services: &Services, artist: &str, album: &str) -> Option<Value> {
    if !services.lastfm.is_configured() {
        return None;
    }
    let resp = services.lastfm.get_album_info(artist, album).await.ok()?;
    let a = resp.get("album")?;
    let tags: Vec<Value> = a
        .get("tags")
        .and_then(|t| t.get("tag"))
        .and_then(|t| t.as_array())
        .map(|arr| arr.iter().filter_map(|t| t.get("name").cloned()).collect())
        .unwrap_or_default();
    let images: Vec<Value> = a
        .get("image")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .map(|img| json!({
                    "size": img.get("size").cloned().unwrap_or(Value::Null),
                    "url": img.get("#text").cloned().unwrap_or(Value::Null),
                }))
                .collect()
        })
        .unwrap_or_default();
    Some(json!({
        "mbid": a.get("mbid").cloned().unwrap_or(Value::Null),
        "url": a.get("url").cloned().unwrap_or(Value::Null),
        "listeners": a.get("listeners").cloned().unwrap_or(Value::Null),
        "playcount": a.get("playcount").cloned().unwrap_or(Value::Null),
        "tags": tags,
        "wiki_summary": a.get("wiki").and_then(|w| w.get("summary")).cloned().unwrap_or(Value::Null),
        "wiki_content": a.get("wiki").and_then(|w| w.get("content")).cloned().unwrap_or(Value::Null),
        "images": images,
    }))
}

pub async fn enrich_descriptions(_cfg: &Config, _args: &EnrichDescriptionArgs) -> Result<()> {
    bail!("Perplexity description generation is wired through the services layer but the enrich-description batch flow is not yet ported. Use `enrich-description --list-missing` to inspect candidates.");
}
