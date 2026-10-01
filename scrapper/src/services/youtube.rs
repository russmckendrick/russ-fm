//! YouTube embed playability. No API key: reads the `previewPlayabilityStatus` the public embed
//! page (`/embed/<id>`) carries, the same verdict the IFrame player acts on. oEmbed is no use
//! here: it answers 200 for videos a label has blocked from playing on other sites.
//!
//! The page is ~150 KB with the status ~90 KB in, so the body is streamed and dropped as soon
//! as the status has been read.

use once_cell::sync::Lazy;
use regex::Regex;

use super::http::{build_client, Limiter, ServiceError, ServiceResult};

/// A desktop browser UA: the embed page served to unknown agents can differ.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/// Sent as the embedding page, like the site's own player.
const REFERER: &str = "https://russ.fm/";
/// Give up on a page that hasn't shown the status by this many bytes.
const MAX_BYTES: usize = 400_000;
/// Bytes after the marker that hold the status, reason and `playableInEmbed`.
const TAIL: usize = 800;

/// What the embed page says about a video.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Playability {
    /// Plays in an embedded player.
    Playable,
    /// Will not play in an embed: removed, private, age-gated, or blocked from other sites.
    /// The string is YouTube's status plus its reason, for the record.
    Unplayable(String),
}

#[derive(Clone)]
pub struct YouTubeService {
    client: reqwest::Client,
    limiter: Limiter,
}

impl Default for YouTubeService {
    fn default() -> Self {
        Self::new()
    }
}

impl YouTubeService {
    pub fn new() -> Self {
        Self { client: build_client(USER_AGENT), limiter: Limiter::per_minute(480) }
    }

    /// The embed verdict for one video id. `Err(RateLimited)` when YouTube asks the client to
    /// prove it isn't a bot — that says nothing about the video, so callers should stop, not
    /// record it.
    pub async fn playability(&self, id: &str) -> ServiceResult<Playability> {
        self.limiter.acquire().await;
        let mut resp = self
            .client
            .get(format!("https://www.youtube.com/embed/{id}"))
            .header(reqwest::header::REFERER, REFERER)
            .header(reqwest::header::ACCEPT_LANGUAGE, "en-GB,en;q=0.9")
            .send()
            .await?;
        match resp.status().as_u16() {
            200 => {}
            429 => return Err(ServiceError::RateLimited),
            404 => return Ok(Playability::Unplayable("NOT_FOUND".into())),
            s => return Err(ServiceError::Unexpected(format!("youtube embed status {s}"))),
        }
        let mut body: Vec<u8> = Vec::with_capacity(160_000);
        while let Some(chunk) = resp.chunk().await? {
            body.extend_from_slice(&chunk);
            if let Some(at) = find(&body, b"previewPlayabilityStatus") {
                if body.len() >= at + TAIL {
                    break;
                }
            }
            if body.len() > MAX_BYTES {
                break;
            }
        }
        parse(&String::from_utf8_lossy(&body))
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Read the verdict from embed page HTML, where the player config is JSON inside a JS string
/// (quotes escaped as `\"`).
fn parse(html: &str) -> ServiceResult<Playability> {
    static STATUS: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r#"previewPlayabilityStatus\\?":\{\\?"status\\?":\\?"([A-Z_]+)"#).expect("status pattern")
    });
    static REASON: Lazy<Regex> = Lazy::new(|| Regex::new(r#"\\?"reason\\?":\\?"([^"\\]*)"#).expect("reason pattern"));
    static EMBED: Lazy<Regex> = Lazy::new(|| Regex::new(r#"playableInEmbed\\?":(true|false)"#).expect("embed pattern"));

    let Some(m) = STATUS.captures(html) else {
        return Err(ServiceError::Unexpected("youtube embed page has no playability status".into()));
    };
    let status = m[1].to_string();
    let start = m.get(0).map_or(0, |g| g.start());
    let tail = &html[start..html.len().min(start + TAIL)];
    let reason = REASON.captures(tail).map(|r| r[1].to_string()).unwrap_or_default();
    if reason.to_lowercase().contains("bot") {
        return Err(ServiceError::RateLimited);
    }
    if status == "OK" {
        // An OK video can still refuse embeds.
        return Ok(match EMBED.captures(tail).map(|e| e[1] == *"true") {
            Some(false) => Playability::Unplayable("OK: not playable in embeds".into()),
            _ => Playability::Playable,
        });
    }
    Ok(Playability::Unplayable(if reason.is_empty() { status } else { format!("{status}: {reason}") }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_embed_verdicts() {
        let ok = r#"x previewPlayabilityStatus\":{\"status\":\"OK\",\"playableInEmbed\":true,\"contextParams\":\"Q0\"} y"#;
        assert_eq!(parse(ok).unwrap(), Playability::Playable);
        let no_embed = r#"previewPlayabilityStatus\":{\"status\":\"OK\",\"playableInEmbed\":false}"#;
        assert!(matches!(parse(no_embed).unwrap(), Playability::Unplayable(_)));
        let private = r#"previewPlayabilityStatus\":{\"status\":\"LOGIN_REQUIRED\",\"reason\":\"This video is private\",\"messages\":[]}"#;
        assert_eq!(parse(private).unwrap(), Playability::Unplayable("LOGIN_REQUIRED: This video is private".into()));
        let gone = r#"previewPlayabilityStatus\":{\"status\":\"UNPLAYABLE\",\"reason\":\"Video unavailable\",\"errorScreen\":{}}"#;
        assert_eq!(parse(gone).unwrap(), Playability::Unplayable("UNPLAYABLE: Video unavailable".into()));
        let bot = r#"previewPlayabilityStatus\":{\"status\":\"LOGIN_REQUIRED\",\"reason\":\"Sign in to confirm you’re not a bot\"}"#;
        assert!(matches!(parse(bot), Err(ServiceError::RateLimited)));
        assert!(parse("<html>nothing</html>").is_err());
    }
}
