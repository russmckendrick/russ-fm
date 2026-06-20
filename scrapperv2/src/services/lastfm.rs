//! Last.fm API client. `api_key` query param + `format=json`; optional MD5 request signing.

use md5::{Digest, Md5};
use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const BASE: &str = "https://ws.audioscrobbler.com/2.0";
const USER_AGENT: &str = "MusicCollectionManager/1.0";

#[derive(Clone)]
pub struct LastfmService {
    client: reqwest::Client,
    api_key: String,
    shared_secret: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl LastfmService {
    pub fn new(cfg: &Config) -> Self {
        Self {
            client: build_client(USER_AGENT),
            api_key: cfg.lastfm.api_key.clone(),
            shared_secret: cfg.lastfm.shared_secret.clone(),
            limiter: Limiter::per_minute(60),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }

    /// MD5 signature over alphabetically-sorted params + shared_secret (excludes `format`).
    pub fn sign(&self, params: &[(&str, String)]) -> String {
        let mut sorted: Vec<&(&str, String)> = params.iter().filter(|(k, _)| *k != "format").collect();
        sorted.sort_by(|a, b| a.0.cmp(b.0));
        let mut s = String::new();
        for (k, v) in sorted {
            s.push_str(k);
            s.push_str(v);
        }
        s.push_str(&self.shared_secret);
        let digest = Md5::digest(s.as_bytes());
        hex::encode(digest)
    }

    async fn call(&self, method: &str, mut params: Vec<(&str, String)>) -> ServiceResult<Value> {
        if self.api_key.is_empty() {
            return Err(ServiceError::Auth("lastfm api_key missing".into()));
        }
        params.push(("method", method.to_string()));
        params.push(("api_key", self.api_key.clone()));
        params.push(("format", "json".to_string()));
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self.client.get(BASE).query(&params).send().await?;
            match resp.status().as_u16() {
                200 => {
                    let v: Value = resp.json().await?;
                    if let Some(err) = v.get("error") {
                        let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("error");
                        return Err(ServiceError::Other(format!("lastfm error {err}: {msg}")));
                    }
                    Ok(v)
                }
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("lastfm status {s}"))),
            }
        })
        .await
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        self.call("chart.getTopTracks", vec![("limit", "1".into())]).await?;
        Ok("api key valid".into())
    }

    pub async fn get_album_info(&self, artist: &str, album: &str) -> ServiceResult<Value> {
        self.call("album.getInfo", vec![("artist", artist.into()), ("album", album.into())]).await
    }

    pub async fn get_artist_info(&self, artist: &str) -> ServiceResult<Value> {
        self.call("artist.getInfo", vec![("artist", artist.into())]).await
    }

    pub async fn search_release(&self, artist: &str, album: &str) -> ServiceResult<Value> {
        self.call("album.search", vec![("album", format!("{artist} {album}"))]).await
    }
}
