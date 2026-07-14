//! Faithful port of `ReleaseSerializer.to_dict` / `ArtistSerializer.to_dict`.
//!
//! Produces the exact key sets the React frontend reads from `public/album/*` and
//! `public/artist/*`. Output is serialized with **alphabetically sorted keys, 2-space indent,
//! raw UTF-8, no trailing newline** to match the Python `json.dumps(sort_keys=True, indent=2,
//! ensure_ascii=False)` writer.

use serde_json::{json, Map, Value};

use crate::db::{ArtistRecord, Db, ReleaseRecord};
use crate::util::now_iso;

/// Recursively rebuild a value with object keys in sorted order (so pretty-printing emits sorted
/// keys regardless of the `preserve_order` feature).
fn sort_value(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = Map::new();
            for k in keys {
                out.insert(k.clone(), sort_value(&map[k]));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sort_value).collect()),
        other => other.clone(),
    }
}

/// Serialize a value as sorted-key, 2-space-indent JSON with no trailing newline.
pub fn to_pretty_sorted(v: &Value) -> String {
    serde_json::to_string_pretty(&sort_value(v)).unwrap_or_default()
}

/// Patch a top-level field of an existing public album JSON file in place (no full regenerate),
/// matching the Python `json_updater` behaviour. Returns true if the file existed and was written.
pub fn patch_album_field(album_dir: &std::path::Path, folder: &str, key: &str, value: Value) -> std::io::Result<bool> {
    let path = album_dir.join(folder).join(format!("{folder}.json"));
    let Ok(text) = std::fs::read_to_string(&path) else { return Ok(false) };
    let mut doc: Value = serde_json::from_str(&text).map_err(std::io::Error::other)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert(key.to_string(), value);
    }
    std::fs::write(&path, to_pretty_sorted(&doc))?;
    Ok(true)
}

/// Patch `services.perplexity` inside an existing public album JSON file in place.
pub fn patch_album_service(album_dir: &std::path::Path, folder: &str, service: &str, value: Value) -> std::io::Result<bool> {
    let path = album_dir.join(folder).join(format!("{folder}.json"));
    let Ok(text) = std::fs::read_to_string(&path) else { return Ok(false) };
    let mut doc: Value = serde_json::from_str(&text).map_err(std::io::Error::other)?;
    if let Some(obj) = doc.as_object_mut() {
        let services = obj.entry("services").or_insert_with(|| serde_json::json!({}));
        if let Some(s) = services.as_object_mut() {
            s.insert(service.to_string(), value);
        }
    }
    std::fs::write(&path, to_pretty_sorted(&doc))?;
    Ok(true)
}

fn as_array(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}

/// Rebuild a release image to the fixed `{url,type,width,height,resource_url}` shape.
fn release_image(img: &Value) -> Value {
    json!({
        "url": img.get("url").cloned().unwrap_or(Value::Null),
        "type": img.get("type").cloned().unwrap_or(Value::Null),
        "width": img.get("width").cloned().unwrap_or(Value::Null),
        "height": img.get("height").cloned().unwrap_or(Value::Null),
        "resource_url": img.get("resource_url").cloned().unwrap_or(Value::Null),
    })
}

/// Rebuild an artist image to the fixed `{url,type,width,height}` shape.
fn artist_image(img: &Value) -> Value {
    json!({
        "url": img.get("url").cloned().unwrap_or(Value::Null),
        "type": img.get("type").cloned().unwrap_or(Value::Null),
        "width": img.get("width").cloned().unwrap_or(Value::Null),
        "height": img.get("height").cloned().unwrap_or(Value::Null),
    })
}

/// Rebuild a track to `{position,title,duration,artists}` (artists default `[]`).
fn track(t: &Value) -> Value {
    json!({
        "position": t.get("position").cloned().unwrap_or_else(|| json!("")),
        "title": t.get("title").cloned().unwrap_or_else(|| json!("")),
        "duration": t.get("duration").cloned().unwrap_or(Value::Null),
        "artists": t.get("artists").cloned().unwrap_or_else(|| json!([])),
    })
}

