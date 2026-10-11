//! Minimal MusicBrainz client. No auth; MusicBrainz asks for a descriptive User-Agent and at
//! most one request per second.

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{bail, Result};
use serde_json::Value;
use tokio::sync::Mutex;

const BASE: &str = "https://musicbrainz.org/ws/2";
const USER_AGENT: &str = "russ-fm-discogs-sub/0.1 ( https://russ.fm )";

/// Everything a release lookup needs to rebuild a tracklist and credits.
const RELEASE_INC: &str = "recordings+artist-credits+labels+release-groups+artist-rels+recording-level-rels+work-rels+work-level-rels";

#[derive(Clone)]
pub struct MusicBrainz {
    client: reqwest::Client,
    /// When the last request went out — requests are spaced strictly (no bursts).
    last: Arc<Mutex<Option<Instant>>>,
}

impl MusicBrainz {
    pub fn new() -> Self {
        Self {
            client: scrapper::services::http::build_client(USER_AGENT),
            last: Arc::new(Mutex::new(None)),
        }
    }

    async fn pace(&self) {
        let mut last = self.last.lock().await;
        if let Some(t) = *last {
            let gap = Duration::from_millis(1100);
            if t.elapsed() < gap {
                tokio::time::sleep(gap - t.elapsed()).await;
            }
        }
        *last = Some(Instant::now());
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> Result<Value> {
        let mut q: Vec<(&str, String)> = query.to_vec();
        q.push(("fmt", "json".into()));
        for attempt in 0..4u64 {
            self.pace().await;
            let resp = self.client.get(format!("{BASE}{path}")).query(&q).send().await?;
            match resp.status().as_u16() {
                200 => return Ok(resp.json().await?),
                503 | 429 => tokio::time::sleep(Duration::from_secs(2 * (attempt + 1))).await,
                s => bail!("musicbrainz {path}: status {s}"),
            }
        }
        bail!("musicbrainz {path}: rate limited")
    }

    /// Releases carrying exactly this barcode.
    pub async fn releases_by_barcode(&self, barcode: &str) -> Result<Vec<Value>> {
        let v = self.get("/release", &[("query", format!("barcode:{barcode}"))]).await?;
        Ok(array(&v, "releases"))
    }

    /// Releases matching artist + title (Lucene search), each with media formats and barcode.
    pub async fn search_releases(&self, artist: &str, title: &str) -> Result<Vec<Value>> {
        let query = format!("release:\"{}\" AND artist:\"{}\"", lucene(title), lucene(artist));
        let v = self.get("/release", &[("query", query), ("limit", "25".into())]).await?;
        Ok(array(&v, "releases"))
    }

    /// One release with recordings, credits and relationships.
    pub async fn release(&self, mbid: &str) -> Result<Value> {
        self.get(&format!("/release/{mbid}"), &[("inc", RELEASE_INC.into())]).await
    }
}

fn array(v: &Value, key: &str) -> Vec<Value> {
    v.get(key).and_then(|a| a.as_array()).cloned().unwrap_or_default()
}

/// Escape Lucene's special characters inside a quoted phrase.
fn lucene(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// The media formats of a MusicBrainz release, e.g. `["12\" Vinyl", "12\" Vinyl"]`.
pub fn media_formats(release: &Value) -> Vec<String> {
    release
        .get("media")
        .and_then(|m| m.as_array())
        .map(|m| m.iter().filter_map(|x| x.get("format").and_then(|f| f.as_str()).map(String::from)).collect())
        .unwrap_or_default()
}
