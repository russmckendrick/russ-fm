//! Spotify Web API client. Client-credentials OAuth with cached bearer token.

use std::sync::Arc;

use serde_json::Value;
use tokio::sync::Mutex;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const BASE: &str = "https://api.spotify.com/v1";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const USER_AGENT: &str = "MusicCollectionManager/1.0";

struct Token {
    value: String,
    expires_at: i64,
}

#[derive(Clone)]
pub struct SpotifyService {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
    market: String,
    token: Arc<Mutex<Option<Token>>>,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl SpotifyService {
    pub fn new(cfg: &Config) -> Self {
        Self {
            client: build_client(USER_AGENT),
            client_id: cfg.spotify.client_id.clone(),
            client_secret: cfg.spotify.client_secret.clone(),
            market: cfg.spotify.market.clone(),
            token: Arc::new(Mutex::new(None)),
            limiter: Limiter::per_minute(100),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.client_id.is_empty() && !self.client_secret.is_empty()
    }

    async fn bearer(&self) -> ServiceResult<String> {
        let now = chrono::Utc::now().timestamp();
        let mut guard = self.token.lock().await;
        if let Some(t) = guard.as_ref() {
            if t.expires_at > now {
                return Ok(t.value.clone());
            }
        }
        if self.client_id.is_empty() || self.client_secret.is_empty() {
            return Err(ServiceError::Auth("spotify client credentials missing".into()));
        }
        let resp = self
            .client
            .post(TOKEN_URL)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&[("grant_type", "client_credentials")])
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(ServiceError::Auth(format!("spotify token status {}", resp.status())));
        }
        let body: Value = resp.json().await?;
        let access = body
            .get("access_token")
            .and_then(|t| t.as_str())
            .ok_or_else(|| ServiceError::Auth("spotify: no access_token".into()))?
            .to_string();
        let expires_in = body.get("expires_in").and_then(|e| e.as_i64()).unwrap_or(3600);
        *guard = Some(Token { value: access.clone(), expires_at: now + expires_in - 60 });
        Ok(access)
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        let token = self.bearer().await?;
        let url = format!("{BASE}{path}");
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self.client.get(&url).bearer_auth(&token).query(query).send().await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                401 | 403 => Err(ServiceError::Auth("spotify auth failed".into())),
                404 => Err(ServiceError::NotFound),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("spotify status {s}"))),
            }
        })
        .await
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        self.bearer().await?;
        Ok("token acquired".into())
    }

    pub async fn search_release(&self, artist: &str, album: &str) -> ServiceResult<Value> {
        self.get(
            "/search",
            &[
                ("q", format!("{artist} {album}")),
                ("type", "album".into()),
                ("market", self.market.clone()),
                ("limit", "50".into()),
            ],
        )
        .await
    }

    pub async fn get_album(&self, album_id: &str) -> ServiceResult<Value> {
        self.get(&format!("/albums/{album_id}"), &[("market", self.market.clone())]).await
    }

    pub async fn search_artist(&self, name: &str, limit: u32) -> ServiceResult<Value> {
        self.get(
            "/search",
            &[("q", name.to_string()), ("type", "artist".into()), ("limit", limit.min(50).to_string())],
        )
        .await
    }

    pub async fn get_artist(&self, artist_id: &str) -> ServiceResult<Value> {
        self.get(&format!("/artists/{artist_id}"), &[]).await
    }
}