/// Build the enriched artist entry for a release's `artists[]`, joining the artists table.
fn enriched_release_artist(entry: &Value, db: &Db) -> Value {
    let name = entry.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let role = entry.get("role").cloned().unwrap_or_else(|| json!(""));
    let entry_discogs = entry.get("discogs_id").and_then(|d| d.as_str()).map(String::from);
    // Biography/Wikipedia URL may be embedded on the entry (fresh Wikipedia lookup); prefer those.
    let embedded_bio = entry.get("biography").and_then(|b| b.as_str()).filter(|s| !s.is_empty()).map(String::from);
    let embedded_wiki = entry.get("wikipedia_url").and_then(|w| w.as_str()).filter(|s| !s.is_empty()).map(String::from);

    // Look up the rich artist record by discogs_id, falling back to name.
    let rec = entry_discogs
        .as_deref()
        .and_then(|d| db.get_artist_by_discogs_id(d).ok().flatten())
        .or_else(|| db.get_artist_by_name(&name).ok().flatten());

    let mut obj = Map::new();
    // The release-embedded artist carries no id of its own (matches existing public files).
    obj.insert("id".into(), Value::Null);
    obj.insert("name".into(), json!(name));
    obj.insert("role".into(), role);
    if let Some(r) = &rec {
        let bio = embedded_bio.clone().or_else(|| r.biography.clone());
        obj.insert("biography".into(), bio.map(Value::from).unwrap_or(Value::Null));
        obj.insert(
            "discogs_id".into(),
            entry_discogs.clone().map(Value::from).or_else(|| r.discogs_id.clone().map(Value::from)).unwrap_or(Value::Null),
        );
        obj.insert("apple_music_id".into(), r.apple_music_id.clone().map(Value::from).unwrap_or(Value::Null));
        obj.insert("spotify_id".into(), r.spotify_id.clone().map(Value::from).unwrap_or(Value::Null));
        obj.insert("lastfm_mbid".into(), r.lastfm_mbid.clone().map(Value::from).unwrap_or(Value::Null));
        let wiki = embedded_wiki.clone().or_else(|| r.wikipedia_url.clone());
        obj.insert("wikipedia_url".into(), wiki.map(Value::from).unwrap_or(Value::Null));
        // discogs_original_name is only present when the artist's raw_data has a discogs section.
        if let Some(discogs) = r.raw_data.get("discogs") {
            let original = discogs
                .get("original_name")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| name.clone());
            obj.insert("discogs_original_name".into(), json!(original));
        }
    } else {
        obj.insert("biography".into(), embedded_bio.map(Value::from).unwrap_or(Value::Null));
        obj.insert("discogs_id".into(), entry_discogs.map(Value::from).unwrap_or(Value::Null));
        obj.insert("apple_music_id".into(), Value::Null);
        obj.insert("spotify_id".into(), Value::Null);
        obj.insert("lastfm_mbid".into(), Value::Null);
        obj.insert("wikipedia_url".into(), embedded_wiki.map(Value::from).unwrap_or(Value::Null));
    }
    Value::Object(obj)
}

/// Build the `services{}` block from a release's `raw_data` (top-level service dicts, as-is).
/// Legacy rows written by the Python pipeline stored perplexity under `raw_data.services`;
/// fall back to it so those descriptions keep rendering without a data migration.
fn release_services(raw: &Value) -> Value {
    let mut out = Map::new();
    for key in ["apple_music", "spotify", "lastfm", "perplexity"] {
        if let Some(v) = raw.get(key) {
            out.insert(key.into(), v.clone());
        }
    }
    if !out.contains_key("perplexity") {
        if let Some(v) = raw.get("services").and_then(|s| s.get("perplexity")) {
            out.insert("perplexity".into(), v.clone());
        }
    }
    Value::Object(out)
}

/// Serialize a full release to its public JSON value.
pub fn release_to_value(rec: &ReleaseRecord, db: &Db) -> Value {
    let artists: Vec<Value> = as_array(&rec.artists).iter().map(|a| enriched_release_artist(a, db)).collect();
    let images: Vec<Value> = as_array(&rec.images).iter().map(release_image).collect();
    let tracklist: Vec<Value> = as_array(&rec.tracklist).iter().map(track).collect();

    // artists_wikipedia: { name: {wikipedia_url, biography} } for artists carrying either.
    let mut wiki = Map::new();
    for a in &artists {
        let has_wiki = a.get("wikipedia_url").map(|v| !v.is_null()).unwrap_or(false);
        let has_bio = a.get("biography").map(|v| !v.is_null()).unwrap_or(false);
        if has_wiki || has_bio {
            if let Some(name) = a.get("name").and_then(|n| n.as_str()) {
                wiki.insert(
                    name.to_string(),
                    json!({
                        "wikipedia_url": a.get("wikipedia_url").cloned().unwrap_or(Value::Null),
                        "biography": a.get("biography").cloned().unwrap_or(Value::Null),
                    }),
                );
            }
        }
    }

    // processing_info
    let mut services_used = Vec::new();
    if rec.discogs_id.is_some() {
        services_used.push("discogs");
    }
    if rec.apple_music_id.is_some() {
        services_used.push("apple_music");
    }
    if rec.spotify_id.is_some() {
        services_used.push("spotify");
    }
    if rec.lastfm_mbid.is_some() {
        services_used.push("lastfm");
    }
    if !wiki.is_empty() {
        services_used.push("wikipedia");
    }
    // Deliberately only the canonical top-level key: legacy rows (perplexity nested under
    // raw_data.services) predate services_used tracking on disk, and the fidelity gate pins
    // that behaviour. The visible services{} block still falls back for them.
    if rec.raw_data.get("perplexity").is_some() {
        services_used.push("perplexity");
    }
    let local_count = rec
        .local_images
        .as_object()
        .map(|m| m.values().filter(|v| !v.is_null()).count())
        .unwrap_or(0);
    let has_local = rec.local_images.as_object().map(|m| !m.is_empty()).unwrap_or(false);

    json!({
        "id": rec.id,
        "title": rec.title,
        "discogs_id": rec.discogs_id,
        "year": rec.year,
        "released": rec.released,
        "country": rec.country,
        "formats": rec.formats,
        "labels": rec.labels,
        "genres": rec.genres,
        "styles": rec.styles,
        "release_name_discogs": rec.release_name_discogs,
        "release_name_apple_music": rec.release_name_apple_music,
        "release_name_spotify": rec.release_name_spotify,
        "apple_music_id": rec.apple_music_id,
        "spotify_id": rec.spotify_id,
        "lastfm_mbid": rec.lastfm_mbid,
        "discogs_url": rec.discogs_url,
        "apple_music_url": rec.apple_music_url,
        "spotify_url": rec.spotify_url,
        "lastfm_url": rec.lastfm_url,
        "created_at": rec.created_at,
        "updated_at": rec.updated_at,
        "date_added": rec.date_added,
        "artists": artists,
        "images": images,
        "tracklist": tracklist,
        "videos": rec.videos,
        "local_images": rec.local_images,
        "services": release_services(&rec.raw_data),
        "artists_wikipedia": Value::Object(wiki),
        "processing_info": json!({
            "processed_at": now_iso(),
            "services_used": services_used,
            "has_local_images": has_local,
            "local_images_count": local_count,
        }),
    })
}

