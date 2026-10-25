//! Album artwork download. Mirrors `image_manager.py`: only the hi-res image is downloaded
//! (medium/avatar are generated later by the frontend's Sharp build). Source priority is
//! preferred → apple_music → spotify → lastfm → discogs. Artists also get their TheAudioDB
//! fanart, wide background photos stored as `{folder}-fanart01.jpg`, `-fanart02.jpg`, ….

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

/// The most fanart images kept per artist (TheAudioDB has up to four). `rename::ARTIST_SUFFIXES`
/// lists one suffix per number, so a renamed artist's fanart moves with it.
pub const MAX_FANART: usize = 4;

/// TheAudioDB's fanart for an artist, in TheAudioDB's order: wide background photos
/// (1280×720 in practice) with no text on them. Reads both shapes of `raw_data.theaudiodb`:
/// the API's own `strArtistFanart`…`strArtistFanart4`, and the `images` list (`type: fanart`)
/// the Python scrapper stored.
pub fn artist_fanart_urls(raw_data: &Value) -> Vec<String> {
    let Some(t) = raw_data.get("theaudiodb") else {
        return Vec::new();
    };
    let listed = t
        .get("images")
        .and_then(|i| i.as_array())
        .into_iter()
        .flatten()
        .filter(|i| i.get("type").and_then(|v| v.as_str()) == Some("fanart"))
        .filter_map(|i| i.get("url").and_then(|u| u.as_str()));
    let mut urls: Vec<String> = Vec::new();
    for url in ["strArtistFanart", "strArtistFanart2", "strArtistFanart3", "strArtistFanart4"]
        .iter()
        .filter_map(|k| t.get(*k).and_then(|u| u.as_str()))
        .chain(listed)
        .map(str::trim)
    {
        let url = theaudiodb_image_url(url);
        if !url.is_empty() && !urls.contains(&url) {
            urls.push(url);
        }
    }
    urls.truncate(MAX_FANART);
    urls
}

/// TheAudioDB moved its images from `www.theaudiodb.com/images/media/artist/…` (either case of
/// `artist`; now 404) to `r2.theaudiodb.com/images/media/artist/…`; older stored URLs still
/// point at the first.
fn theaudiodb_image_url(url: &str) -> String {
    const OLD: &str = "https://www.theaudiodb.com/images/media/artist/";
    match url.get(..OLD.len()) {
        Some(head) if head.eq_ignore_ascii_case(OLD) => format!("https://r2.theaudiodb.com/images/media/artist/{}", &url[OLD.len()..]),
        _ => url.to_string(),
    }
}

/// Which of an artist's fanart the site may use, from the hand-set `raw_data.overrides.fanart`:
/// blank (automatic, all of it), `off`, or the numbers to use (`1,2`), for when TheAudioDB files
/// someone else's photo under the artist (Radiohead's third is R.E.M.). Every fanart is still
/// downloaded and kept on disk; generate-artist-images skips the ones ruled out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FanartChoice {
    All,
    Off,
    Only(Vec<usize>),
}

impl FanartChoice {
    /// Parse the editor's text; blank is [`FanartChoice::All`].
    pub fn parse(text: &str) -> Result<Self, String> {
        let t = text.trim();
        if t.is_empty() {
            return Ok(FanartChoice::All);
        }
        if ["off", "none", "no", "false"].contains(&t.to_ascii_lowercase().as_str()) {
            return Ok(FanartChoice::Off);
        }
        let mut keep = Vec::new();
        for part in t.split([',', ' ']).map(str::trim).filter(|p| !p.is_empty()) {
            match part.parse::<usize>() {
                Ok(n) if (1..=MAX_FANART).contains(&n) => {
                    if !keep.contains(&n) {
                        keep.push(n);
                    }
                }
                _ => return Err(format!("fanart is blank (all of it), off, or the numbers to keep, 1 to {MAX_FANART} (e.g. 1,2)")),
            }
        }
        keep.sort_unstable();
        Ok(FanartChoice::Only(keep))
    }

    /// The artist's stored choice (automatic when unset or unreadable).
    pub fn of(raw_data: &Value) -> Self {
        let text = raw_data.get("overrides").and_then(|o| o.get("fanart")).and_then(|v| v.as_str()).unwrap_or_default();
        Self::parse(text).unwrap_or(FanartChoice::All)
    }

    /// The text stored in `raw_data.overrides.fanart`, or None for automatic.
    pub fn stored(&self) -> Option<String> {
        match self {
            FanartChoice::All => None,
            FanartChoice::Off => Some("off".into()),
            FanartChoice::Only(keep) => Some(keep.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(",")),
        }
    }

    pub fn keeps(&self, n: usize) -> bool {
        match self {
            FanartChoice::All => true,
            FanartChoice::Off => false,
            FanartChoice::Only(keep) => keep.contains(&n),
        }
    }
}

