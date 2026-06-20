//! `artist` command — fetch and enrich a single artist by name, writing the public JSON +
//! hi-res image. `artist-batch` reuses the same pipeline across a range.

use anyhow::{bail, Context, Result};
use serde_json::{json, Map, Value};

use crate::cli::{ArtistArgs, ArtistBatchArgs, OutputFormat};
use crate::db::{ArtistRecord, Db};
use crate::ops::release::{image_client, prefer_key};
use crate::output::{artist_to_value, images, to_pretty_sorted};
use crate::sanitize::sanitize_folder_name;
use crate::services::Services;
use crate::util::now_iso;
use crate::Config;

pub async fn run(cfg: &Config, args: ArtistArgs) -> Result<()> {
    let services = Services::new(cfg);
    let db = Db::open(cfg.db_path())?;
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    let client = image_client();

    println!("Searching for artist '{}'...", args.name);
    let (rec, found) = process_artist(cfg, &services, &db, &client, &args.name, args.save, args.theaudiodb, prefer_key(args.prefer)).await?;

    let mark = |b: bool| if b { "✓" } else { "–" };
    println!("\n  {}", rec.name);
    println!("  discogs_id: {}", rec.discogs_id.as_deref().unwrap_or("?"));
    println!("  enrichment: apple {} | spotify {} | lastfm {} | wikipedia {}", mark(found.apple), mark(found.spotify), mark(found.lastfm), mark(found.wikipedia));
    if let Some(bio) = &rec.biography {
        let preview: String = bio.chars().take(160).collect();
        println!("  bio: {preview}{}", if bio.chars().count() > 160 { "…" } else { "" });
    }

    if matches!(args.output, OutputFormat::Json) {
        println!("{}", to_pretty_sorted(&artist_to_value(&rec)));
    }
    if args.save {
        let folder = sanitize_folder_name(&rec.name);
        println!("\nSaved to DB and wrote {}/{folder}/", cfg.artists_dir().display());
    } else {
        println!("\n(dry view — pass --save to write to the database, JSON and image)");
    }
    Ok(())
}

pub async fn run_batch(cfg: &Config, args: ArtistBatchArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let mut artists = db.list_artists(u32::MAX, "name")?;
    if !args.include_various {
        artists.retain(|a| !a.name.eq_ignore_ascii_case("various") && !a.name.eq_ignore_ascii_case("various artists"));
    }

    if args.stats {
        println!("{} artists in the database{}.", artists.len(), if args.include_various { "" } else { " (excluding Various Artists)" });
        return Ok(());
    }

    let from = (args.from as usize).min(artists.len());
    let to = (args.to as usize).min(artists.len());
    let slice = &artists[from..to.max(from)];
    if slice.is_empty() {
        println!("No artists in range [{from}, {to}).");
        return Ok(());
    }

    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        bail!("Discogs is not configured — set discogs.access_token in config.json");
    }
    let client = image_client();
    let prefer = prefer_key(args.prefer);
    let total = slice.len();
    let mut ok = 0usize;

    for (i, a) in slice.iter().enumerate() {
        match process_artist(cfg, &services, &db, &client, &a.name, args.save, args.theaudiodb, prefer).await {
            Ok((_, found)) => {
                ok += 1;
                let m = |b: bool| if b { "✓" } else { "–" };
                println!("[{}/{total}] ✓ {} (apple {} spotify {} lastfm {} wiki {})", i + 1, a.name, m(found.apple), m(found.spotify), m(found.lastfm), m(found.wikipedia));
            }
            Err(e) => println!("[{}/{total}] ✗ {} — {e}", i + 1, a.name),
        }
    }

    println!("\nDone: {ok}/{total} artists processed.");
    Ok(())
}

struct Found {
    apple: bool,
    spotify: bool,
    lastfm: bool,
    wikipedia: bool,
}

