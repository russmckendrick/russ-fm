//! `collection.json` generator — the flat index the React frontend reads. Port of
//! `collection_generator.py`. Output is `indent=2, ensure_ascii=False`, insertion-order keys,
//! no trailing newline, sorted by `date_added` descending.

use anyhow::{Context, Result};
use serde_json::{json, Map, Value};

use crate::db::{ArtistRecord, Db, ReleaseRecord};
use crate::sanitize::{release_folder_name, sanitize_folder_name};
use crate::Config;

/// Generate collection.json into `output_path`. Returns the entry count.
pub fn generate(cfg: &Config, db: &Db, output_path: &std::path::Path) -> Result<usize> {
    let releases = db.get_all_releases().context("loading releases")?;
    let mut entries: Vec<(String, Value)> = Vec::with_capacity(releases.len());
    for r in &releases {
        if let Some(entry) = build_entry(cfg, db, r) {
            let date_added = entry.get("date_added").and_then(|d| d.as_str()).unwrap_or("1900-01-01").to_string();
            entries.push((date_added, entry));
        }
    }
    // Newest first.
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    let list: Vec<Value> = entries.into_iter().map(|(_, e)| e).collect();
    let count = list.len();

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Preserve insertion order (no sort) to match the Python writer.
    let text = serde_json::to_string_pretty(&Value::Array(list))?;
    std::fs::write(output_path, text)?;
    Ok(count)
}

fn string_list_filtered(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| a.iter().filter_map(|s| s.as_str()).filter(|s| *s != "Music").map(String::from).collect())
        .unwrap_or_default()
}

fn classify_primary_format(formats: &[String]) -> Option<String> {
    if formats.is_empty() {
        return None;
    }
    let lowered: Vec<String> = formats.iter().map(|f| f.to_lowercase()).collect();
    let any = |pred: &dyn Fn(&str) -> bool| lowered.iter().any(|f| pred(f));
    if any(&|f| f.contains("box")) {
        return Some("Box Set".into());
    }
    if any(&|f| f.contains("vinyl") || matches!(f, "lp" | "7\"" | "10\"" | "12\"")) {
        return Some("Vinyl".into());
    }
    if any(&|f| f.contains("cd")) {
        return Some("CD".into());
    }
    if any(&|f| f.contains("cassette")) {
        return Some("Cassette".into());
    }
    if any(&|f| f.contains("digital") || f.contains("file")) {
        return Some("Digital".into());
    }
    Some(formats[0].clone())
}

/// Truncate a biography to ~200 chars at sentence boundaries (matches the Python logic).
fn truncate_biography(bio: &str) -> Option<String> {
    let bio = bio.trim();
    if bio.is_empty() {
        return None;
    }
    if bio.chars().count() <= 200 {
        return Some(bio.to_string());
    }
    let mut result = String::new();
    for sentence in bio.split(". ") {
        if result.chars().count() + sentence.chars().count() + 2 <= 200 {
            result.push_str(sentence);
            result.push_str(". ");
        } else {
            break;
        }
    }
    if !result.trim().is_empty() {
        Some(result.trim().to_string())
    } else {
        Some(format!("{}...", bio.chars().take(197).collect::<String>()))
    }
}

fn date_only(s: &str) -> String {
    s.split(['T', ' ']).next().unwrap_or(s).to_string()
}

fn genre_names(rec: &ReleaseRecord) -> Vec<String> {
    use std::collections::BTreeSet;
    let mut set: BTreeSet<String> = BTreeSet::new();
    for g in string_list_filtered(&rec.genres) {
        set.insert(g);
    }
    for s in string_list_filtered(&rec.styles) {
        set.insert(s);
    }
    // Apple Music genres from raw_data, when present as a proper dict.
    if let Some(arr) = rec
        .raw_data
        .get("apple_music")
        .and_then(|a| a.get("raw_attributes"))
        .and_then(|a| a.get("genreNames"))
        .and_then(|g| g.as_array())
    {
        for g in arr.iter().filter_map(|g| g.as_str()).filter(|g| *g != "Music") {
            set.insert(g.to_string());
        }
    }
    set.into_iter().collect()
}

fn date_release_year(rec: &ReleaseRecord) -> Option<String> {
    if let Some(d) = rec
        .raw_data
        .get("apple_music")
        .and_then(|a| a.get("raw_attributes"))
        .and_then(|a| a.get("releaseDate"))
        .and_then(|d| d.as_str())
    {
        return Some(d.to_string());
    }
    if let Some(d) = rec.raw_data.get("spotify").and_then(|s| s.get("release_date")).and_then(|d| d.as_str()) {
        return Some(d.to_string());
    }
    if let Some(y) = rec.year {
        return Some(format!("{y}-01-01"));
    }
    rec.released.as_ref().filter(|r| r.len() >= 4).map(|r| format!("{}-01-01", &r[..4]))
}

