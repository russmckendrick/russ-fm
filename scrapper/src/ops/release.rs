//! `release` command and the reusable single-release processing pipeline used by `collection`.
//!
//! `process_release` fetches a release from Discogs, enriches it across services, and (when
//! asked) persists to the DB and writes the public JSON + hi-res artwork.

use anyhow::{bail, Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Map, Value};

use crate::cli::{ImageSource, OutputFormat, ReleaseArgs};
use crate::db::{Db, ReleaseRecord};
use crate::output::{images, release_to_value, to_pretty_sorted};
use crate::sanitize::release_folder_name;
use crate::services::Services;
use crate::util::now_iso;
use crate::Config;
use tokio::sync::{mpsc::UnboundedSender, oneshot};

/// Requests sent from the enrichment pipeline to an interactive UI (the TUI).
pub enum UiRequest {
    Pick(PickRequest),
    Describe(DescribeRequest),
}

/// An interactive Perplexity description round: show the current preview and collect the next
/// action (regenerate with edited context, accept, or skip).
pub struct DescribeRequest {
    pub artist: String,
    pub album: String,
    pub preview: String,
    pub context: String,
    pub reply: oneshot::Sender<DescribeAction>,
}

/// What the user chose in a [`DescribeRequest`].
pub enum DescribeAction {
    /// (Re)generate the description using this context.
    Generate(String),
    /// Keep the current description.
    Accept,
    /// Don't add a description.
    Skip,
}

/// A request for the user to choose among candidate matches (used by the TUI modal picker).
pub struct PickRequest {
    /// What is being matched, e.g. "Spotify · BASIC — BASIC".
    pub prompt: String,
    /// Column headers, e.g. ["Title", "Artist", "Year", "Type"].
    pub header: Vec<&'static str>,
    /// One row of cells per candidate.
    pub rows: Vec<Vec<String>>,
    pub reply: oneshot::Sender<Option<usize>>,
}

/// How a release's service matches are chosen.
pub enum MatchPicker {
    /// Always take the first (best) result — non-interactive.
    First,
    /// Prompt on the terminal via dialoguer (CLI `--interactive`).
    Cli,
    /// Ask the TUI to show a modal picker and await the reply.
    Tui(UnboundedSender<UiRequest>),
}

impl MatchPicker {
    /// True when matches are chosen interactively (so enrichment must run sequentially).
    pub fn is_interactive(&self) -> bool {
        !matches!(self, MatchPicker::First)
    }