#[allow(clippy::too_many_arguments)]
async fn process_artist(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    name: &str,
    write_files: bool,
    use_theaudiodb: bool,
    prefer: Option<&str>,
) -> Result<(ArtistRecord, Found)> {
    // Discogs: search → details.
    let discogs = discogs_artist(services, name).await;
    let display_name = discogs
        .as_ref()
        .and_then(|d| d.get("name").and_then(|n| n.as_str()))
        .unwrap_or(name)
        .to_string();

    let (apple, spotify, lastfm, wiki) = tokio::join!(
        enrich_apple_artist(services, &display_name),
        enrich_spotify_artist(services, &display_name),
        enrich_lastfm_artist(services, &display_name),
        enrich_wikipedia(services, &display_name),
    );
    let theaudiodb = if use_theaudiodb { enrich_theaudiodb(services, &display_name).await } else { None };

    let found = Found { apple: apple.is_some(), spotify: spotify.is_some(), lastfm: lastfm.is_some(), wikipedia: wiki.is_some() };

    // Biography priority: Wikipedia → Last.fm → TheAudioDB.
    let biography = wiki
        .as_ref()
        .and_then(|w| w.get("biography").and_then(|b| b.as_str()).map(String::from))
        .or_else(|| lastfm.as_ref().and_then(|l| l.get("bio_content").and_then(|b| b.as_str()).filter(|s| !s.is_empty()).map(String::from)))
        .or_else(|| theaudiodb.as_ref().and_then(|t| t.get("strBiographyEN").and_then(|b| b.as_str()).map(String::from)));

    let genres = spotify
        .as_ref()
        .and_then(|s| s.get("genres").cloned())
        .filter(|g| g.as_array().map(|a| !a.is_empty()).unwrap_or(false))
        .or_else(|| apple.as_ref().and_then(|a| a.get("genres").cloned()))
        .unwrap_or_else(|| json!([]));

    // Combine images (spotify + apple) into {url,type,width,height}.
    let mut images_json: Vec<Value> = Vec::new();
    if let Some(s) = &spotify {
        if let Some(arr) = s.get("images").and_then(|i| i.as_array()) {
            for img in arr {
                images_json.push(json!({
                    "url": img.get("url").cloned().unwrap_or(Value::Null),
                    "type": "spotify",
                    "width": img.get("width").cloned().unwrap_or(Value::Null),
                    "height": img.get("height").cloned().unwrap_or(Value::Null),
                }));
            }
        }
    }
    if let Some(a) = &apple {
        if let Some(url) = a.get("artwork_url").and_then(|u| u.as_str()) {
            images_json.push(json!({
                "url": images::artwork_url_with_size(url, 2000),
                "type": "apple_music",
                "width": 2000,
                "height": 2000,
            }));
        }
    }

    // Assemble raw_data service blocks (artist services include discogs + theaudiodb).
    let mut raw = Map::new();
    if let Some(d) = &discogs {
        raw.insert("discogs".into(), d.clone());
    }
    if let Some(a) = &apple {
        raw.insert("apple_music".into(), a.clone());
    }
    if let Some(s) = &spotify {
        raw.insert("spotify".into(), s.clone());
    }
    if let Some(l) = &lastfm {
        raw.insert("lastfm".into(), l.clone());
    }
    if let Some(t) = &theaudiodb {
        raw.insert("theaudiodb".into(), t.clone());
    }

    let existing = db.get_artist_by_name(&display_name)?;
    let now = now_iso();
    let id = existing
        .as_ref()
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("{}-{}", sanitize_folder_name(&display_name), chrono::Local::now().timestamp()));
    let created_at = existing.as_ref().and_then(|e| e.created_at.clone()).unwrap_or_else(|| now.clone());

    let folder = sanitize_folder_name(&display_name);
    let data_rel = format!("{}/{}", cfg.data.path, cfg.artists.path);
    let local_images = json!({
        "hi-res": format!("{data_rel}/{folder}/{folder}-hi-res.jpg"),
        "medium": format!("{data_rel}/{folder}/{folder}-medium.jpg"),
        "avatar": format!("{data_rel}/{folder}/{folder}-avatar.jpg"),
    });

    let rec = ArtistRecord {
        id,
        name: display_name.clone(),
        biography,
        discogs_id: discogs.as_ref().and_then(|d| d.get("id")).map(|i| i.to_string()),
        apple_music_id: apple.as_ref().and_then(|a| a.get("id")).and_then(|v| v.as_str()).map(String::from),
        spotify_id: spotify.as_ref().and_then(|s| s.get("id")).and_then(|v| v.as_str()).map(String::from),
        lastfm_mbid: lastfm.as_ref().and_then(|l| l.get("mbid")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
        discogs_url: discogs.as_ref().and_then(|d| d.get("uri")).and_then(|v| v.as_str()).map(String::from),
        apple_music_url: apple.as_ref().and_then(|a| a.get("url")).and_then(|v| v.as_str()).map(String::from),
        spotify_url: spotify.as_ref().and_then(|s| s.get("url")).and_then(|v| v.as_str()).map(String::from),
        lastfm_url: lastfm.as_ref().and_then(|l| l.get("url")).and_then(|v| v.as_str()).map(String::from),
        wikipedia_url: wiki.as_ref().and_then(|w| w.get("url")).and_then(|v| v.as_str()).map(String::from),
        genres,
        popularity: spotify.as_ref().and_then(|s| s.get("popularity")).and_then(|v| v.as_i64()),
        followers: spotify.as_ref().and_then(|s| s.get("followers")).and_then(|v| v.as_i64()),
        country: None,
        formed_date: None,
        images: Value::Array(images_json),
        local_images,
        enrichment_data: json!({}),
        raw_data: Value::Object(raw),
        created_at: Some(created_at),
        updated_at: Some(now),
    };

    if write_files {
        let artist_dir = cfg.artists_dir();
        let _ = images::download_artist_hires(client, &artist_dir, &folder, &rec.raw_data, 2000, prefer).await;
        db.save_artist(&rec).context("saving artist to database")?;
        let value = artist_to_value(&rec);
        let dir = artist_dir.join(&folder);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join(format!("{folder}.json")), to_pretty_sorted(&value))?;
    }

    Ok((rec, found))
}

