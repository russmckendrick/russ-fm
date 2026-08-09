//! `collection.json` generator — the flat index the React frontend reads. Port of
//! `collection_generator.py`. Output is `indent=2, ensure_ascii=False`, insertion-order keys,
//! no trailing newline, sorted by `date_added` descending.

use anyhow::{Context, Result};
use serde_json::{json, Map, Value};

use crate::db::{ArtistRecord, Db, ReleaseRecord};
use crate::sanitize::{release_folder_name, sanitize_folder_name};
use crate::Config;

/// Regenerate the frontend index at `<data>/collection.json` (the canonical location every
/// mutating action must refresh). Returns the entry count.
pub fn regenerate(cfg: &Config, db: &Db) -> Result<usize> {
    generate(cfg, db, &cfg.data_dir().join("collection.json"))
}

/// Generate collection.json into `output_path`. Returns the entry count.
pub fn generate(cfg: &Config, db: &Db, output_path: &std::path::Path) -> Result<usize> {
    let releases = db.get_all_releases().context("loading releases")?;
    let mut entries: Vec<BuiltEntry> = Vec::with_capacity(releases.len());
    for r in &releases {
        if let Some(entry) = build_entry(cfg, db, r) {
            let date_added = entry.get("date_added").and_then(|d| d.as_str()).unwrap_or("1900-01-01").to_string();
            entries.push(BuiltEntry {
                date_added,
                discogs_id: r.discogs_id.clone(),
                boxset_parent_id: boxset_parent_id(r),
                year: r.year,
                entry,
            });
        }
    }
    link_boxsets(&mut entries);
    // Newest first.
    entries.sort_by(|a, b| b.date_added.cmp(&a.date_added));
    let list: Vec<Value> = entries.into_iter().map(|e| e.entry).collect();
    let count = list.len();

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Preserve insertion order (no sort) to match the Python writer.
    let text = serde_json::to_string_pretty(&Value::Array(list))?;
    std::fs::write(output_path, text)?;
    Ok(count)
}

/// A collection.json entry plus the release metadata needed to wire boxset links after the
/// full set has been built.
struct BuiltEntry {
    date_added: String,
    discogs_id: Option<String>,
    boxset_parent_id: Option<String>,
    /// Discogs release year — the sort key for `boxset_contents` (the entry's
    /// `date_release_year` prefers streaming-service dates, which reflect reissues).
    year: Option<i64>,
    entry: Value,
}

/// The parent Discogs ID stored on a boxset member (`raw_data.boxset.parent_discogs_id`).
fn boxset_parent_id(rec: &ReleaseRecord) -> Option<String> {
    rec.raw_data
        .get("boxset")
        .and_then(|b| b.get("parent_discogs_id"))
        .and_then(|p| p.as_str())
        .map(String::from)
}

/// Second pass over the built entries: members gain a `boxset` object pointing at their parent,
/// parents gain a `boxset_contents` list of their members. A member whose parent has vanished
/// keeps a `boxset` marker (null name/uri) so the frontend still excludes it from aggregates.
fn link_boxsets(entries: &mut [BuiltEntry]) {
    use std::collections::HashMap;

    let parents: HashMap<String, Value> = entries
        .iter()
        .filter_map(|e| {
            let id = e.discogs_id.clone()?;
            let summary = json!({
                "release_name": e.entry.get("release_name").cloned().unwrap_or(Value::Null),
                "uri_release": e.entry.get("uri_release").cloned().unwrap_or(Value::Null),
                "images_uri_release": e.entry.get("images_uri_release").cloned().unwrap_or(Value::Null),
            });
            Some((id, summary))
        })
        .collect();

    // parent discogs_id → member summaries, ordered by Discogs release year then name.
    let mut members: HashMap<String, Vec<(i64, String, Value)>> = HashMap::new();
    for e in entries.iter_mut() {
        let Some(parent_id) = e.boxset_parent_id.clone() else { continue };
        let parent = parents.get(&parent_id);
        if parent.is_none() {
            tracing::warn!(
                "boxset member {} references parent {parent_id}, which has no collection entry",
                e.discogs_id.as_deref().unwrap_or("?")
            );
        }
        let link = json!({
            "parent_discogs_id": parent_id,
            "name": parent.and_then(|p| p.get("release_name").cloned()).unwrap_or(Value::Null),
            "uri_release": parent.and_then(|p| p.get("uri_release").cloned()).unwrap_or(Value::Null),
        });
        if let Some(obj) = e.entry.as_object_mut() {
            obj.insert("boxset".into(), link);
        }
        let year = e.year.unwrap_or(i64::MAX);
        let name = e.entry.get("release_name").and_then(|n| n.as_str()).unwrap_or("").to_string();
        let summary = json!({
            "release_name": e.entry.get("release_name").cloned().unwrap_or(Value::Null),
            "uri_release": e.entry.get("uri_release").cloned().unwrap_or(Value::Null),
            "images_uri_release": e.entry.get("images_uri_release").cloned().unwrap_or(Value::Null),
        });
        members.entry(parent_id).or_default().push((year, name, summary));
    }

    for e in entries.iter_mut() {
        let Some(id) = e.discogs_id.as_deref() else { continue };
        let Some(mut kids) = members.remove(id) else { continue };
        kids.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        if let Some(obj) = e.entry.as_object_mut() {
            obj.insert(
                "boxset_contents".into(),
                Value::Array(kids.into_iter().map(|(_, _, s)| s).collect()),
            );
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn built(id: &str, name: &str, year: i64, parent: Option<&str>) -> BuiltEntry {
        BuiltEntry {
            date_added: "2026-01-01".into(),
            discogs_id: Some(id.into()),
            boxset_parent_id: parent.map(String::from),
            year: Some(year),
            entry: json!({
                "release_name": name,
                "uri_release": format!("/album/{id}/"),
                "images_uri_release": { "hi-res": format!("/album/{id}/hr.jpg"), "medium": format!("/album/{id}/m.jpg") },
            }),
        }
    }

    #[test]
    fn members_gain_boxset_link_and_parent_gains_sorted_contents() {
        let mut entries = vec![
            built("1", "Remastered In Vinyl I", 2018, None),
            built("3", "Never For Ever", 1980, Some("1")),
            built("2", "The Kick Inside", 1978, Some("1")),
        ];
        link_boxsets(&mut entries);

        let member = &entries[1].entry;
        assert_eq!(member["boxset"]["parent_discogs_id"], json!("1"));
        assert_eq!(member["boxset"]["name"], json!("Remastered In Vinyl I"));
        assert_eq!(member["boxset"]["uri_release"], json!("/album/1/"));

        let contents = entries[0].entry["boxset_contents"].as_array().expect("parent has contents");
        let names: Vec<&str> = contents.iter().map(|c| c["release_name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["The Kick Inside", "Never For Ever"]);
    }

    #[test]
    fn orphan_member_keeps_boxset_marker_with_null_parent_fields() {
        let mut entries = vec![built("2", "The Kick Inside", 1978, Some("999"))];
        link_boxsets(&mut entries);
        let member = &entries[0].entry;
        assert_eq!(member["boxset"]["parent_discogs_id"], json!("999"));
        assert_eq!(member["boxset"]["name"], Value::Null);
        assert!(member.get("boxset_contents").is_none());
    }

    #[test]
    fn unlinked_entries_are_untouched() {
        let mut entries = vec![built("1", "OK Computer", 1997, None)];
        link_boxsets(&mut entries);
        assert!(entries[0].entry.get("boxset").is_none());
        assert!(entries[0].entry.get("boxset_contents").is_none());
    }
}
