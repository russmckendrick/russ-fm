//! Album artwork download. Mirrors `image_manager.py`: only the hi-res image is downloaded
//! (medium/avatar are generated later by the frontend's Sharp build). Source priority is
//! preferred → apple_music → spotify → lastfm → discogs.

use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

/// A candidate artwork source.
struct Source {
    kind: &'static str,
    url: String,
    user_agent: Option<&'static str>,
}

/// Rewrite an Apple Music artwork URL template to a concrete `size`×`size` URL.
pub fn artwork_url_with_size(url: &str, size: u32) -> String {
    static DIM: Lazy<Regex> = Lazy::new(|| Regex::new(r"/\d+x\d+bb\.jpg$").unwrap());
    if url.is_empty() {
        return String::new();
    }
    if url.contains("{w}x{h}") {
        return url.replace("{w}x{h}", &format!("{size}x{size}"));
    }
    if url.contains("{w}") && url.contains("{h}") {
        return url.replace("{w}", &size.to_string()).replace("{h}", &size.to_string());
    }
    if url.contains("mzstatic.com") && url.ends_with("bb.jpg") {
        return DIM.replace(url, format!("/{size}x{size}bb.jpg").as_str()).to_string();
    }
    url.to_string()
}

/// Pick the best Spotify image URL: smallest one still ≥ target, else the largest available.
fn select_spotify_image(images: &[Value], target: u32) -> Option<String> {
    let dim = |img: &Value| -> u32 {
        let w = img.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let h = img.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        w.min(h)
    };
    let mut best: Option<(&Value, u32)> = None;
    for img in images {
        let s = dim(img);
        if s >= target {
            let diff = s - target;
            if best.map(|(_, bd)| diff < bd).unwrap_or(true) {
                best = Some((img, diff));
            }
        }
    }
    let chosen = best.map(|(i, _)| i).or_else(|| {
        images.iter().max_by_key(|img| {
            let w = img.get("width").and_then(|v| v.as_u64()).unwrap_or(0);
            let h = img.get("height").and_then(|v| v.as_u64()).unwrap_or(0);
            w * h
        })
    });
    chosen.and_then(|img| img.get("url").and_then(|u| u.as_str()).map(String::from))
}