async fn discogs_artist(services: &Services, name: &str) -> Option<Value> {
    let search = services.discogs.search_artist(name, 5).await.ok()?;
    let id = search.get("results")?.as_array()?.first()?.get("id")?.to_string();
    services.discogs.get_artist(&id).await.ok()
}

async fn enrich_apple_artist(services: &Services, name: &str) -> Option<Value> {
    if !services.apple_music.is_configured() {
        return None;
    }
    let resp = services.apple_music.search_artist(name, 5).await.ok()?;
    let item = resp.get("results")?.get("artists")?.get("data")?.as_array()?.first()?;
    let attrs = item.get("attributes").cloned().unwrap_or(json!({}));
    Some(json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": attrs.get("name").cloned().unwrap_or(Value::Null),
        "url": attrs.get("url").cloned().unwrap_or(Value::Null),
        "artwork_url": attrs.get("artwork").and_then(|a| a.get("url")).cloned().unwrap_or(Value::Null),
        "genres": attrs.get("genreNames").cloned().unwrap_or(json!([])),
        "editorial_notes": attrs.get("editorialNotes").and_then(|e| e.get("standard")).cloned().unwrap_or(Value::Null),
        "origin": attrs.get("origin").cloned().unwrap_or(Value::Null),
    }))
}

async fn enrich_spotify_artist(services: &Services, name: &str) -> Option<Value> {
    if !services.spotify.is_configured() {
        return None;
    }
    let resp = services.spotify.search_artist(name, 5).await.ok()?;
    let item = resp.get("artists")?.get("items")?.as_array()?.first()?;
    Some(json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": item.get("name").cloned().unwrap_or(Value::Null),
        "url": item.get("external_urls").and_then(|e| e.get("spotify")).cloned().unwrap_or(Value::Null),
        "popularity": item.get("popularity").cloned().unwrap_or(Value::Null),
        "followers": item.get("followers").and_then(|f| f.get("total")).cloned().unwrap_or(Value::Null),
        "genres": item.get("genres").cloned().unwrap_or(json!([])),
        "images": item.get("images").cloned().unwrap_or(json!([])),
    }))
}

async fn enrich_lastfm_artist(services: &Services, name: &str) -> Option<Value> {
    if !services.lastfm.is_configured() {
        return None;
    }
    let resp = services.lastfm.get_artist_info(name).await.ok()?;
    let a = resp.get("artist")?;
    Some(json!({
        "mbid": a.get("mbid").cloned().unwrap_or(Value::Null),
        "url": a.get("url").cloned().unwrap_or(Value::Null),
        "listeners": a.get("stats").and_then(|s| s.get("listeners")).cloned().unwrap_or(Value::Null),
        "playcount": a.get("stats").and_then(|s| s.get("playcount")).cloned().unwrap_or(Value::Null),
        "bio_summary": a.get("bio").and_then(|b| b.get("summary")).cloned().unwrap_or(Value::Null),
        "bio_content": a.get("bio").and_then(|b| b.get("content")).cloned().unwrap_or(Value::Null),
    }))
}

async fn enrich_wikipedia(services: &Services, name: &str) -> Option<Value> {
    let summary = services.wikipedia.get_page_summary(name).await.ok()?;
    let extract = summary.get("extract").and_then(|e| e.as_str()).filter(|s| s.len() > 50)?;
    let url = summary
        .get("content_urls")
        .and_then(|c| c.get("desktop"))
        .and_then(|d| d.get("page"))
        .and_then(|p| p.as_str());
    Some(json!({ "biography": extract, "url": url }))
}

async fn enrich_theaudiodb(services: &Services, name: &str) -> Option<Value> {
    let resp = services.theaudiodb.search_artist(name).await.ok()?;
    resp.get("artists")?.as_array()?.first().cloned()
}