/// A fanart number from `fanart02`, `02` or `2` (1 to [`MAX_FANART`]).
fn fanart_number(text: &str) -> Option<usize> {
    let t = text.trim().to_ascii_lowercase();
    let digits = t.strip_prefix("fanart").unwrap_or(&t);
    digits.parse::<usize>().ok().filter(|n| (1..=MAX_FANART).contains(n))
}

/// A hand-set override under `raw_data.overrides`.
fn override_text(raw_data: &Value, key: &str) -> String {
    raw_data.get("overrides").and_then(|o| o.get(key)).and_then(|v| v.as_str()).unwrap_or_default().trim().to_string()
}

/// Which image the site's desktop artist hero shows, from `raw_data.overrides.hero`: picked
/// automatically (fanart, colour first), the artist's own photo, or one fanart by number.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeroChoice {
    Auto,
    Photo,
    Fanart(usize),
}

impl HeroChoice {
    /// `auto` / blank, `photo`, or a fanart (`fanart02`, `2`).
    pub fn parse(text: &str) -> Result<Self, String> {
        let t = text.trim().to_ascii_lowercase();
        match t.as_str() {
            "" | "auto" => Ok(HeroChoice::Auto),
            "photo" => Ok(HeroChoice::Photo),
            _ => fanart_number(&t)
                .map(HeroChoice::Fanart)
                .ok_or_else(|| format!("the hero is auto, photo, or a fanart number (fanart01 to fanart{MAX_FANART:02})")),
        }
    }

    pub fn of(raw_data: &Value) -> Self {
        Self::parse(&override_text(raw_data, "hero")).unwrap_or(HeroChoice::Auto)
    }

    /// The text stored in `raw_data.overrides.hero`, or None for automatic.
    pub fn stored(self) -> Option<String> {
        match self {
            HeroChoice::Auto => None,
            HeroChoice::Photo => Some("photo".into()),
            HeroChoice::Fanart(n) => Some(format!("fanart{n:02}")),
        }
    }
}

/// The fanart the site uses as the artist photo (its avatar, cards and phone hero) instead of the
/// downloaded `{folder}-hi-res.jpg`, from `raw_data.overrides.photo`; None for the downloaded
/// photo. Nothing on disk changes: generate-artist-images and the site's build follow it.
pub fn photo_fanart(raw_data: &Value) -> Option<usize> {
    fanart_number(&override_text(raw_data, "photo"))
}

/// Parse the artist-photo choice: `auto` / blank (the downloaded photo) or a fanart number.
/// Returns the text to store, or None for the downloaded photo.
pub fn parse_photo_choice(text: &str) -> Result<Option<String>, String> {
    let t = text.trim().to_ascii_lowercase();
    if t.is_empty() || t == "auto" || t == "downloaded" {
        return Ok(None);
    }
    fanart_number(&t)
        .map(|n| Some(format!("fanart{n:02}")))
        .ok_or_else(|| format!("the artist photo is auto (the downloaded one) or a fanart number (fanart01 to fanart{MAX_FANART:02})"))
}

/// `{folder}-fanart01.jpg`, `{folder}-fanart02.jpg`, … (`n` from 1).
pub fn fanart_file_name(folder: &str, n: usize) -> String {
    format!("{folder}-fanart{n:02}.jpg")
}

/// What [`download_artist_fanart`] did.
#[derive(Debug, Default, Clone, Copy)]
pub struct FanartOutcome {
    pub downloaded: usize,
    /// Already on disk and left alone (no `overwrite`).
    pub kept: usize,
    pub failed: usize,
}

/// Download an artist's TheAudioDB fanart next to its hi-res photo, as
/// `{artist_dir}/{folder}/{folder}-fanart01.jpg`, `-fanart02.jpg`, … in TheAudioDB's order —
/// all of it, whatever the overrides say (they only decide what the site uses). Files already
/// there are kept unless `overwrite`, and nothing is ever deleted. Only JPEGs are written;
/// anything else counts as failed.
pub async fn download_artist_fanart(
    client: &reqwest::Client,
    artist_dir: &Path,
    folder: &str,
    raw_data: &Value,
    overwrite: bool,
) -> FanartOutcome {
    let mut out = FanartOutcome::default();
    let dir = artist_dir.join(folder);
    let urls = artist_fanart_urls(raw_data);
    if urls.is_empty() {
        return out;
    }
    if std::fs::create_dir_all(&dir).is_err() {
        out.failed = urls.len();
        return out;
    }
    for (i, url) in urls.iter().enumerate() {
        let dest = dir.join(fanart_file_name(folder, i + 1));
        if !overwrite && dest.exists() {
            out.kept += 1;
            continue;
        }
        if download_jpeg(client, url, &dest).await {
            out.downloaded += 1;
        } else {
            tracing::warn!("failed to download fanart {url}");
            out.failed += 1;
        }
    }
    out
}

