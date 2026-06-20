//! `release` command and the reusable single-release processing pipeline used by `collection`.
//!
//! `process_release` fetches a release from Discogs, enriches it across services, and (when
//! asked) persists to the DB and writes the public JSON + hi-res artwork.

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

/// Which services contributed enrichment for a release.
#[derive(Clone, Copy)]
pub struct EnrichFlags {
    pub apple: bool,
    pub spotify: bool,
    pub lastfm: bool,
}

/// Strip a Discogs disambiguation suffix like " (2)" from an artist name.
fn clean_artist_name(name: &str) -> String {
    static SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*\(\d+\)$").unwrap());
    SUFFIX.replace(name.trim(), "").to_string()
}

pub fn prefer_key(p: Option<ImageSource>) -> Option<&'static str> {
    p.map(|s| match s {
        ImageSource::AppleMusic => "apple_music",
        ImageSource::Spotify => "spotify",
        ImageSource::Theaudiodb => "theaudiodb",
        ImageSource::Discogs => "discogs",
        ImageSource::V1 => "v1",
    })
}

/// Shared HTTP client for artwork downloads.
pub fn image_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("MusicCollectionManager/1.0")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .expect("building image client")
}

fn str_field(v: &Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for p in path {
        cur = cur.get(p)?;
    }
    cur.as_str().map(String::from)
}

/// Fetch, enrich and assemble a release. When `write_files` is set, also download the hi-res
/// artwork, persist to the DB and write the public JSON. Returns the (possibly DB-reloaded)
/// record and the enrichment flags.
pub async fn process_release(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    discogs_id: &str,
    write_files: bool,
    prefer: Option<&str>,
) -> Result<(ReleaseRecord, EnrichFlags)> {
    let discogs = services
        .discogs
        .get_release(discogs_id)
        .await
        .with_context(|| format!("fetching Discogs release {discogs_id}"))?;

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

    // Enrich concurrently.
    let (apple, spotify, lastfm) = tokio::join!(
        enrich_apple(services, &primary_artist, &title),
        enrich_spotify(services, &primary_artist, &title),
        enrich_lastfm(services, &primary_artist, &title),
    );
    let flags = EnrichFlags { apple: apple.is_some(), spotify: spotify.is_some(), lastfm: lastfm.is_some() };

    // Assemble raw_data + external IDs.
    let mut raw = Map::new();
    raw.insert("discogs".into(), json!({ "images": discogs.get("images").cloned().unwrap_or(json!([])) }));
    if let Some(a) = &apple {
        raw.insert("apple_music".into(), a.clone());
    }
    if let Some(s) = &spotify {
        raw.insert("spotify".into(), s.clone());
    }
    if let Some(l) = &lastfm {
        raw.insert("lastfm".into(), l.clone());
    }
    let raw_data = Value::Object(raw);

    let existing = db.get_release_by_discogs_id(discogs_id)?;
    let now = now_iso();
    let created_at = existing.as_ref().and_then(|r| r.created_at.clone()).unwrap_or_else(|| now.clone());
    let date_added = existing.as_ref().and_then(|r| r.date_added.clone());

    let folder = release_folder_name(&title, discogs_id);
    let data_rel = format!("{}/{}", cfg.data.path, cfg.releases.path);
    let local_images = json!({
        "hi-res": format!("{data_rel}/{folder}/{folder}-hi-res.jpg"),
        "medium": format!("{data_rel}/{folder}/{folder}-medium.jpg"),
        "small": format!("{data_rel}/{folder}/{folder}-small.jpg"),
    });

    let mut rec = ReleaseRecord {
        id: discogs_id.to_string(),
        discogs_id: Some(discogs_id.to_string()),
        title: title.clone(),
        artists: Value::Array(artists_json),
        year: discogs.get("year").and_then(|y| y.as_i64()),
        released: str_field(&discogs, &["released"]),
        country: str_field(&discogs, &["country"]),
        formats: Value::Array(name_list("formats")),
        labels: Value::Array(name_list("labels")),
        genres: discogs.get("genres").cloned().unwrap_or_else(|| json!([])),
        styles: discogs.get("styles").cloned().unwrap_or_else(|| json!([])),
        images: Value::Array(images_json),
        tracklist: Value::Array(tracklist_json),
        videos: json!(videos),
        apple_music_id: apple.as_ref().and_then(|a| a.get("id")).and_then(|v| v.as_str()).map(String::from),
        spotify_id: spotify.as_ref().and_then(|s| s.get("id")).and_then(|v| v.as_str()).map(String::from),
        lastfm_mbid: lastfm.as_ref().and_then(|l| l.get("mbid")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
        discogs_url,
        apple_music_url: apple.as_ref().and_then(|a| a.get("url")).and_then(|v| v.as_str()).map(String::from),
        spotify_url: spotify.as_ref().and_then(|s| s.get("url")).and_then(|v| v.as_str()).map(String::from),
        lastfm_url: lastfm.as_ref().and_then(|l| l.get("url")).and_then(|v| v.as_str()).map(String::from),
        release_name_discogs: Some(title.clone()),
        release_name_apple_music: apple.as_ref().and_then(|a| a.get("name")).and_then(|v| v.as_str()).map(String::from),
        release_name_spotify: spotify.as_ref().and_then(|s| s.get("name")).and_then(|v| v.as_str()).map(String::from),
        enrichment_data: json!({}),
        local_images,
        raw_data,
        created_at: Some(created_at),
        updated_at: Some(now),
        date_added,
    };

    if write_files {
        let album_dir = cfg.releases_dir();
        let target = cfg.image_sizes.hi_res.split('x').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(2000);
        let _ = images::download_release_hires(client, &album_dir, &folder, &rec.raw_data, target, prefer).await;

        db.save_release(&rec).context("saving release to database")?;
        if let Some(saved) = db.get_release_by_discogs_id(discogs_id)? {
            rec = saved;
        }
        let value = release_to_value(&rec, db);
        let release_folder = album_dir.join(&folder);
        std::fs::create_dir_all(&release_folder)?;
        std::fs::write(release_folder.join(format!("{folder}.json")), to_pretty_sorted(&value))?;
    }

    Ok((rec, flags))
}

pub async fn run(cfg: &Config, args: ReleaseArgs) -> Result<()> {
    let services = Services::new(cfg);
    let db = Db::open(cfg.db_path())?;
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    let client = image_client();

    println!("Fetching & enriching Discogs release {}...", args.discogs_id);
    let (rec, flags) =
        process_release(cfg, &services, &db, &client, &args.discogs_id, args.save, prefer_key(args.prefer)).await?;

    print_summary(&rec, flags);
    if matches!(args.output, OutputFormat::Json) {
        println!("{}", to_pretty_sorted(&release_to_value(&rec, &db)));
    }
    if args.save {
        let folder = release_folder_name(&rec.title, &args.discogs_id);
        println!("\nSaved to DB and wrote {}/{folder}/", cfg.releases_dir().display());
    } else {
        println!("\n(dry view — pass --save to write to the database, JSON and artwork)");
    }
    Ok(())
}

fn print_summary(rec: &ReleaseRecord, flags: EnrichFlags) {
    let mark = |b: bool| if b { "✓" } else { "–" };
    println!("\n  {}  ({})", rec.title, rec.year.unwrap_or(0));
    println!("  discogs_id: {}", rec.discogs_id.as_deref().unwrap_or("?"));
    println!("  tracks: {}", rec.tracklist.as_array().map(|a| a.len()).unwrap_or(0));
    println!("  enrichment: apple {} | spotify {} | lastfm {}", mark(flags.apple), mark(flags.spotify), mark(flags.lastfm));
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
