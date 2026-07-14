//! `artist` command — fetch and enrich a single artist by name, writing the public JSON +
//! hi-res image. `artist-batch` reuses the same pipeline across a range.

use anyhow::{bail, Context, Result};
use serde_json::{json, Map, Value};

use crate::cli::{ArtistArgs, ArtistBatchArgs, OutputFormat};
use crate::db::{ArtistRecord, Db};
use crate::ops::release::{image_client, prefer_key, MatchPicker};
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

    let picker = if args.interactive { MatchPicker::Cli } else { MatchPicker::First };
    println!("Searching for artist '{}'...", args.name);
    let (rec, found) = process_artist(cfg, &services, &db, &client, &args.name, args.save, args.theaudiodb, args.perplexity, args.perplexity_context.as_deref(), prefer_key(args.prefer), &picker).await?;

    let mark = |b: bool| if b { "✓" } else { "–" };
    println!("\n  {}", rec.name);
    println!("  discogs_id: {}", rec.discogs_id.as_deref().unwrap_or("?"));
    println!("  enrichment: apple {} | spotify {} | lastfm {} | wikipedia {} | perplexity {}", mark(found.apple), mark(found.spotify), mark(found.lastfm), mark(found.wikipedia), mark(found.perplexity));
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
        let n = crate::output::collection::regenerate(cfg, &db)?;
        println!("Refreshed collection.json ({n} entries)");
    } else {
        println!("\n(dry view — pass --save to write to the database, JSON and image)");
    }
    Ok(())
}

pub async fn run_batch(cfg: &Config, args: ArtistBatchArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let seeded = db.seed_missing_artists_from_releases()?;
    if seeded > 0 {
        println!("Seeded {seeded} missing artist(s) from saved releases.");
    }
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
    let picker = if args.interactive { MatchPicker::Cli } else { MatchPicker::First };
    let total = slice.len();
    let mut ok = 0usize;

    for (i, a) in slice.iter().enumerate() {
        match process_artist(cfg, &services, &db, &client, &a.name, args.save, args.theaudiodb, args.perplexity, args.perplexity_context.as_deref(), prefer, &picker).await {
            Ok((_, found)) => {
                ok += 1;
                let m = |b: bool| if b { "✓" } else { "–" };
                println!("[{}/{total}] ✓ {} (apple {} spotify {} lastfm {} wiki {} perplexity {})", i + 1, a.name, m(found.apple), m(found.spotify), m(found.lastfm), m(found.wikipedia), m(found.perplexity));
            }
            Err(e) => println!("[{}/{total}] ✗ {} — {e}", i + 1, a.name),
        }
    }

    println!("\nDone: {ok}/{total} artists processed.");
    if args.save && ok > 0 {
        let n = crate::output::collection::regenerate(cfg, &db)?;
        println!("Refreshed collection.json ({n} entries)");
    }
    Ok(())
}

pub struct Found {
    pub apple: bool,
    pub spotify: bool,
    pub lastfm: bool,
    pub wikipedia: bool,
    pub perplexity: bool,
}

#[allow(clippy::too_many_arguments)]
pub async fn process_artist(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    name: &str,
    write_files: bool,
    use_theaudiodb: bool,
    use_perplexity: bool,
    perplexity_context: Option<&str>,
    prefer: Option<&str>,
    picker: &MatchPicker,
) -> Result<(ArtistRecord, Found)> {
    // Discogs: search → (pick) → details.
    let discogs = discogs_artist(services, name, picker).await;
    let display_name = discogs
        .as_ref()
        .and_then(|d| d.get("name").and_then(|n| n.as_str()))
        .unwrap_or(name)
        .to_string();

    // Interactive runs sequentially (each may prompt); otherwise concurrently.
    let (apple, spotify, lastfm, wiki) = if picker.is_interactive() {
        let apple = enrich_apple_artist(services, &display_name, picker).await;
        let spotify = enrich_spotify_artist(services, &display_name, picker).await;
        let lastfm = enrich_lastfm_artist(services, &display_name).await;
        let wiki = enrich_wikipedia(services, &display_name).await;
        (apple, spotify, lastfm, wiki)
    } else {
        tokio::join!(
            enrich_apple_artist(services, &display_name, picker),
            enrich_spotify_artist(services, &display_name, picker),
            enrich_lastfm_artist(services, &display_name),
            enrich_wikipedia(services, &display_name),
        )
    };
    let theaudiodb = if use_theaudiodb { enrich_theaudiodb(services, &display_name).await } else { None };

let genres = derive_genres(spotify.as_ref(), apple.as_ref());
let genre_names = genre_strings(&genres);
let perplexity = if use_perplexity { enrich_perplexity_artist(services, &display_name, &genre_names, perplexity_context).await } else { None };
let found = Found { apple: apple.is_some(), spotify: spotify.is_some(), lastfm: lastfm.is_some(), wikipedia: wiki.is_some(), perplexity: perplexity.is_some() };

let biography = perplexity
.as_ref()
.and_then(|p| p.get("biography").and_then(|b| b.as_str()).map(String::from))
.or_else(|| derive_biography(wiki.as_ref(), lastfm.as_ref(), theaudiodb.as_ref()));
    let images_value = derive_artist_images(spotify.as_ref(), apple.as_ref());

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
    if let Some(p) = &perplexity {
        raw.insert("perplexity".into(), p.clone());
    }

    let existing = db.get_artist_by_name(&display_name)?;
    let now = now_iso();
    let id = existing
        .as_ref()
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("{}-{}", sanitize_folder_name(&display_name), chrono::Local::now().timestamp()));
    let created_at = existing.as_ref().and_then(|e| e.created_at.clone()).unwrap_or_else(|| now.clone());

    let folder = sanitize_folder_name(&display_name);
    let local_images = artist_local_images(cfg, &folder);

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
        images: images_value,
        local_images,
        enrichment_data: json!({}),
        raw_data: Value::Object(raw),
        created_at: Some(created_at),
        updated_at: Some(now),
    };

    if write_files {
        let artist_dir = cfg.artists_dir();
        let _ = images::download_artist_hires(client, &artist_dir, &folder, &rec.raw_data, 2000, prefer).await;
        persist_artist(cfg, db, &rec)?;
    }

    Ok((rec, found))
}