/// Like [`download`], but only writes the file when the body is a JPEG (`FF D8 FF`), and tries
/// three times: TheAudioDB's image host turns some requests away under a burst of downloads.
async fn download_jpeg(client: &reqwest::Client, url: &str, dest: &Path) -> bool {
    for attempt in 0..3u64 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(1500 * attempt)).await;
        }
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    if bytes.len() > 1024 && bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
                        return std::fs::write(dest, &bytes).is_ok();
                    }
                    return false; // not a JPEG: retrying won't change that
                }
            } else if resp.status() == reqwest::StatusCode::NOT_FOUND {
                return false;
            }
        }
    }
    false
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fanart_urls_read_both_theaudiodb_shapes_in_order() {
        let api = json!({ "theaudiodb": {
            "strArtistFanart": "https://r2.theaudiodb.com/a.jpg",
            "strArtistFanart2": "",
            "strArtistFanart3": "https://r2.theaudiodb.com/c.jpg",
            "strArtistFanart4": null,
        } });
        assert_eq!(artist_fanart_urls(&api), ["https://r2.theaudiodb.com/a.jpg", "https://r2.theaudiodb.com/c.jpg"]);

        let legacy = json!({ "theaudiodb": { "images": [
            { "type": "artist", "url": "https://r2.theaudiodb.com/thumb.jpg" },
            { "type": "fanart", "url": "https://r2.theaudiodb.com/f1.jpg" },
            { "type": "fanart", "url": "https://r2.theaudiodb.com/f1.jpg" },
            { "type": "fanart", "url": "https://r2.theaudiodb.com/f2.jpg" },
        ] } });
        assert_eq!(artist_fanart_urls(&legacy), ["https://r2.theaudiodb.com/f1.jpg", "https://r2.theaudiodb.com/f2.jpg"]);

        assert!(artist_fanart_urls(&json!({})).is_empty());

        let moved = json!({ "theaudiodb": { "strArtistFanart": "https://www.theaudiodb.com/images/media/Artist/fanart/x1.jpg" } });
        assert_eq!(artist_fanart_urls(&moved), ["https://r2.theaudiodb.com/images/media/artist/fanart/x1.jpg"]);
        let lower = json!({ "theaudiodb": { "strArtistFanart": "https://www.theaudiodb.com/images/media/artist/fanart/x2.jpg" } });
        assert_eq!(artist_fanart_urls(&lower), ["https://r2.theaudiodb.com/images/media/artist/fanart/x2.jpg"]);
    }

    #[test]
    fn fanart_override_keeps_numbers_stable() {
        assert_eq!(FanartChoice::parse("").unwrap(), FanartChoice::All);
        assert_eq!(FanartChoice::parse(" Off ").unwrap(), FanartChoice::Off);
        assert_eq!(FanartChoice::parse("2, 1,2").unwrap(), FanartChoice::Only(vec![1, 2]));
        assert!(FanartChoice::parse("5").is_err());
        assert!(FanartChoice::parse("two").is_err());

        let keep = FanartChoice::parse("1,3").unwrap();
        assert!(keep.keeps(1) && !keep.keeps(2) && keep.keeps(3));
        assert!(!FanartChoice::Off.keeps(1));
        assert!(FanartChoice::All.keeps(4));
    }

    #[test]
    fn hero_and_photo_choices_parse() {
        assert_eq!(HeroChoice::parse("").unwrap(), HeroChoice::Auto);
        assert_eq!(HeroChoice::parse("Photo").unwrap(), HeroChoice::Photo);
        assert_eq!(HeroChoice::parse("fanart02").unwrap(), HeroChoice::Fanart(2));
        assert_eq!(HeroChoice::parse("3").unwrap().stored().as_deref(), Some("fanart03"));
        assert!(HeroChoice::parse("fanart9").is_err());
        assert_eq!(parse_photo_choice("auto").unwrap(), None);
        assert_eq!(parse_photo_choice("01").unwrap().as_deref(), Some("fanart01"));
        assert!(parse_photo_choice("photo").is_err());
        assert_eq!(photo_fanart(&json!({ "overrides": { "photo": "fanart02" } })), Some(2));
    }

    #[test]
    fn fanart_files_are_numbered_from_one_with_two_digits() {
        assert_eq!(fanart_file_name("pixies", 1), "pixies-fanart01.jpg");
        assert_eq!(fanart_file_name("pixies", 4), "pixies-fanart04.jpg");
    }

    #[test]
    fn every_fanart_file_moves_on_rename() {
        for n in 1..=MAX_FANART {
            let suffix = fanart_file_name("", n);
            assert!(crate::ops::rename::ARTIST_SUFFIXES.contains(&suffix.as_str()), "{suffix} missing");
        }
    }
}
