//! Discogs API client. Token auth via `Authorization: Discogs token=…`.

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const BASE: &str = "https://api.discogs.com";
const USER_AGENT: &str = "MusicCollectionManager/1.0";

#[derive(Clone)]
pub struct DiscogsService {
    client: reqwest::Client,
    token: String,
    pub username: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl DiscogsService {
    pub fn new(cfg: &Config) -> Self {
        Self {
            client: build_client(USER_AGENT),
            token: cfg.discogs.access_token.clone(),
            username: cfg.discogs.username.clone(),
            limiter: Limiter::per_minute(60),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.token.is_empty()
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        if self.token.is_empty() {
            return Err(ServiceError::Auth("discogs access_token missing".into()));
        }
        let url = format!("{BASE}{path}");
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self
                .client
                .get(&url)
                .header("Authorization", format!("Discogs token={}", self.token))
                .query(query)
                .send()
                .await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                401 | 403 => Err(ServiceError::Auth("discogs auth failed".into())),
                404 => Err(ServiceError::NotFound),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("discogs status {s}"))),
            }
        })
        .await
    }

    /// Validate the token by reading the user's collection. NOTE: `/oauth/identity` only accepts
    /// OAuth consumer credentials and 401s on personal access tokens, so we probe a data endpoint
    /// that a personal token is actually authorized for.
    pub async fn health_check(&self) -> ServiceResult<String> {
        if self.username.is_empty() {
            // Fall back to a token-authorized resource fetch.
            self.get("/releases/1", &[]).await?;
            return Ok("token accepted".into());
        }
        let path = format!("/users/{}/collection/folders/0/releases", self.username);
        let v = self
            .get(&path, &[("per_page", "1".into()), ("page", "1".into())])
            .await?;
        let total = v
            .get("pagination")
            .and_then(|p| p.get("items"))
            .and_then(|i| i.as_i64())
            .unwrap_or(0);
        Ok(format!("authenticated as {} ({total} items)", self.username))
    }

    /// Fetch full release details by Discogs release ID.
    pub async fn get_release(&self, release_id: &str) -> ServiceResult<Value> {
        self.get(&format!("/releases/{release_id}"), &[]).await
    }

    /// Fetch artist details by Discogs artist ID.
    pub async fn get_artist(&self, artist_id: &str) -> ServiceResult<Value> {
        self.get(&format!("/artists/{artist_id}"), &[]).await
    }

    /// Search releases by free-text query.
    pub async fn search_release(&self, query: &str) -> ServiceResult<Value> {
        self.get(
            "/database/search",
            &[("q", query.to_string()), ("type", "release".into()), ("per_page", "10".into())],
        )
        .await
    }

    /// Search artists by name.
    pub async fn search_artist(&self, name: &str, limit: u32) -> ServiceResult<Value> {
        self.get(
            "/database/search",
            &[
                ("q", name.to_string()),
                ("type", "artist".into()),
                ("per_page", limit.min(100).to_string()),
            ],
        )
        .await
    }

    /// Extract YouTube/video URIs from a release payload (`videos[].uri`).
    pub fn extract_video_uris(release: &Value) -> Vec<String> {
        release
            .get("videos")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|vid| vid.get("uri").and_then(|u| u.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }
}