fn artist_image_uris(cfg: &Config, folder: &str) -> Value {
    let a = &cfg.artists.path;
    json!({
        "hi-res": format!("/{a}/{folder}/{folder}-hi-res.jpg"),
        "medium": format!("/{a}/{folder}/{folder}-medium.jpg"),
        "avatar": format!("/{a}/{folder}/{folder}-avatar.jpg"),
    })
}

fn build_entry(cfg: &Config, db: &Db, rec: &ReleaseRecord) -> Option<Value> {
    let release_name = if let Some(n) = &rec.release_name_discogs {
        n.clone()
    } else if !rec.title.is_empty() {
        rec.title.clone()
    } else {
        return None;
    };

    let artist_entries = rec.artists.as_array()?;
    let names: Vec<String> = artist_entries
        .iter()
        .filter_map(|a| a.get("name").and_then(|n| n.as_str()).map(String::from))
        .filter(|n| !n.is_empty())
        .collect();
    if names.is_empty() {
        return None;
    }
    let release_artist = names.join(" & ");
    // The primary (backward-compat) artist URI sanitizes the *joined* artist string.
    let primary_folder = sanitize_folder_name(&release_artist);
    let release_folder = release_folder_name(&release_name, rec.discogs_id.as_deref().unwrap_or(""));

    // Per-artist sub-entries (with truncated biography looked up from the artists table).
    let artists: Vec<Value> = artist_entries
        .iter()
        .filter_map(|a| {
            let name = a.get("name").and_then(|n| n.as_str()).filter(|s| !s.is_empty())?;
            let folder = sanitize_folder_name(name);
            let lookup: Option<ArtistRecord> = a
                .get("discogs_id")
                .and_then(|d| d.as_str())
                .and_then(|d| db.get_artist_by_discogs_id(d).ok().flatten())
                .or_else(|| db.get_artist_by_name(name).ok().flatten());
            let biography = lookup
                .and_then(|r| r.biography)
                .and_then(|b| truncate_biography(&b));
            let mut o = Map::new();
            o.insert("name".into(), json!(name));
            o.insert("uri_artist".into(), json!(format!("/{}/{folder}/", cfg.artists.path)));
            o.insert("json_detailed_artist".into(), json!(format!("/{}/{folder}/{folder}.json", cfg.artists.path)));
            o.insert("images_uri_artist".into(), artist_image_uris(cfg, &folder));
            o.insert("biography".into(), biography.map(Value::from).unwrap_or(Value::Null));
            Some(Value::Object(o))
        })
        .collect();

    // Formats are not filtered for "Music" (unlike genres/styles).
    let formats_raw: Vec<String> = rec
        .formats
        .as_array()
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let format_primary = classify_primary_format(&formats_raw);
    let labels: Vec<String> = rec
        .labels
        .as_array()
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let styles = string_list_filtered(&rec.styles);
    let lastfm_listeners = rec
        .raw_data
        .get("lastfm")
        .and_then(|l| l.get("listeners"))
        .and_then(|v| v.as_str().and_then(|s| s.parse::<i64>().ok()).or_else(|| v.as_i64()));

    let a = &cfg.artists.path;
    let alb = &cfg.releases.path;

    // Insertion order matches the existing collection.json.
    let mut e = Map::new();
    e.insert("release_name".into(), json!(release_name));
    e.insert("release_artist".into(), json!(release_artist));
    e.insert("artists".into(), Value::Array(artists));
    e.insert("genre_names".into(), json!(genre_names(rec)));
    e.insert("styles".into(), json!(styles));
    e.insert("formats".into(), json!(formats_raw));
    e.insert("format_primary".into(), format_primary.map(Value::from).unwrap_or(Value::Null));
    e.insert("labels".into(), json!(labels));
    e.insert("country".into(), rec.country.clone().map(Value::from).unwrap_or(Value::Null));
    e.insert("lastfm_listeners".into(), lastfm_listeners.map(Value::from).unwrap_or(Value::Null));
    e.insert("uri_release".into(), json!(format!("/{alb}/{release_folder}/")));
    e.insert("uri_artist".into(), json!(format!("/{a}/{primary_folder}/")));
    e.insert("date_added".into(), json!(rec.date_added.as_deref().map(date_only).unwrap_or_else(|| "1900-01-01".into())));
    e.insert("date_release_year".into(), json!(date_release_year(rec).unwrap_or_else(|| "1900-01-01".into())));
    e.insert("json_detailed_release".into(), json!(format!("/{alb}/{release_folder}/{release_folder}.json")));
    e.insert("json_detailed_artist".into(), json!(format!("/{a}/{primary_folder}/{primary_folder}.json")));
    e.insert("images_uri_release".into(), json!({
        "hi-res": format!("/{alb}/{release_folder}/{release_folder}-hi-res.jpg"),
        "medium": format!("/{alb}/{release_folder}/{release_folder}-medium.jpg"),
    }));
    e.insert("images_uri_artist".into(), artist_image_uris(cfg, &primary_folder));
    Some(Value::Object(e))
}