async fn discogs_artist(services: &Services, name: &str, picker: &MatchPicker) -> Option<Value> {
    let search = services.discogs.search_artist(name, 5).await.ok()?;
    let results = search.get("results")?.as_array()?;
    if results.is_empty() {
        return None;
    }
    let idx = if picker.is_interactive() {
        let rows: Vec<Vec<String>> = results
            .iter()
            .map(|r| {
                vec![
                    r.get("title").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                    r.get("id").map(|v| v.to_string()).unwrap_or_default(),
                    r.get("type").and_then(|v| v.as_str()).unwrap_or("artist").to_string(),
                ]
            })
            .collect();
        picker.pick(&format!("Discogs · {name}"), &["Name", "ID", "Type"], &rows).await?
    } else {
        0
    };
    let id = results.get(idx)?.get("id")?.to_string();
    services.discogs.get_artist(&id).await.ok()
}

async fn enrich_apple_artist(services: &Services, name: &str, picker: &MatchPicker) -> Option<Value> {
    if !services.apple_music.is_configured() {
        return None;
    }
    let resp = services.apple_music.search_artist(name, 5).await.ok()?;
    let data = resp.get("results")?.get("artists")?.get("data")?.as_array()?;
    if data.is_empty() {
        return None;
    }
    let idx = if picker.is_interactive() {
        let rows: Vec<Vec<String>> = data
            .iter()
            .map(|item| {
                let a = item.get("attributes");
                let aname = a.and_then(|a| a.get("name")).and_then(|v| v.as_str()).unwrap_or("?").to_string();
                let genres = a
                    .and_then(|a| a.get("genreNames"))
                    .and_then(|v| v.as_array())
                    .map(|g| g.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))
                    .unwrap_or_default();
                let origin = a.and_then(|a| a.get("origin")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                vec![aname, genres, origin]
            })
            .collect();
        picker.pick(&format!("Apple Music · {name}"), &["Name", "Genres", "Origin"], &rows).await?
    } else {
        0
    };
    let item = data.get(idx)?;
    Some(map_apple_artist(item))
}

/// Map an Apple Music artist resource (search hit or `get_artist` item — same shape) into the
/// stored `raw_data.apple_music` dict.
fn map_apple_artist(item: &Value) -> Value {
    let attrs = item.get("attributes").cloned().unwrap_or(json!({}));
    json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": attrs.get("name").cloned().unwrap_or(Value::Null),
        "url": attrs.get("url").cloned().unwrap_or(Value::Null),
        "artwork_url": attrs.get("artwork").and_then(|a| a.get("url")).cloned().unwrap_or(Value::Null),
        "genres": attrs.get("genreNames").cloned().unwrap_or(json!([])),
        "editorial_notes": attrs.get("editorialNotes").and_then(|e| e.get("standard")).cloned().unwrap_or(Value::Null),
        "origin": attrs.get("origin").cloned().unwrap_or(Value::Null),
    })
}

