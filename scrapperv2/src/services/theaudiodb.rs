//! TheAudioDB client. API token embedded in the URL path.

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const USER_AGENT: &str = "MusicCollectionManager/1.0";

#[derive(Clone)]
pub struct TheAudioDbService {
    client: reqwest::Client,
    base: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl TheAudioDbService {
    pub fn new(cfg: &Config) -> Self {
        let mut base = cfg.theaudiodb.base_url.clone();
        if !base.ends_with('/') {
            base.push('/');
        }
        let token = if cfg.theaudiodb.api_token.is_empty() { "2".to_string() } else { cfg.theaudiodb.api_token.clone() };
        Self {
            client: build_client(USER_AGENT),
            base: format!("{base}{token}/"),
            limiter: Limiter::per_minute(30),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        true
    }

    async fn get(&self, endpoint: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        let url = format!("{}{endpoint}", self.base);
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self.client.get(&url).query(query).send().await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("theaudiodb status {s}"))),
            }
        })
        .await
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        let v = self.get("search.php", &[("s", "coldplay".into())]).await?;
        if v.get("artists").is_some() {
            Ok("reachable".into())
        } else {
            Err(ServiceError::Unexpected("theaudiodb: no artists field".into()))
        }
    }

    pub async fn search_artist(&self, name: &str) -> ServiceResult<Value> {
        self.get("search.php", &[("s", name.to_string())]).await
    }

    pub async fn get_artist_by_id(&self, artist_id: &str) -> ServiceResult<Value> {
        self.get("artist.php", &[("i", artist_id.to_string())]).await
    }

    pub async fn get_artist_by_mbid(&self, mbid: &str) -> ServiceResult<Value> {
        self.get("artist-mb.php", &[("i", mbid.to_string())]).await
    }

    pub async fn get_artist_albums(&self, artist_id: &str) -> ServiceResult<Value> {
        self.get("album.php", &[("i", artist_id.to_string())]).await
    }
}