/// Build the artist `services{}` block from `raw_data` (top-level dicts, as-is).
fn artist_services(raw: &Value) -> Value {
    let mut out = Map::new();
    for key in ["apple_music", "spotify", "lastfm", "discogs", "theaudiodb", "perplexity"] {
        if let Some(v) = raw.get(key) {
            out.insert(key.into(), v.clone());
        }
    }
    Value::Object(out)
}

/// Serialize a standalone artist to its public JSON value.
pub fn artist_to_value(rec: &ArtistRecord) -> Value {
    let images: Vec<Value> = as_array(&rec.images).iter().map(artist_image).collect();

    let mut obj = Map::new();
    obj.insert("id".into(), json!(rec.id));
    obj.insert("name".into(), json!(rec.name));
    obj.insert("biography".into(), rec.biography.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("discogs_id".into(), rec.discogs_id.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("apple_music_id".into(), rec.apple_music_id.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("spotify_id".into(), rec.spotify_id.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("lastfm_mbid".into(), rec.lastfm_mbid.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("discogs_url".into(), rec.discogs_url.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("apple_music_url".into(), rec.apple_music_url.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("spotify_url".into(), rec.spotify_url.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("lastfm_url".into(), rec.lastfm_url.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("wikipedia_url".into(), rec.wikipedia_url.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("genres".into(), rec.genres.clone());
    obj.insert("popularity".into(), rec.popularity.map(Value::from).unwrap_or(Value::Null));
    obj.insert("followers".into(), rec.followers.map(Value::from).unwrap_or(Value::Null));
    obj.insert("country".into(), rec.country.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("formed_date".into(), rec.formed_date.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("images".into(), Value::Array(images));
    obj.insert("local_images".into(), rec.local_images.clone());
    obj.insert("created_at".into(), rec.created_at.clone().map(Value::from).unwrap_or(Value::Null));
    obj.insert("updated_at".into(), rec.updated_at.clone().map(Value::from).unwrap_or(Value::Null));

    // include_enrichment && artist.raw_data → add services + raw_data
    let raw_nonempty = rec.raw_data.as_object().map(|m| !m.is_empty()).unwrap_or(false);
    if raw_nonempty {
        obj.insert("services".into(), artist_services(&rec.raw_data));
        obj.insert("raw_data".into(), rec.raw_data.clone());
    }

    Value::Object(obj)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn release_services_reads_canonical_top_level_perplexity() {
        let raw = json!({
            "apple_music": {"id": "1"},
            "perplexity": {"description": "top-level"}
        });
        let s = release_services(&raw);
        assert_eq!(s.get("perplexity").and_then(|p| p.get("description")), Some(&json!("top-level")));
        assert_eq!(s.get("apple_music").and_then(|a| a.get("id")), Some(&json!("1")));
    }

    #[test]
    fn release_services_falls_back_to_legacy_services_perplexity() {
        let raw = json!({
            "services": { "perplexity": {"description": "legacy"} }
        });
        let s = release_services(&raw);
        assert_eq!(s.get("perplexity").and_then(|p| p.get("description")), Some(&json!("legacy")));
    }

    #[test]
    fn release_services_prefers_top_level_over_legacy() {
        let raw = json!({
            "perplexity": {"description": "top-level"},
            "services": { "perplexity": {"description": "legacy"} }
        });
        let s = release_services(&raw);
        assert_eq!(s.get("perplexity").and_then(|p| p.get("description")), Some(&json!("top-level")));
    }
}