    /// Choose a row index, or `None` to skip the match.
    pub async fn pick(&self, prompt: &str, header: &[&'static str], rows: &[Vec<String>]) -> Option<usize> {
        match self {
            MatchPicker::First => Some(0),
            MatchPicker::Cli => cli_pick(prompt, header, rows),
            MatchPicker::Tui(tx) => {
                let (reply, rx) = oneshot::channel();
                let req = PickRequest { prompt: prompt.into(), header: header.to_vec(), rows: rows.to_vec(), reply };
                if tx.send(UiRequest::Pick(req)).is_err() {
                    return None;
                }
                rx.await.ok().flatten()
            }
        }
    }

    /// One round of interactive description: show `preview`/`context`, return the user's action.
    async fn describe(&self, artist: &str, album: &str, preview: &str, context: &str) -> DescribeAction {
        match self {
            MatchPicker::First => DescribeAction::Skip,
            MatchPicker::Cli => cli_describe(artist, album, preview, context),
            MatchPicker::Tui(tx) => {
                let (reply, rx) = oneshot::channel();
                let req = DescribeRequest {
                    artist: artist.into(),
                    album: album.into(),
                    preview: preview.into(),
                    context: context.into(),
                    reply,
                };
                if tx.send(UiRequest::Describe(req)).is_err() {
                    return DescribeAction::Skip;
                }
                rx.await.unwrap_or(DescribeAction::Skip)
            }
        }
    }
}

/// CLI description loop step via dialoguer.
fn cli_describe(artist: &str, album: &str, preview: &str, context: &str) -> DescribeAction {
    use dialoguer::{theme::ColorfulTheme, Input, Select};
    tokio::task::block_in_place(|| {
        if preview.is_empty() {
            let ctx: String = Input::with_theme(&ColorfulTheme::default())
                .with_prompt(format!("Perplexity context for {artist} — {album} (blank for none)"))
                .allow_empty(true)
                .with_initial_text(context)
                .interact_text()
                .unwrap_or_default();
            DescribeAction::Generate(ctx)
        } else {
            println!("\n{preview}\n");
            let choice = Select::with_theme(&ColorfulTheme::default())
                .with_prompt("Description")
                .items(["Accept", "Regenerate (new context)", "Skip"])
                .default(0)
                .interact_opt()
                .ok()
                .flatten();
            match choice {
                Some(0) => DescribeAction::Accept,
                Some(1) => {
                    let ctx: String = Input::with_theme(&ColorfulTheme::default())
                        .with_prompt("New context (blank for none)")
                        .allow_empty(true)
                        .interact_text()
                        .unwrap_or_default();
                    DescribeAction::Generate(ctx)
                }
                _ => DescribeAction::Skip,
            }
        }
    })
}

/// Interactive Perplexity description. Headless (`First`) skips; otherwise loops
/// generate → preview → accept/regenerate/skip. Returns the stored description object.
async fn enrich_perplexity(
    services: &Services,
    picker: &MatchPicker,
    artist: &str,
    album: &str,
    genres: &[String],
    labels: &[String],
    initial_context: Option<&str>,
) -> Option<Value> {
    if !services.perplexity.is_configured() || matches!(picker, MatchPicker::First) {
        return None;
    }
    let mut context = initial_context.unwrap_or("").to_string();
    let mut preview = String::new();
    let mut data: Option<Value> = None;
    loop {
        match picker.describe(artist, album, &preview, &context).await {
            DescribeAction::Generate(ctx) => {
                context = ctx;
                let ctx_opt = (!context.trim().is_empty()).then_some(context.as_str());
                match services.perplexity.generate_album_description(artist, album, genres, labels, ctx_opt).await {
                    Ok(v) => {
                        preview = v.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
                        data = Some(v);
                    }
                    Err(e) => {
                        preview = format!("(generation failed: {e})");
                        data = None;
                    }
                }
            }
            DescribeAction::Accept => return data,
            DescribeAction::Skip => return None,
        }
    }
}

/// Look up the primary artist's Wikipedia summary; returns (url, biography).
async fn enrich_wikipedia(services: &Services, artist: &str) -> Option<(Option<String>, String)> {
    let summary = services.wikipedia.get_page_summary(artist).await.ok()?;
    let extract = summary.get("extract").and_then(|e| e.as_str()).filter(|s| s.len() > 50)?;
    let url = summary
        .get("content_urls")
        .and_then(|c| c.get("desktop"))
        .and_then(|d| d.get("page"))
        .and_then(|p| p.as_str())
        .map(String::from);
    Some((url, extract.to_string()))
}

/// Which services contributed enrichment for a release, and whether artwork was saved.
#[derive(Clone, Copy, Default)]
pub struct EnrichFlags {
    pub apple: bool,
    pub spotify: bool,
    pub lastfm: bool,
    pub wikipedia: bool,
    pub perplexity: bool,
    pub image: bool,
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
#[allow(clippy::too_many_arguments)]
pub async fn process_release(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    discogs_id: &str,
    write_files: bool,
    prefer: Option<&str>,
    picker: &MatchPicker,
    collection_date_added: Option<&str>,
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

    let mut artists_json: Vec<Value> = discogs
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

    let tracklist_json = tracklist_from_discogs(&discogs);

    let videos = crate::services::discogs::DiscogsService::extract_video_uris(&discogs);
    let discogs_url = str_field(&discogs, &["uri"]);

    // Enrich. Interactive runs sequentially (it prompts); otherwise concurrently.
    let (apple, spotify, lastfm) = if picker.is_interactive() {
        let lastfm = enrich_lastfm(services, &primary_artist, &title).await;
        let apple = enrich_apple(services, &primary_artist, &title, picker).await;
        let spotify = enrich_spotify(services, &primary_artist, &title, picker).await;
        (apple, spotify, lastfm)
    } else {
        tokio::join!(
            enrich_apple(services, &primary_artist, &title, picker),
            enrich_spotify(services, &primary_artist, &title, picker),
            enrich_lastfm(services, &primary_artist, &title),
        )
    };
    let mut flags = EnrichFlags {
        apple: apple.is_some(),
        spotify: spotify.is_some(),
        lastfm: lastfm.is_some(),
        ..Default::default()
    };

    // Wikipedia bio for the primary artist (embedded into the first artist entry).
    if let Some((url, bio)) = enrich_wikipedia(services, &primary_artist).await {
        flags.wikipedia = true;
        if let Some(first) = artists_json.first_mut().and_then(|a| a.as_object_mut()) {
            first.insert("biography".into(), json!(bio));
            first.insert("wikipedia_url".into(), url.map(Value::from).unwrap_or(Value::Null));
        }
    }

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

    // Perplexity album description (interactive; headless skips).
    let genre_strs: Vec<String> = discogs
        .get("genres")
        .and_then(|g| g.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let label_strs: Vec<String> = name_list("labels").iter().filter_map(|v| v.as_str().map(String::from)).collect();
    if let Some(desc) = enrich_perplexity(services, picker, &primary_artist, &title, &genre_strs, &label_strs, None).await {
        raw.insert("perplexity".into(), desc);
        flags.perplexity = true;
    }

    let raw_data = Value::Object(raw);

    let existing = db.get_release_by_discogs_id(discogs_id)?;
    let now = now_iso();
    let created_at = existing.as_ref().and_then(|r| r.created_at.clone()).unwrap_or_else(|| now.clone());
    // Prefer the authoritative Discogs collection date; fall back to any existing DB value.
    let date_added = collection_date_added
        .map(String::from)
        .or_else(|| existing.as_ref().and_then(|r| r.date_added.clone()));

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
        flags.image = images::download_release_hires(client, &album_dir, &folder, &rec.raw_data, target, prefer).await.is_some();

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

    let picker = if args.interactive { MatchPicker::Cli } else { MatchPicker::First };
    println!("Fetching & enriching Discogs release {}...", args.discogs_id);
    // Look up the collection date so a freshly-added release sorts correctly.
    let date_added = if cfg.discogs.username.is_empty() {
        None
    } else {
        services.discogs.collection_date_added(&cfg.discogs.username, &args.discogs_id).await
    };
    let (rec, flags) = process_release(
        cfg, &services, &db, &client, &args.discogs_id, args.save, prefer_key(args.prefer), &picker, date_added.as_deref(),
    )
    .await?;

    print_summary(&rec, flags);
    if matches!(args.output, OutputFormat::Json) {
        println!("{}", to_pretty_sorted(&release_to_value(&rec, &db)));
    }
    if args.save {
        let folder = release_folder_name(&rec.title, &args.discogs_id);
        println!("\nSaved to DB and wrote {}/{folder}/", cfg.releases_dir().display());
        let n = crate::output::collection::regenerate(cfg, &db)?;
        println!("Refreshed collection.json ({n} entries)");
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
    println!(
        "  enrichment: apple {} | spotify {} | lastfm {} | wikipedia {} | perplexity {}",
        mark(flags.apple), mark(flags.spotify), mark(flags.lastfm), mark(flags.wikipedia), mark(flags.perplexity)
    );
}

/// CLI fallback picker: render a simple table and read a choice (Esc / blank skips).
fn cli_pick(prompt: &str, header: &[&str], rows: &[Vec<String>]) -> Option<usize> {
    use dialoguer::{theme::ColorfulTheme, Select};
    let widths: Vec<usize> = (0..header.len())
        .map(|c| rows.iter().map(|r| r.get(c).map(|s| s.chars().count()).unwrap_or(0)).chain(std::iter::once(header[c].len())).max().unwrap_or(0).min(40))
        .collect();
    let fmt = |cells: &[String]| -> String {
        cells.iter().enumerate().map(|(c, s)| {
            let s: String = s.chars().take(40).collect();
            format!("{:<width$}", s, width = widths.get(c).copied().unwrap_or(0))
        }).collect::<Vec<_>>().join("  ")
    };
    let mut items: Vec<String> = rows.iter().map(|r| fmt(r)).collect();
    items.push("Skip this service".into());
    tokio::task::block_in_place(|| {
        let choice = Select::with_theme(&ColorfulTheme::default())
            .with_prompt(prompt)
            .items(&items)
            .default(0)
            .interact_opt()
            .ok()
            .flatten();
        match choice {
            Some(i) if i < rows.len() => Some(i),
            _ => None,
        }
    })
}

/// Derive an Apple "type" from a title suffix (Apple appends " - Single" / " - EP").
fn apple_type(title: &str) -> &'static str {
    let t = title.to_lowercase();
    if t.ends_with("- single") {
        "single"
    } else if t.ends_with("- ep") {
        "ep"
    } else {
        "album"
    }
}

fn year_of(date: &str) -> String {
    date.chars().take(4).collect()
}

/// Apple Music: search by artist+album; pick the match (interactive) or take the first.
async fn enrich_apple(services: &Services, artist: &str, album: &str, picker: &MatchPicker) -> Option<Value> {
    if !services.apple_music.is_configured() {
        return None;
    }
    let resp = services.apple_music.search_release(artist, album).await.ok()?;
    let data = resp.get("results")?.get("albums")?.get("data")?.as_array()?;
    if data.is_empty() {
        return None;
    }
    let idx = if picker.is_interactive() {
        let rows: Vec<Vec<String>> = data
            .iter()
            .map(|i| {
                let a = i.get("attributes");
                let name = a.and_then(|a| a.get("name")).and_then(|v| v.as_str()).unwrap_or("?");
                vec![
                    name.to_string(),
                    a.and_then(|a| a.get("artistName")).and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                    year_of(a.and_then(|a| a.get("releaseDate")).and_then(|v| v.as_str()).unwrap_or("")),
                    apple_type(name).to_string(),
                ]
            })
            .collect();
        picker.pick(&format!("Apple Music · {artist} — {album}"), &["Title", "Artist", "Year", "Type"], &rows).await?
    } else {
        0
    };
    let item = data.get(idx)?;
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

/// Spotify: search by artist+album; pick the match (interactive) or take the first.
async fn enrich_spotify(services: &Services, artist: &str, album: &str, picker: &MatchPicker) -> Option<Value> {
    if !services.spotify.is_configured() {
        return None;
    }
    let resp = services.spotify.search_release(artist, album).await.ok()?;
    let items = resp.get("albums")?.get("items")?.as_array()?;
    if items.is_empty() {
        return None;
    }
    let idx = if picker.is_interactive() {
        let rows: Vec<Vec<String>> = items
            .iter()
            .map(|i| {
                let artists = i
                    .get("artists")
                    .and_then(|a| a.as_array())
                    .map(|a| a.iter().filter_map(|x| x.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
                    .unwrap_or_default();
                vec![
                    i.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                    artists,
                    year_of(i.get("release_date").and_then(|v| v.as_str()).unwrap_or("")),
                    i.get("album_type").and_then(|v| v.as_str()).unwrap_or("—").to_string(),
                ]
            })
            .collect();
        picker.pick(&format!("Spotify · {artist} — {album}"), &["Title", "Artist", "Year", "Type"], &rows).await?
    } else {
        0
    };
    let item = items.get(idx)?;
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

/// Map a Discogs release's `tracklist` into the stored `[{position,title,duration}]` shape.
fn tracklist_from_discogs(discogs: &Value) -> Vec<Value> {
    discogs
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
        .unwrap_or_default()
}

// ── Per-field editing (TUI database editor) ──────────────────────────────────

/// A single editable/refreshable field of a [`ReleaseRecord`], used by the TUI detail editor.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ReleaseField {
    Title,
    Year,
    Released,
    Country,
    /// Re-fetch the Discogs release (refreshes tracklist, videos and artwork sources).
    Discogs,
    Apple,
    Spotify,
    Lastfm,
    Labels,
    Formats,
    Genres,
    Styles,
    Tracks,
    Videos,
    ArtistBio,
    Description,
    DateAdded,
    Images,
}

impl ReleaseField {
    /// Every field in detail-view display order.
    pub fn all() -> &'static [ReleaseField] {
        use ReleaseField::*;
        &[
            Title, Year, Released, Country, Discogs, Apple, Spotify, Lastfm, Labels, Formats, Genres, Styles, Tracks,
            Videos, ArtistBio, Description, DateAdded, Images,
        ]
    }

    /// Human label used in row headers and log lines.
    pub fn label(self) -> &'static str {
        match self {
            ReleaseField::Title => "Title",
            ReleaseField::Year => "Year",
            ReleaseField::Released => "Released",
            ReleaseField::Country => "Country",
            ReleaseField::Discogs => "Discogs",
            ReleaseField::Apple => "Apple Music",
            ReleaseField::Spotify => "Spotify",
            ReleaseField::Lastfm => "Last.fm",
            ReleaseField::Labels => "Labels",
            ReleaseField::Formats => "Formats",
            ReleaseField::Genres => "Genres",
            ReleaseField::Styles => "Styles",
            ReleaseField::Tracks => "Tracks",
            ReleaseField::Videos => "Videos",
            ReleaseField::ArtistBio => "Artist bio",
            ReleaseField::Description => "Description",
            ReleaseField::DateAdded => "Added",
            ReleaseField::Images => "Image hi-res",
        }
    }

    /// How the field is edited/validated.
    pub fn kind(self) -> crate::ops::FieldKind {
        use crate::ops::FieldKind::*;
        match self {
            ReleaseField::Title | ReleaseField::Country | ReleaseField::Description => Text,
            ReleaseField::Apple | ReleaseField::Spotify | ReleaseField::Lastfm => Text,
            ReleaseField::Year => Int,
            ReleaseField::Released | ReleaseField::DateAdded => DateYmd,
            ReleaseField::Labels | ReleaseField::Formats | ReleaseField::Genres | ReleaseField::Styles => CsvList,
            ReleaseField::Discogs | ReleaseField::Tracks | ReleaseField::Videos | ReleaseField::ArtistBio | ReleaseField::Images => RefreshOnly,
        }
    }

    /// True when `refresh_release_field` can re-fetch this field from its source.
    pub fn refreshable(self) -> bool {
        matches!(
            self,
            ReleaseField::Discogs
                | ReleaseField::Apple
                | ReleaseField::Spotify
                | ReleaseField::Lastfm
                | ReleaseField::Tracks
                | ReleaseField::Videos
                | ReleaseField::ArtistBio
                | ReleaseField::Description
                | ReleaseField::Images
        )
    }

    /// True when the field can be edited by hand.
    pub fn editable(self) -> bool {
        self.kind() != crate::ops::FieldKind::RefreshOnly
    }

    /// Current stored value as editable text (the edit overlay's initial buffer).
    pub fn get(self, rec: &ReleaseRecord) -> String {
        let opt = |o: &Option<String>| o.clone().unwrap_or_default();
        let csv = |v: &Value| v.as_array().map(|a| a.iter().filter_map(|s| s.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
        match self {
            ReleaseField::Title => rec.title.clone(),
            ReleaseField::Year => rec.year.map(|y| y.to_string()).unwrap_or_default(),
            ReleaseField::Released => opt(&rec.released),
            ReleaseField::Country => opt(&rec.country),
            ReleaseField::Discogs => opt(&rec.discogs_id),
            ReleaseField::Apple => opt(&rec.apple_music_url),
            ReleaseField::Spotify => opt(&rec.spotify_url),
            ReleaseField::Lastfm => opt(&rec.lastfm_url),
            ReleaseField::Labels => csv(&rec.labels),
            ReleaseField::Formats => csv(&rec.formats),
            ReleaseField::Genres => csv(&rec.genres),
            ReleaseField::Styles => csv(&rec.styles),
            ReleaseField::Tracks => rec.tracklist.as_array().map(|a| a.len().to_string()).unwrap_or_default(),
            ReleaseField::Videos => rec.videos.as_array().map(|a| a.len().to_string()).unwrap_or_default(),
            ReleaseField::ArtistBio | ReleaseField::Images => String::new(),
            ReleaseField::Description => release_description(rec).unwrap_or_default(),
            ReleaseField::DateAdded => opt(&rec.date_added),
        }
    }

    /// Whether the field currently holds data (drives the ✓/· badge).
    pub fn present(self, rec: &ReleaseRecord) -> bool {
        match self {
            ReleaseField::Title => !rec.title.is_empty(),
            ReleaseField::Year => rec.year.is_some(),
            ReleaseField::Apple => rec.apple_music_id.is_some() || rec.apple_music_url.is_some(),
            ReleaseField::Spotify => rec.spotify_id.is_some() || rec.spotify_url.is_some(),
            ReleaseField::Lastfm => rec.lastfm_mbid.is_some() || rec.lastfm_url.is_some(),
            ReleaseField::ArtistBio => rec
                .artists
                .as_array()
                .and_then(|a| a.first())
                .and_then(|a| a.get("biography"))
                .map(|b| !b.is_null())
                .unwrap_or(false),
            ReleaseField::Description => release_description(rec).is_some(),
            _ => !self.get(rec).is_empty(),
        }
    }
}

/// The stored Perplexity description (canonical top-level key, legacy `services` fallback).
fn release_description(rec: &ReleaseRecord) -> Option<String> {
    rec.raw_data
        .get("perplexity")
        .or_else(|| rec.raw_data.get("services").and_then(|s| s.get("perplexity")))
        .and_then(|p| p.get("description"))
        .and_then(|d| d.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn first_artist_name(rec: &ReleaseRecord) -> String {
    rec.artists
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .map(clean_artist_name)
        .unwrap_or_default()
}

fn string_list(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|arr| arr.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Rewrite the public `{folder}/{folder}.json` for an already-saved release record.
pub(crate) fn write_release_json(cfg: &Config, db: &Db, rec: &ReleaseRecord) -> Result<()> {
    let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
    let folder = release_folder_name(&rec.title, &id);
    let value = release_to_value(rec, db);
    let dir = cfg.releases_dir().join(&folder);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{folder}.json")), to_pretty_sorted(&value))?;
    Ok(())
}

/// Persist an edited release: save to the DB, reload, and rewrite the public `{folder}.json`.
fn write_release(cfg: &Config, db: &Db, rec: ReleaseRecord) -> Result<ReleaseRecord> {
    let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
    db.save_release(&rec).context("saving release to database")?;
    let rec = db.get_release_by_discogs_id(&id)?.unwrap_or(rec);
    write_release_json(cfg, db, &rec)?;
    Ok(rec)
}

/// Re-fetch a single source for an existing release and merge it into the record, leaving every
/// other field untouched. Returns the saved record and whether the source yielded data. Failed
/// lookups (or a skipped match) leave the existing value in place — use [`set_release_value`] to
/// clear a field.
#[allow(clippy::too_many_arguments)]
pub async fn refresh_release_field(
    cfg: &Config,
    services: &Services,
    db: &Db,
    client: &reqwest::Client,
    rec: &ReleaseRecord,
    field: ReleaseField,
    picker: &MatchPicker,
) -> Result<(ReleaseRecord, bool)> {
    let mut rec = rec.clone();
    let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
    let artist = first_artist_name(&rec);
    let title = rec.title.clone();
    let mut raw: Map<String, Value> = rec.raw_data.as_object().cloned().unwrap_or_default();
    let mut found = false;
    let mut download_image = false;

    match field {
        ReleaseField::Discogs | ReleaseField::Tracks | ReleaseField::Videos => {
            let discogs = services
                .discogs
                .get_release(&id)
                .await
                .with_context(|| format!("fetching Discogs release {id}"))?;
            rec.tracklist = Value::Array(tracklist_from_discogs(&discogs));
            rec.videos = json!(crate::services::discogs::DiscogsService::extract_video_uris(&discogs));
            raw.insert("discogs".into(), json!({ "images": discogs.get("images").cloned().unwrap_or(json!([])) }));
            download_image = true;
            found = true;
        }
        ReleaseField::Apple => {
            if let Some(a) = enrich_apple(services, &artist, &title, picker).await {
                rec.apple_music_id = a.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.apple_music_url = a.get("url").and_then(|v| v.as_str()).map(String::from);
                rec.release_name_apple_music = a.get("name").and_then(|v| v.as_str()).map(String::from);
                raw.insert("apple_music".into(), a);
                download_image = true;
                found = true;
            }
        }
        ReleaseField::Spotify => {
            if let Some(s) = enrich_spotify(services, &artist, &title, picker).await {
                rec.spotify_id = s.get("id").and_then(|v| v.as_str()).map(String::from);
                rec.spotify_url = s.get("url").and_then(|v| v.as_str()).map(String::from);
                rec.release_name_spotify = s.get("name").and_then(|v| v.as_str()).map(String::from);
                raw.insert("spotify".into(), s);
                download_image = true;
                found = true;
            }
        }
        ReleaseField::Lastfm => {
            if let Some(l) = enrich_lastfm(services, &artist, &title).await {
                rec.lastfm_mbid = l.get("mbid").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from);
                rec.lastfm_url = l.get("url").and_then(|v| v.as_str()).map(String::from);
                raw.insert("lastfm".into(), l);
                found = true;
            }
        }
        ReleaseField::ArtistBio => {
            if let Some((url, bio)) = enrich_wikipedia(services, &artist).await {
                if let Some(first) = rec.artists.as_array_mut().and_then(|a| a.first_mut()).and_then(|a| a.as_object_mut()) {
                    first.insert("biography".into(), json!(bio));
                    first.insert("wikipedia_url".into(), url.map(Value::from).unwrap_or(Value::Null));
                }
                found = true;
            }
        }
        ReleaseField::Description => {
            let genres = string_list(&rec.genres);
            let labels = string_list(&rec.labels);
            if let Some(desc) = enrich_perplexity(services, picker, &artist, &title, &genres, &labels, None).await {
                raw.insert("perplexity".into(), desc);
                found = true;
            }
        }
        ReleaseField::Images => {
            download_image = true;
            found = true;
        }
        // Hand-edited-only fields have no online source of their own (Discogs owns them; the
        // Discogs row re-fetches the lot).
        ReleaseField::Title
        | ReleaseField::Year
        | ReleaseField::Released
        | ReleaseField::Country
        | ReleaseField::Labels
        | ReleaseField::Formats
        | ReleaseField::Genres
        | ReleaseField::Styles
        | ReleaseField::DateAdded => {}
    }

    rec.raw_data = Value::Object(raw);
    rec.updated_at = Some(now_iso());

    if download_image {
        let folder = release_folder_name(&rec.title, &id);
        let target = cfg.image_sizes.hi_res.split('x').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(2000);
        let _ = images::download_release_hires(client, &cfg.releases_dir(), &folder, &rec.raw_data, target, None).await;
    }
    let rec = write_release(cfg, db, rec)?;
    Ok((rec, found))
}

/// Manually set (or clear, when `text` is blank) one release field. Validates before saving —
/// a returned `Err` carries a user-readable message and leaves the record untouched.
/// No network access.
pub fn set_release_value(cfg: &Config, db: &Db, rec: &ReleaseRecord, field: ReleaseField, text: &str) -> Result<ReleaseRecord> {
    let mut rec = rec.clone();
    let t = text.trim();
    let opt = (!t.is_empty()).then(|| t.to_string());
    match field {
        ReleaseField::Title => {
            let Some(title) = opt else { bail!("the title cannot be blank") };
            let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
            if release_folder_name(&title, &id) != release_folder_name(&rec.title, &id) {
                bail!("this title changes the public folder slug — folder renames are not supported yet");
            }
            // collection.json prefers the Discogs-sourced name, so a manual title covers both.
            rec.title = title.clone();
            rec.release_name_discogs = Some(title);
        }
        ReleaseField::Year => rec.year = crate::ops::parse_year(t)?,
        ReleaseField::Released => rec.released = crate::ops::parse_date_ymd(t)?,
        ReleaseField::Country => rec.country = opt,
        ReleaseField::DateAdded => rec.date_added = crate::ops::parse_date_or_datetime(t)?,
        ReleaseField::Apple => rec.apple_music_url = opt,
        ReleaseField::Spotify => rec.spotify_url = opt,
        ReleaseField::Lastfm => rec.lastfm_url = opt,
        ReleaseField::Labels => rec.labels = crate::ops::csv_list(t),
        ReleaseField::Formats => rec.formats = crate::ops::csv_list(t),
        ReleaseField::Genres => rec.genres = crate::ops::csv_list(t),
        ReleaseField::Styles => rec.styles = crate::ops::csv_list(t),
        ReleaseField::Description => {
            let mut raw: Map<String, Value> = rec.raw_data.as_object().cloned().unwrap_or_default();
            match opt {
                Some(text) => {
                    let mut p = raw.get("perplexity").and_then(|v| v.as_object().cloned()).unwrap_or_default();
                    p.insert("description".into(), json!(text));
                    if !p.contains_key("source") {
                        p.insert("source".into(), json!("manual"));
                    }
                    raw.insert("perplexity".into(), Value::Object(p));
                }
                None => {
                    raw.remove("perplexity");
                }
            }
            rec.raw_data = Value::Object(raw);
        }
        // Discogs-owned and derived fields are refresh-only.
        ReleaseField::Discogs | ReleaseField::Tracks | ReleaseField::Videos | ReleaseField::ArtistBio | ReleaseField::Images => {
            return Ok(rec)
        }
    }
    rec.updated_at = Some(now_iso());
    write_release(cfg, db, rec)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Headless contract: `MatchPicker::First` never prompts and always takes the first
    /// candidate, so widening the interactive picker gate cannot change CLI/cron output.
    #[tokio::test]
    async fn first_picker_is_non_interactive_and_takes_index_zero() {
        let picker = MatchPicker::First;
        assert!(!picker.is_interactive());
        let rows = vec![vec!["A".to_string()], vec!["B".to_string()]];
        assert_eq!(picker.pick("test", &["Title"], &rows).await, Some(0));
    }
}