async fn enrich_spotify_artist(services: &Services, name: &str, picker: &MatchPicker) -> Option<Value> {
    if !services.spotify.is_configured() {
        return None;
    }
    let resp = services.spotify.search_artist(name, 5).await.ok()?;
    let items = resp.get("artists")?.get("items")?.as_array()?;
    if items.is_empty() {
        return None;
    }
    let idx = if picker.is_interactive() {
        let rows: Vec<Vec<String>> = items
            .iter()
            .map(|item| {
                let genres = item
                    .get("genres")
                    .and_then(|v| v.as_array())
                    .map(|g| g.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "))
                    .unwrap_or_default();
                vec![
                    item.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                    genres,
                    item.get("popularity").and_then(|v| v.as_i64()).map(|n| n.to_string()).unwrap_or_default(),
                ]
            })
            .collect();
        picker.pick(&format!("Spotify · {name}"), &["Name", "Genres", "Popularity"], &rows).await?
    } else {
        0
    };
    let item = items.get(idx)?;
    Some(map_spotify_artist(item))
}

/// Map a Spotify artist object (search hit or full `get_artist` response — same shape) into the
/// stored `raw_data.spotify` dict.
fn map_spotify_artist(item: &Value) -> Value {
    json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": item.get("name").cloned().unwrap_or(Value::Null),
        "url": item.get("external_urls").and_then(|e| e.get("spotify")).cloned().unwrap_or(Value::Null),
        "popularity": item.get("popularity").cloned().unwrap_or(Value::Null),
        "followers": item.get("followers").and_then(|f| f.get("total")).cloned().unwrap_or(Value::Null),
        "genres": item.get("genres").cloned().unwrap_or(json!([])),
        "images": item.get("images").cloned().unwrap_or(json!([])),
    })
}

async fn enrich_lastfm_artist(services: &Services, name: &str) -> Option<Value> {
    if !services.lastfm.is_configured() {
        return None;
    }
    let resp = services.lastfm.get_artist_info(name).await.ok()?;
    map_lastfm_artist(&resp)
}

/// Map a Last.fm `artist.getInfo` response into the stored `raw_data.lastfm` dict.
fn map_lastfm_artist(resp: &Value) -> Option<Value> {
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

// ── Per-field editing (TUI database editor) ──────────────────────────────────

/// A single editable/refreshable field of an [`ArtistRecord`], used by the TUI detail editor.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ArtistField {
    Name,
    Country,
    FormedDate,
    Discogs,
    Apple,
    Spotify,
    Lastfm,
    Wikipedia,
    Genres,
    Popularity,
    Followers,
    Biography,
    /// Last.fm bio summary (`raw_data.lastfm.bio_summary`).
    LfmSummary,
    /// Last.fm bio content (`raw_data.lastfm.bio_content`).
    LfmContent,
    /// Last.fm tags (`raw_data.lastfm.tags`).
    LfmTags,
    /// The source image list (`images[]` in the public JSON).
    Images,
}

