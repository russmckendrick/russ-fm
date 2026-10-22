//! MusicBrainz client — no auth, one request a second. Used to find the MusicBrainz artist linked
//! to a Discogs artist page when Wikidata doesn't know it (or knows several).

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use super::wikidata::USER_AGENT;
use crate::config::Config;

const BASE: &str = "https://musicbrainz.org/ws/2";

#[derive(Clone)]
pub struct MusicBrainzService {
    client: reqwest::Client,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl MusicBrainzService {
    pub fn new(cfg: &Config) -> Self {
        Self {
            client: build_client(USER_AGENT),
            // MusicBrainz allows one request a second per client; stay just under it.
            limiter: Limiter::per_minute(50),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        let url = format!("{BASE}/{path}");
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self.client.get(&url).query(query).header("Accept", "application/json").send().await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                404 => Err(ServiceError::NotFound),
                429 | 503 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("musicbrainz status {s}"))),
            }
        })
        .await
    }

    /// The MusicBrainz artist ID linked to a Discogs artist page, when exactly one artist is.
    pub async fn artist_for_discogs(&self, discogs_id: &str) -> ServiceResult<Option<String>> {
        let resource = format!("https://www.discogs.com/artist/{}", discogs_id.trim());
        let v = match self.get("url", &[("resource", resource), ("inc", "artist-rels".into())]).await {
            Ok(v) => v,
            Err(ServiceError::NotFound) => return Ok(None),
            Err(e) => return Err(e),
        };
        Ok(single_artist(&v))
    }
}

/// The one artist a URL lookup is related to (None for none or several).
fn single_artist(v: &Value) -> Option<String> {
    let mut ids: Vec<&str> = v
        .get("relations")
        .and_then(|r| r.as_array())
        .into_iter()
        .flatten()
        .filter_map(|r| r.pointer("/artist/id").and_then(|i| i.as_str()))
        .collect();
    ids.dedup();
    match ids.as_slice() {
        [id] => Some(id.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_a_single_related_artist_counts() {
        let one = json!({ "relations": [{ "artist": { "id": "1ee18fb3", "name": "Stevie Wonder" } }] });
        let two = json!({ "relations": [{ "artist": { "id": "a" } }, { "artist": { "id": "b" } }] });
        assert_eq!(single_artist(&one).as_deref(), Some("1ee18fb3"));
        assert_eq!(single_artist(&two), None);
        assert_eq!(single_artist(&json!({})), None);
    }
}
