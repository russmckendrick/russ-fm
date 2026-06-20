//! Apple Music API client. ES256 JWT bearer auth built from the developer `.p8` key.

use std::sync::Arc;

use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::Mutex;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const BASE: &str = "https://api.music.apple.com/v1";
const USER_AGENT: &str = "MusicCollectionManager/1.0";

#[derive(Serialize)]
struct Claims {
    iss: String,
    iat: i64,
    exp: i64,
}

#[derive(Clone)]
pub struct AppleMusicService {
    client: reqwest::Client,
    key_id: String,
    team_id: String,
    private_key_pem: Option<Vec<u8>>,
    storefront: String,
    token: Arc<Mutex<Option<String>>>,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl AppleMusicService {
    pub fn new(cfg: &Config) -> Self {
        let private_key_pem = std::fs::read(cfg.apple_private_key_path()).ok();
        Self {
            client: build_client(USER_AGENT),
            key_id: cfg.apple_music.key_id.clone(),
            team_id: cfg.apple_music.team_id.clone(),
            private_key_pem,
            storefront: cfg.apple_music.storefront.clone(),
            token: Arc::new(Mutex::new(None)),
            limiter: Limiter::per_minute(60),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.key_id.is_empty() && !self.team_id.is_empty() && self.private_key_pem.is_some()
    }

    fn generate_jwt(&self) -> ServiceResult<String> {
        if self.key_id.is_empty() || self.team_id.is_empty() {
            return Err(ServiceError::Auth("apple_music key_id/team_id missing".into()));
        }
        let pem = self
            .private_key_pem
            .as_ref()
            .ok_or_else(|| ServiceError::Auth("apple_music private key not found".into()))?;
        let now = chrono::Utc::now().timestamp();
        let claims = Claims { iss: self.team_id.clone(), iat: now, exp: now + 3600 * 12 };
        let mut header = Header::new(Algorithm::ES256);
        header.kid = Some(self.key_id.clone());
        let key = EncodingKey::from_ec_pem(pem)
            .map_err(|e| ServiceError::Auth(format!("apple_music key parse failed: {e}")))?;
        jsonwebtoken::encode(&header, &claims, &key)
            .map_err(|e| ServiceError::Auth(format!("apple_music jwt encode failed: {e}")))
    }

    async fn bearer(&self) -> ServiceResult<String> {
        let mut guard = self.token.lock().await;
        if let Some(t) = guard.as_ref() {
            return Ok(t.clone());
        }
        let t = self.generate_jwt()?;
        *guard = Some(t.clone());
        Ok(t)
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        let token = self.bearer().await?;
        let url = format!("{BASE}{path}");
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self
                .client
                .get(&url)
                .bearer_auth(&token)
                .query(query)
                .send()
                .await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                401 | 403 => Err(ServiceError::Auth("apple_music auth failed".into())),
                404 => Err(ServiceError::NotFound),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("apple_music status {s}"))),
            }
        })
        .await
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        let path = format!("/catalog/{}/search", self.storefront);
        let v = self
            .get(&path, &[("term", "test".into()), ("types", "albums".into()), ("limit", "1".into())])
            .await?;
        if v.get("results").is_some() {
            Ok(format!("storefront {} ok", self.storefront))
        } else {
            Err(ServiceError::Unexpected("apple_music: no results field".into()))
        }
    }

    pub async fn search_release(&self, artist: &str, album: &str) -> ServiceResult<Value> {
        let path = format!("/catalog/{}/search", self.storefront);
        self.get(
            &path,
            &[("term", format!("{artist} {album}")), ("types", "albums".into()), ("limit", "25".into())],
        )
        .await
    }

    pub async fn get_album(&self, album_id: &str) -> ServiceResult<Value> {
        let path = format!("/catalog/{}/albums/{album_id}", self.storefront);
        self.get(&path, &[("include", "tracks".into())]).await
    }

    pub async fn search_artist(&self, name: &str, limit: u32) -> ServiceResult<Value> {
        let path = format!("/catalog/{}/search", self.storefront);
        self.get(
            &path,
            &[("term", name.to_string()), ("types", "artists".into()), ("limit", limit.min(25).to_string())],
        )
        .await
    }

    pub async fn get_artist(&self, artist_id: &str) -> ServiceResult<Value> {
        let path = format!("/catalog/{}/artists/{artist_id}", self.storefront);
        self.get(&path, &[("include", "albums".into())]).await
    }

    /// Convert an Apple artwork URL template (`{w}x{h}`) into a real URL of `size`×`size`.
    pub fn high_res_artwork(url: &str, size: u32) -> String {
        url.replace("{w}x{h}", &format!("{size}x{size}"))
            .replace("{w}", &size.to_string())
            .replace("{h}", &size.to_string())
    }
}