impl ArtistField {
    /// Every field in detail-view display order.
    pub fn all() -> &'static [ArtistField] {
        use ArtistField::*;
        &[
            Name, Country, FormedDate, Discogs, Apple, Spotify, Lastfm, Wikipedia, Genres, Popularity, Followers,
            Biography, LfmSummary, LfmContent, LfmTags, Images,
        ]
    }

    /// Human label used in row headers and log lines.
    pub fn label(self) -> &'static str {
        match self {
            ArtistField::Name => "Name",
            ArtistField::Country => "Country",
            ArtistField::FormedDate => "Formed",
            ArtistField::Discogs => "Discogs",
            ArtistField::Apple => "Apple Music",
            ArtistField::Spotify => "Spotify",
            ArtistField::Lastfm => "Last.fm",
            ArtistField::Wikipedia => "Wikipedia",
            ArtistField::Genres => "Genres",
            ArtistField::Popularity => "Popularity",
            ArtistField::Followers => "Followers",
            ArtistField::Biography => "Biography",
            ArtistField::LfmSummary => "Lfm summary",
            ArtistField::LfmContent => "Lfm content",
            ArtistField::LfmTags => "Lfm tags",
            ArtistField::Images => "Images",
        }
    }

    /// How the field is edited/validated.
    pub fn kind(self) -> crate::ops::FieldKind {
        use crate::ops::FieldKind::*;
        match self {
            ArtistField::Name | ArtistField::Country | ArtistField::Biography => Text,
            ArtistField::LfmSummary | ArtistField::LfmContent => Text,
            ArtistField::Discogs | ArtistField::Apple | ArtistField::Spotify | ArtistField::Lastfm | ArtistField::Wikipedia => Service,
            ArtistField::FormedDate => DateYmd,
            ArtistField::Genres | ArtistField::LfmTags => CsvList,
            ArtistField::Popularity | ArtistField::Followers => Int,
            ArtistField::Images => Structured,
        }
    }

    /// True when `refresh_artist_field` can re-fetch this field from its source.
    pub fn refreshable(self) -> bool {
        matches!(
            self,
            ArtistField::Discogs
                | ArtistField::Apple
                | ArtistField::Spotify
                | ArtistField::Lastfm
                | ArtistField::Wikipedia
                | ArtistField::Genres
                | ArtistField::Popularity
                | ArtistField::Biography
                | ArtistField::Images
        )
    }

    /// True when the field can be edited by hand.
    pub fn editable(self) -> bool {
        self.kind() != crate::ops::FieldKind::RefreshOnly
    }

    /// Current stored value as editable text (the edit overlay's initial buffer).
    pub fn get(self, rec: &ArtistRecord) -> String {
        let opt = |o: &Option<String>| o.clone().unwrap_or_default();
        match self {
            ArtistField::Name => rec.name.clone(),
            ArtistField::Country => opt(&rec.country),
            ArtistField::FormedDate => opt(&rec.formed_date),
            ArtistField::Discogs => opt(&rec.discogs_id),
            // Fall back to the bare ID when no URL is stored — both display and the service
            // editor accept either form, and a checked-but-blank row reads as missing data.
            ArtistField::Apple => rec.apple_music_url.clone().or_else(|| rec.apple_music_id.clone()).unwrap_or_default(),
            ArtistField::Spotify => rec.spotify_url.clone().or_else(|| rec.spotify_id.clone()).unwrap_or_default(),
            ArtistField::Lastfm => opt(&rec.lastfm_url),
            ArtistField::Wikipedia => opt(&rec.wikipedia_url),
            ArtistField::Genres => rec.genres.as_array().map(|a| a.iter().filter_map(|g| g.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(),
            ArtistField::Popularity => rec.popularity.map(|p| p.to_string()).unwrap_or_default(),
            ArtistField::Followers => rec.followers.map(|f| f.to_string()).unwrap_or_default(),
            ArtistField::Biography => opt(&rec.biography),
            ArtistField::LfmSummary => lastfm_str(rec, "bio_summary"),
            ArtistField::LfmContent => lastfm_str(rec, "bio_content"),
            ArtistField::LfmTags => rec
                .raw_data
                .get("lastfm")
                .and_then(|l| l.get("tags"))
                .and_then(|t| t.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", "))
                .unwrap_or_default(),
            ArtistField::Images => rec.images.as_array().map(|a| a.len().to_string()).unwrap_or_default(),
        }
    }

    /// Whether the field currently holds data (drives the ✓/· badge).
    pub fn present(self, rec: &ArtistRecord) -> bool {
        match self {
            ArtistField::Apple => rec.apple_music_id.is_some() || rec.apple_music_url.is_some(),
            ArtistField::Spotify => rec.spotify_id.is_some() || rec.spotify_url.is_some(),
            ArtistField::Lastfm => rec.lastfm_mbid.is_some() || rec.lastfm_url.is_some(),
            // The count renders "0" — the badge must reflect the list, not the string.
            ArtistField::Images => rec.images.as_array().map(|a| !a.is_empty()).unwrap_or(false),
            _ => !self.get(rec).is_empty(),
        }
    }
}