/// Build the ordered list of artwork sources from a release's assembled `raw_data`.
fn collect_sources(raw: &Value, target: u32, preferred: Option<&str>) -> Vec<Source> {
    let mut found: Vec<(&'static str, Source)> = Vec::new();

    if let Some(url) = raw.get("apple_music").and_then(|a| a.get("artwork_url")).and_then(|u| u.as_str()) {
        if !url.is_empty() {
            found.push(("apple_music", Source { kind: "apple_music", url: artwork_url_with_size(url, target), user_agent: None }));
        }
    }
    if let Some(imgs) = raw.get("spotify").and_then(|s| s.get("images")).and_then(|i| i.as_array()) {
        if let Some(url) = select_spotify_image(imgs, target) {
            found.push(("spotify", Source { kind: "spotify", url, user_agent: None }));
        }
    }
    if let Some(imgs) = raw.get("lastfm").and_then(|l| l.get("images")).and_then(|i| i.as_array()) {
        // Largest first: prefer extralarge/large/medium.
        let pick = imgs.iter().find(|img| {
            let size = img.get("size").and_then(|s| s.as_str()).unwrap_or("");
            matches!(size, "extralarge" | "large" | "medium")
                && img.get("url").and_then(|u| u.as_str()).map(|s| !s.is_empty()).unwrap_or(false)
        });
        if let Some(url) = pick.and_then(|img| img.get("url").and_then(|u| u.as_str())) {
            found.push(("lastfm", Source { kind: "lastfm", url: url.to_string(), user_agent: Some("Mozilla/5.0 (compatible; MusicCollectionManager/1.0)") }));
        }
    }
    if let Some(imgs) = raw.get("discogs").and_then(|d| d.get("images")).and_then(|i| i.as_array()) {
        let primary = imgs.iter().find(|img| img.get("type").and_then(|t| t.as_str()) == Some("primary"));
        let chosen = primary.or_else(|| imgs.first());
        if let Some(url) = chosen.and_then(|img| img.get("uri").or_else(|| img.get("resource_url")).and_then(|u| u.as_str())) {
            if !url.is_empty() {
                found.push(("discogs", Source { kind: "discogs", url: url.to_string(), user_agent: None }));
            }
        }
    }

    // Order: preferred first, then default priority.
    let mut ordered = Vec::new();
    if let Some(pref) = preferred {
        if let Some(pos) = found.iter().position(|(k, _)| *k == pref) {
            ordered.push(found.remove(pos).1);
        }
    }
    for key in ["apple_music", "spotify", "lastfm", "discogs"] {
        if let Some(pos) = found.iter().position(|(k, _)| *k == key) {
            ordered.push(found.remove(pos).1);
        }
    }
    ordered
}

/// Build ordered artwork sources for an artist from assembled `raw_data`.
fn collect_artist_sources(raw: &Value, target: u32, preferred: Option<&str>) -> Vec<Source> {
    let mut found: Vec<(&'static str, Source)> = Vec::new();
    if let Some(url) = raw.get("apple_music").and_then(|a| a.get("artwork_url")).and_then(|u| u.as_str()) {
        if !url.is_empty() {
            found.push(("apple_music", Source { kind: "apple_music", url: artwork_url_with_size(url, target), user_agent: None }));
        }
    }
    if let Some(imgs) = raw.get("spotify").and_then(|s| s.get("images")).and_then(|i| i.as_array()) {
        if let Some(url) = select_spotify_image(imgs, target) {
            found.push(("spotify", Source { kind: "spotify", url, user_agent: None }));
        }
    }
    if let Some(url) = raw.get("theaudiodb").and_then(|t| t.get("strArtistThumb")).and_then(|u| u.as_str()) {
        if !url.is_empty() {
            found.push(("theaudiodb", Source { kind: "theaudiodb", url: url.to_string(), user_agent: None }));
        }
    }
    let mut ordered = Vec::new();
    if let Some(pref) = preferred {
        if let Some(pos) = found.iter().position(|(k, _)| *k == pref) {
            ordered.push(found.remove(pos).1);
        }
    }
    for key in ["apple_music", "spotify", "theaudiodb"] {
        if let Some(pos) = found.iter().position(|(k, _)| *k == key) {
            ordered.push(found.remove(pos).1);
        }
    }
    ordered
}

/// Download the hi-res artist image into `{artist_dir}/{folder}/{folder}-hi-res.jpg`.
pub async fn download_artist_hires(
    client: &reqwest::Client,
    artist_dir: &Path,
    folder: &str,
    raw_data: &Value,
    target: u32,
    preferred: Option<&str>,
) -> Option<PathBuf> {
    let dir = artist_dir.join(folder);
    std::fs::create_dir_all(&dir).ok()?;
    let dest = dir.join(format!("{folder}-hi-res.jpg"));
    for source in collect_artist_sources(raw_data, target, preferred) {
        if download(client, &source.url, source.user_agent, &dest).await {
            tracing::info!("downloaded artist image from {}", source.kind);
            return Some(dest);
        }
    }
    None
}

async fn download(client: &reqwest::Client, url: &str, user_agent: Option<&str>, dest: &Path) -> bool {
    let mut req = client.get(url);
    if let Some(ua) = user_agent {
        req = req.header("User-Agent", ua);
    }
    match req.send().await {
        Ok(resp) if resp.status().is_success() => match resp.bytes().await {
            Ok(bytes) if bytes.len() > 1024 => std::fs::write(dest, &bytes).is_ok(),
            _ => false,
        },
        _ => false,
    }
}

/// Download the hi-res artwork for a release into `{album_dir}/{folder}/{folder}-hi-res.jpg`.
/// Returns the written path on success.
pub async fn download_release_hires(
    client: &reqwest::Client,
    album_dir: &Path,
    folder: &str,
    raw_data: &Value,
    target: u32,
    preferred: Option<&str>,
) -> Option<PathBuf> {
    let release_folder = album_dir.join(folder);
    std::fs::create_dir_all(&release_folder).ok()?;
    let dest = release_folder.join(format!("{folder}-hi-res.jpg"));

    for source in collect_sources(raw_data, target, preferred) {
        if download(client, &source.url, source.user_agent, &dest).await {
            tracing::info!("downloaded hi-res artwork from {}", source.kind);
            return Some(dest);
        }
        tracing::warn!("failed to download artwork from {}", source.kind);
    }
    None
}
