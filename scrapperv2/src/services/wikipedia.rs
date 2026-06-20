//! Wikipedia client — no auth, just a User-Agent. Uses the Action API and REST summary.

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

#[derive(Clone)]
pub struct WikipediaService {
    client: reqwest::Client,
    action_api: String,
    rest_api: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl WikipediaService {
    pub fn new(cfg: &Config) -> Self {
        let lang = if cfg.wikipedia.language.is_empty() { "en".to_string() } else { cfg.wikipedia.language.clone() };
        Self {
            client: build_client(&cfg.wikipedia.user_agent),
            action_api: format!("https://{lang}.wikipedia.org/w/api.php"),
            rest_api: format!("https://{lang}.wikipedia.org/api/rest_v1"),
            limiter: Limiter::per_minute(120),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        true
    }

    async fn get(&self, url: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self.client.get(url).query(query).send().await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                404 => Err(ServiceError::NotFound),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("wikipedia status {s}"))),
            }
        })
        .await
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        let v = self.search_pages("test", 1).await?;
        if v.get("query").is_some() {
            Ok("reachable".into())
        } else {
            Err(ServiceError::Unexpected("wikipedia: unexpected response".into()))
        }
    }

    pub async fn search_pages(&self, query: &str, limit: u32) -> ServiceResult<Value> {
        let api = self.action_api.clone();
        self.get(
            &api,
            &[
                ("action", "query".into()),
                ("format", "json".into()),
                ("list", "search".into()),
                ("srsearch", query.to_string()),
                ("srlimit", limit.to_string()),
            ],
        )
        .await
    }

    /// REST summary for a page title (extract, thumbnail, content URLs).
    pub async fn get_page_summary(&self, title: &str) -> ServiceResult<Value> {
        let url = format!("{}/page/summary/{}", self.rest_api, urlencoding::encode(title));
        self.get(&url, &[]).await
    }
}