/// A string value nested under `raw_data.lastfm.<key>`.
fn lastfm_str(rec: &ArtistRecord, key: &str) -> String {
    rec.raw_data
        .get("lastfm")
        .and_then(|l| l.get(key))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Save a hand-edited source-image list from the structured editor. Returns the saved record
/// and the embedding-release fan-out count.
pub fn set_artist_images(cfg: &Config, db: &Db, rec: &ArtistRecord, rows: &[Vec<String>]) -> Result<(ArtistRecord, usize)> {
    let mut rec = rec.clone();
    rec.images = crate::ops::release::rows_to_images(&rec.images, rows)?;
    rec.updated_at = Some(now_iso());
    let fanout = persist_artist(cfg, db, &rec)?;
    Ok((rec, fanout))
}

/// The stored local-image paths for an artist folder.
pub(crate) fn artist_local_images(cfg: &Config, folder: &str) -> Value {
    let data_rel = format!("{}/{}", cfg.data.path, cfg.artists.path);
    json!({
        "hi-res": format!("{data_rel}/{folder}/{folder}-hi-res.jpg"),
        "medium": format!("{data_rel}/{folder}/{folder}-medium.jpg"),
        "avatar": format!("{data_rel}/{folder}/{folder}-avatar.jpg"),
    })
}

fn genre_strings(genres: &Value) -> Vec<String> {
    genres
        .as_array()
        .map(|arr| arr.iter().filter_map(|g| g.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Interactive Perplexity biography — the same loop as release descriptions: edit context,
/// (re)generate, preview, accept or skip. Headless (`First`) pickers skip immediately.
async fn interactive_perplexity_bio(
    services: &Services,
    picker: &MatchPicker,
    name: &str,
    genres: &[String],
) -> Option<Value> {
    if !services.perplexity.is_configured() || matches!(picker, MatchPicker::First) {
        return None;
    }
    let mut context = String::new();
    let mut preview = String::new();
    let mut data: Option<Value> = None;
    loop {
        match picker.describe(name, "artist biography", &preview, &context).await {
            crate::ops::release::DescribeAction::Generate(ctx) => {
                context = ctx;
                let ctx_opt = (!context.trim().is_empty()).then_some(context.as_str());
                match services.perplexity.generate_artist_biography(name, genres, ctx_opt).await {
                    Ok(v) => {
                        preview = v.get("biography").and_then(|b| b.as_str()).unwrap_or("").to_string();
                        data = Some(v);
                    }
                    Err(e) => {
                        preview = format!("(generation failed: {e})");
                        data = None;
                    }
                }
            }
            crate::ops::release::DescribeAction::Accept => return data,
            crate::ops::release::DescribeAction::Skip => return None,
        }
    }
}

async fn enrich_perplexity_artist(
    services: &Services,
    name: &str,
    genres: &[String],
    context: Option<&str>,
) -> Option<Value> {
    if !services.perplexity.is_configured() {
        return None;
    }
    services.perplexity.generate_artist_biography(name, genres, context).await.ok()
}

/// Biography priority: Wikipedia → Last.fm → TheAudioDB.
fn derive_biography(wiki: Option<&Value>, lastfm: Option<&Value>, theaudiodb: Option<&Value>) -> Option<String> {
    wiki.and_then(|w| w.get("biography").and_then(|b| b.as_str()).map(String::from))
        .or_else(|| lastfm.and_then(|l| l.get("bio_content").and_then(|b| b.as_str()).filter(|s| !s.is_empty()).map(String::from)))
        .or_else(|| theaudiodb.and_then(|t| t.get("strBiographyEN").and_then(|b| b.as_str()).map(String::from)))
}

/// Genre priority: Spotify (if non-empty) → Apple Music.
fn derive_genres(spotify: Option<&Value>, apple: Option<&Value>) -> Value {
    spotify
        .and_then(|s| s.get("genres").cloned())
        .filter(|g| g.as_array().map(|a| !a.is_empty()).unwrap_or(false))
        .or_else(|| apple.and_then(|a| a.get("genres").cloned()))
        .unwrap_or_else(|| json!([]))
}

/// Combine Spotify + Apple Music artwork into the `[{url,type,width,height}]` images array.
fn derive_artist_images(spotify: Option<&Value>, apple: Option<&Value>) -> Value {
    let mut images_json: Vec<Value> = Vec::new();
    if let Some(s) = spotify {
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
    if let Some(a) = apple {
        if let Some(url) = a.get("artwork_url").and_then(|u| u.as_str()) {
            images_json.push(json!({
                "url": images::artwork_url_with_size(url, 2000),
                "type": "apple_music",
                "width": 2000,
                "height": 2000,
            }));
        }
    }
    Value::Array(images_json)
}

/// Persist an artist and propagate everywhere it renders: save to the DB, rewrite the public
/// `{folder}.json`, and rewrite every release JSON embedding this artist (bio/wikipedia/service
/// ids are joined from the artists table at write time, so those files go stale otherwise).
/// Returns how many release JSONs were rewritten.
pub fn persist_artist(cfg: &Config, db: &Db, rec: &ArtistRecord) -> Result<usize> {
    let folder = sanitize_folder_name(&rec.name);
    db.save_artist(rec).context("saving artist to database")?;
    let value = artist_to_value(rec);
    let dir = cfg.artists_dir().join(&folder);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{folder}.json")), to_pretty_sorted(&value))?;

    let embedding = db.releases_embedding_artist(rec.discogs_id.as_deref(), &rec.name)?;
    for r in &embedding {
        crate::ops::release::write_release_json(cfg, db, r)?;
    }
    Ok(embedding.len())
}

/// Re-fetch a single source for an existing artist and merge it into the record, leaving every
/// other field untouched. Returns the saved record and whether the source yielded data. Failed
/// lookups (or a skipped match) leave the existing value in place — use [`set_artist_value`] to
/// clear a field.
#[allow(clippy::too_many_arguments)]
pub async fn refresh_artist_field(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    rec: &ArtistRecord,
    field: ArtistField,
    picker: &MatchPicker,
) -> Result<(ArtistRecord, bool)> {
    let mut rec = rec.clone();
    let name = rec.name.clone();
    let mut raw: Map<String, Value> = rec.raw_data.as_object().cloned().unwrap_or_default();
    let cur_spotify = raw.get("spotify").cloned();
    let cur_apple = raw.get("apple_music").cloned();
    let cur_lastfm = raw.get("lastfm").cloned();
    let cur_theaudiodb = raw.get("theaudiodb").cloned();
    let mut found = false;
    let mut download_image = false;

    match field {
        ArtistField::Discogs => {
            if let Some(d) = discogs_artist(services, &name, picker).await {
                rec.discogs_id = d.get("id").map(|i| i.to_string());
                rec.discogs_url = d.get("uri").and_then(|v| v.as_str()).map(String::from);
                raw.insert("discogs".into(), d);
                found = true;
            }
        }
        ArtistField::Apple => {
            if let Some(a) = enrich_apple_artist(services, &name, picker).await {
                rec.apple_music_id = a.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.apple_music_url = a.get("url").and_then(|v| v.as_str()).map(String::from);
                rec.genres = derive_genres(cur_spotify.as_ref(), Some(&a));
                rec.images = derive_artist_images(cur_spotify.as_ref(), Some(&a));
                raw.insert("apple_music".into(), a);
                download_image = true;
                found = true;
            }
        }
        ArtistField::Spotify | ArtistField::Popularity => {
            if let Some(s) = enrich_spotify_artist(services, &name, picker).await {
                rec.spotify_id = s.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.spotify_url = s.get("url").and_then(|v| v.as_str()).map(String::from);
                rec.popularity = s.get("popularity").and_then(|v| v.as_i64());
                rec.followers = s.get("followers").and_then(|v| v.as_i64());
                rec.genres = derive_genres(Some(&s), cur_apple.as_ref());
                rec.images = derive_artist_images(Some(&s), cur_apple.as_ref());
                raw.insert("spotify".into(), s);
                download_image = true;
                found = true;
            }
        }
        ArtistField::Lastfm => {
            if let Some(l) = enrich_lastfm_artist(services, &name).await {
                rec.lastfm_mbid = l.get("mbid").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
                rec.lastfm_url = l.get("url").and_then(|v| v.as_str()).map(String::from);
                raw.insert("lastfm".into(), l);
                found = true;
            }
        }
        ArtistField::Wikipedia => {
            let wiki = enrich_wikipedia(services, &name).await;
            if let Some(w) = &wiki {
                if let Some(u) = w.get("url").and_then(|v| v.as_str()) {
                    rec.wikipedia_url = Some(u.to_string());
                }
            }
            let bio = derive_biography(wiki.as_ref(), cur_lastfm.as_ref(), cur_theaudiodb.as_ref());
            if bio.is_some() {
                rec.biography = bio;
                found = true;
            }
        }
        ArtistField::Biography => {
            // Interactive runs offer a Perplexity-generated biography (context + preview +
            // accept/skip, same flow as release descriptions); skipping — or running headless —
            // falls back to the Wikipedia → Last.fm → TheAudioDB derivation.
            if let Some(p) = interactive_perplexity_bio(services, picker, &name, &genre_strings(&rec.genres)).await {
                if let Some(bio) = p.get("biography").and_then(|b| b.as_str()).filter(|s| !s.is_empty()) {
                    rec.biography = Some(bio.to_string());
                    found = true;
                }
                raw.insert("perplexity".into(), p);
            } else {
                let wiki = enrich_wikipedia(services, &name).await;
                if let Some(w) = &wiki {
                    if let Some(u) = w.get("url").and_then(|v| v.as_str()) {
                        rec.wikipedia_url = Some(u.to_string());
                    }
                }
                let bio = derive_biography(wiki.as_ref(), cur_lastfm.as_ref(), cur_theaudiodb.as_ref());
                if bio.is_some() {
                    rec.biography = bio;
                    found = true;
                }
            }
        }
        ArtistField::Genres => {
            rec.genres = derive_genres(cur_spotify.as_ref(), cur_apple.as_ref());
            found = rec.genres.as_array().map(|a| !a.is_empty()).unwrap_or(false);
        }
        ArtistField::Images => {
            rec.images = derive_artist_images(cur_spotify.as_ref(), cur_apple.as_ref());
            download_image = true;
            found = true;
        }
        // Hand-edited-only fields have no online source to refresh (the Last.fm row re-fetches
        // the bio/tags block).
        ArtistField::Name
        | ArtistField::Country
        | ArtistField::FormedDate
        | ArtistField::Followers
        | ArtistField::LfmSummary
        | ArtistField::LfmContent
        | ArtistField::LfmTags => {}
    }

    rec.raw_data = Value::Object(raw);
    rec.updated_at = Some(now_iso());

    if download_image {
        let folder = sanitize_folder_name(&rec.name);
        let _ = images::download_artist_hires(client, &cfg.artists_dir(), &folder, &rec.raw_data, 2000, None).await;
    }
    persist_artist(cfg, db, &rec)?;
    Ok((rec, found))
}

/// Manually set (or clear, when `text` is blank) one artist field. Validates before saving —
/// a returned `Err` carries a user-readable message and leaves the record untouched.
/// Returns the saved record and how many embedding release JSONs were rewritten.
pub fn set_artist_value(cfg: &Config, db: &Db, rec: &ArtistRecord, field: ArtistField, text: &str) -> Result<(ArtistRecord, usize)> {
    let mut rec = rec.clone();
    let t = text.trim();
    let opt = (!t.is_empty()).then(|| t.to_string());
    match field {
        ArtistField::Name => {
            let Some(name) = opt else { bail!("the artist name cannot be blank") };
            let old_name = rec.name.clone();
            if name != old_name {
                // A slug-changing rename moves the public folder (images carried, stale JSON
                // dropped; persist_artist then writes the fresh JSON under the new slug).
                let new_folder = sanitize_folder_name(&name);
                if let Some(plan) = crate::ops::rename::plan(&cfg.artists_dir(), &sanitize_folder_name(&old_name), &new_folder) {
                    crate::ops::rename::apply(&plan, crate::ops::rename::ARTIST_SUFFIXES)?;
                    rec.local_images = artist_local_images(cfg, &new_folder);
                }
                // Rename the artist inside every embedding release row: collection.json derives
                // uri_artist from the release-side name, and persist_artist's fan-out matches on
                // the new name. JSON rewrites happen in that fan-out, after the row is saved.
                for mut r in db.releases_embedding_artist(rec.discogs_id.as_deref(), &old_name)? {
                    if let Some(entries) = r.artists.as_array_mut() {
                        for e in entries {
                            let by_id = rec.discogs_id.is_some()
                                && e.get("discogs_id").and_then(|d| d.as_str()) == rec.discogs_id.as_deref();
                            let by_name =
                                e.get("name").and_then(|n| n.as_str()).is_some_and(|n| n.eq_ignore_ascii_case(&old_name));
                            if by_id || by_name {
                                if let Some(obj) = e.as_object_mut() {
                                    obj.insert("name".into(), json!(name.clone()));
                                }
                            }
                        }
                    }
                    r.updated_at = Some(now_iso());
                    db.save_release(&r)?;
                }
            }
            rec.name = name;
        }
        ArtistField::Country => rec.country = opt,
        ArtistField::FormedDate => rec.formed_date = crate::ops::parse_date_ymd(t)?,
        ArtistField::Discogs => rec.discogs_id = opt,
        ArtistField::Apple => rec.apple_music_url = opt,
        ArtistField::Spotify => rec.spotify_url = opt,
        ArtistField::Lastfm => rec.lastfm_url = opt,
        ArtistField::Wikipedia => rec.wikipedia_url = opt,
        ArtistField::Biography => rec.biography = opt,
        ArtistField::Genres => rec.genres = crate::ops::csv_list(t),
        ArtistField::Popularity => {
            rec.popularity = if t.is_empty() {
                None
            } else {
                match t.parse::<i64>() {
                    Ok(n) if (0..=100).contains(&n) => Some(n),
                    _ => bail!("popularity is a number from 0 to 100"),
                }
            };
        }
        ArtistField::Followers => {
            rec.followers = if t.is_empty() {
                None
            } else {
                match t.parse::<i64>() {
                    Ok(n) if n >= 0 => Some(n),
                    _ => bail!("followers must be a non-negative whole number"),
                }
            };
        }
        ArtistField::LfmSummary => crate::ops::set_raw_service_key(&mut rec.raw_data, "lastfm", "bio_summary", opt.map(Value::String)),
        ArtistField::LfmContent => crate::ops::set_raw_service_key(&mut rec.raw_data, "lastfm", "bio_content", opt.map(Value::String)),
        ArtistField::LfmTags => {
            let tags = crate::ops::csv_list(t);
            crate::ops::set_raw_service_key(&mut rec.raw_data, "lastfm", "tags", Some(tags));
        }
        // Images are edited in the structured list overlay.
        ArtistField::Images => return Ok((rec, 0)),
    }
    rec.updated_at = Some(now_iso());
    let fanout = persist_artist(cfg, db, &rec)?;
    Ok((rec, fanout))
}

/// Set an artist's service identity from user input (a pasted URL or bare ID), re-fetching the
/// full payload so `services{}`/`raw_data` stay consistent with the flat columns. Blank input
/// clears the service. Errors leave the record untouched. Returns the saved record and the
/// embedding-release fan-out count.
pub async fn set_artist_service(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    rec: &ArtistRecord,
    field: ArtistField,
    input: &str,
) -> Result<(ArtistRecord, usize)> {
    use crate::ops::service_input;

    let mut rec = rec.clone();
    let mut raw: Map<String, Value> = rec.raw_data.as_object().cloned().unwrap_or_default();
    let t = input.trim();
    let mut download_image = false;

    match field {
        ArtistField::Discogs => {
            if t.is_empty() {
                rec.discogs_id = None;
                rec.discogs_url = None;
                raw.remove("discogs");
            } else {
                let id = service_input::discogs_artist_id(t)
                    .ok_or_else(|| anyhow::anyhow!("expected a Discogs artist URL or numeric artist id"))?;
                let d = services.discogs.get_artist(&id).await.with_context(|| format!("fetching Discogs artist {id}"))?;
                rec.discogs_id = d.get("id").map(|i| i.to_string());
                rec.discogs_url = d.get("uri").and_then(|v| v.as_str()).map(String::from);
                raw.insert("discogs".into(), d);
            }
        }
        ArtistField::Apple => {
            if t.is_empty() {
                rec.apple_music_id = None;
                rec.apple_music_url = None;
                raw.remove("apple_music");
            } else {
                let id = service_input::apple_artist_id(t)
                    .ok_or_else(|| anyhow::anyhow!("expected an Apple Music artist URL or numeric artist id"))?;
                let resp = services.apple_music.get_artist(&id).await.with_context(|| format!("fetching Apple Music artist {id}"))?;
                let item = resp
                    .get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|a| a.first())
                    .ok_or_else(|| anyhow::anyhow!("Apple Music returned no artist for id {id}"))?;
                let a = map_apple_artist(item);
                rec.apple_music_id = a.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.apple_music_url = a.get("url").and_then(|v| v.as_str()).map(String::from);
                let cur_spotify = raw.get("spotify").cloned();
                rec.genres = derive_genres(cur_spotify.as_ref(), Some(&a));
                rec.images = derive_artist_images(cur_spotify.as_ref(), Some(&a));
                raw.insert("apple_music".into(), a);
                download_image = true;
            }
        }
        ArtistField::Spotify => {
            if t.is_empty() {
                rec.spotify_id = None;
                rec.spotify_url = None;
                raw.remove("spotify");
            } else {
                let id = service_input::spotify_artist_id(t)
                    .ok_or_else(|| anyhow::anyhow!("expected a Spotify artist URL, spotify:artist: URI or 22-char id"))?;
                let artist = services.spotify.get_artist(&id).await.with_context(|| format!("fetching Spotify artist {id}"))?;
                let s = map_spotify_artist(&artist);
                rec.spotify_id = s.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.spotify_url = s.get("url").and_then(|v| v.as_str()).map(String::from);
                rec.popularity = s.get("popularity").and_then(|v| v.as_i64());
                rec.followers = s.get("followers").and_then(|v| v.as_i64());
                let cur_apple = raw.get("apple_music").cloned();
                rec.genres = derive_genres(Some(&s), cur_apple.as_ref());
                rec.images = derive_artist_images(Some(&s), cur_apple.as_ref());
                raw.insert("spotify".into(), s);
                download_image = true;
            }
        }
        ArtistField::Lastfm => {
            if t.is_empty() {
                rec.lastfm_mbid = None;
                rec.lastfm_url = None;
                raw.remove("lastfm");
            } else {
                let name = service_input::lastfm_artist_name(t)
                    .ok_or_else(|| anyhow::anyhow!("expected a Last.fm artist URL or artist name"))?;
                let resp = services.lastfm.get_artist_info(&name).await.with_context(|| format!("fetching Last.fm artist {name}"))?;
                let l = map_lastfm_artist(&resp).ok_or_else(|| anyhow::anyhow!("Last.fm returned no artist for {name}"))?;
                rec.lastfm_mbid = l.get("mbid").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
                rec.lastfm_url = l.get("url").and_then(|v| v.as_str()).map(String::from);
                raw.insert("lastfm".into(), l);
            }
        }
        ArtistField::Wikipedia => {
            if t.is_empty() {
                rec.wikipedia_url = None;
            } else {
                let title = service_input::wikipedia_title(t)
                    .ok_or_else(|| anyhow::anyhow!("expected a Wikipedia article URL or page title"))?;
                let w = enrich_wikipedia(services, &title)
                    .await
                    .ok_or_else(|| anyhow::anyhow!("Wikipedia has no usable summary for \"{title}\""))?;
                if let Some(u) = w.get("url").and_then(|v| v.as_str()) {
                    rec.wikipedia_url = Some(u.to_string());
                }
                if let Some(bio) = w.get("biography").and_then(|b| b.as_str()) {
                    rec.biography = Some(bio.to_string());
                }
            }
        }
        other => anyhow::bail!("{} is not a service identity field", other.label()),
    }

    rec.raw_data = Value::Object(raw);
    rec.updated_at = Some(now_iso());

    if download_image {
        let folder = sanitize_folder_name(&rec.name);
        let _ = images::download_artist_hires(client, &cfg.artists_dir(), &folder, &rec.raw_data, 2000, None).await;
    }
    let fanout = persist_artist(cfg, db, &rec)?;
    Ok((rec, fanout))
}
