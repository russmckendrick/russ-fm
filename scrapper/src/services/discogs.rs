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
        self.get_with(path, query, true).await
    }

    /// Token-less fetch for public catalogue data. Discogs now rejects personal access tokens
    /// on "expensive" requests (search, large/sorted listings) with 401 "Invalid consumer
    /// token. Please register an app", while serving the same URLs anonymously — so public
    /// browsing endpoints must NOT send the Authorization header.
    async fn get_anon(&self, path: &str, query: &[(&str, String)]) -> ServiceResult<Value> {
        self.get_with(path, query, false).await
    }

    async fn get_with(&self, path: &str, query: &[(&str, String)], auth: bool) -> ServiceResult<Value> {
        let url = format!("{BASE}{path}");
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let mut req = self.client.get(&url).query(query);
            if auth {
                req = req.header("Authorization", format!("Discogs token={}", self.token));
            }
            let resp = req.send().await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                // Discogs intermittently answers 401/403 instead of 429 when rate-limiting a
                // burst, so auth-shaped failures are treated as transient (Unexpected retries,
                // Auth would fail fast). A genuinely bad token still errors once retries end.
                401 | 403 => Err(ServiceError::Unexpected(
                    "discogs auth failed (invalid token, or rate-limiting disguised as 401)".into(),
                )),
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

    /// Search masters by artist and release title (boxset member discovery). Anonymous:
    /// `/database/search` 401s on personal access tokens ("Invalid consumer token").
    pub async fn search_masters(&self, artist: &str, title: &str, limit: u32) -> ServiceResult<Value> {
        self.get_anon(
            "/database/search",
            &[
                ("artist", artist.to_string()),
                ("release_title", title.to_string()),
                ("type", "master".into()),
                ("per_page", limit.min(100).to_string()),
            ],
        )
        .await
    }

    /// Fetch a master by ID (used to resolve its `main_release`). Anonymous like the other
    /// public catalogue browsing calls.
    pub async fn get_master(&self, master_id: &str) -> ServiceResult<Value> {
        self.get_anon(&format!("/masters/{master_id}"), &[]).await
    }

    /// All "Main"-role masters credited to an artist, oldest first. Anonymous and unsorted on
    /// the wire (both auth and `sort` params trip Discogs's registered-app gate); sorted here.
    pub async fn artist_masters(&self, artist_id: &str) -> ServiceResult<Vec<Value>> {
        let mut out = Vec::new();
        let mut page = 1u32;
        loop {
            let v = self
                .get_anon(
                    &format!("/artists/{artist_id}/releases"),
                    &[("per_page", "100".into()), ("page", page.to_string())],
                )
                .await?;
            if let Some(rows) = v.get("releases").and_then(|r| r.as_array()) {
                out.extend(
                    rows.iter()
                        .filter(|r| {
                            r.get("type").and_then(|t| t.as_str()) == Some("master")
                                && r.get("role").and_then(|x| x.as_str()) == Some("Main")
                        })
                        .cloned(),
                );
            }
            let pages = v
                .get("pagination")
                .and_then(|p| p.get("pages"))
                .and_then(|p| p.as_u64())
                .unwrap_or(1);
            // 10 pages ≈ 1000 rows — far beyond any single artist a boxset would credit.
            if u64::from(page) >= pages || page >= 10 {
                break;
            }
            page += 1;
        }
        out.sort_by_key(|r| r.get("year").and_then(|y| y.as_i64()).unwrap_or(i64::MAX));
        Ok(out)
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

    /// Fetch the user's full collection (folder 0), paginated, newest first. Returns the raw
    /// release entries (each has top-level `id` = release id, `instance_id`, `date_added`, etc.).
    pub async fn get_user_collection(&self, username: &str) -> ServiceResult<Vec<Value>> {
        let mut out = Vec::new();
        let mut page = 1u32;
        loop {
            let path = format!("/users/{username}/collection/folders/0/releases");
            let v = self
                .get(
                    &path,
                    &[
                        ("page", page.to_string()),
                        ("per_page", "100".into()),
                        ("sort", "added".into()),
                        ("sort_order", "desc".into()),
                    ],
                )
                .await?;
            if let Some(arr) = v.get("releases").and_then(|r| r.as_array()) {
                out.extend(arr.iter().cloned());
            }
            let pages = v
                .get("pagination")
                .and_then(|p| p.get("pages"))
                .and_then(|p| p.as_u64())
                .unwrap_or(1) as u32;
            if page >= pages {
                break;
            }
            page += 1;
        }
        Ok(out)
    }

    /// Look up when a release was added to the user's collection (`date_added`), if present.
    pub async fn collection_date_added(&self, username: &str, release_id: &str) -> Option<String> {
        let path = format!("/users/{username}/collection/releases/{release_id}");
        let v = self.get(&path, &[]).await.ok()?;
        v.get("releases")
            .and_then(|r| r.as_array())
            .and_then(|a| a.first())
            .and_then(|r| r.get("date_added"))
            .and_then(|d| d.as_str())
            .map(String::from)
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
