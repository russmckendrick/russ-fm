//! Perplexity AI client — generates album descriptions and artist biographies.
//!
//! The system prompts and user-prompt assembly are ported verbatim from the Python service;
//! they force the model to always produce output. Output is cleaned the same way.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

const BASE: &str = "https://api.perplexity.ai";

const ALBUM_SYSTEM: &str = "You are a knowledgeable music critic and historian writing for a music collection website. CRITICAL RULES: 1) You MUST always provide a 2-3 paragraph description - NEVER refuse, NEVER ask for clarification, NEVER say you cannot find information. 2) If it's a self-titled album, describe that album. 3) If it's a reissue, describe the original album and mention the reissue. 4) If it's a box set or compilation, describe its contents and significance. 5) If search results are limited, use your knowledge to write a helpful description anyway. Focus on musical style, significance, and reception. Be factual and concise.";

const ARTIST_SYSTEM: &str = "You are a knowledgeable music historian writing artist biographies for a music collection website. CRITICAL RULES: 1) You MUST always provide a 2-3 paragraph biography - NEVER refuse, NEVER ask for clarification, NEVER say you cannot find information. 2) Focus on the correct artist matching the name given - if multiple artists share a name, use genre context to identify the right one. 3) Cover the artist's background, musical style, key releases, and significance. Be factual and concise. 4) Output ONLY the biography paragraphs, nothing else.";

#[derive(Clone)]
pub struct PerplexityService {
    client: reqwest::Client,
    api_key: String,
    model: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl PerplexityService {
    pub fn new(cfg: &Config) -> Self {
        Self {
            client: build_client("MusicCollectionManager/1.0"),
            api_key: cfg.perplexity.api_key.clone(),
            model: if cfg.perplexity.model.is_empty() { "sonar".into() } else { cfg.perplexity.model.clone() },
            limiter: Limiter::per_minute(cfg.perplexity.rate_limit.max(1)),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }

    async fn chat(&self, system: &str, user: &str, max_tokens: u32) -> ServiceResult<String> {
        if self.api_key.is_empty() {
            return Err(ServiceError::Auth("perplexity api_key missing".into()));
        }
        let body = json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.3,
        });
        let url = format!("{BASE}/chat/completions");
        let content = with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self
                .client
                .post(&url)
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await?;
            match resp.status().as_u16() {
                200 => {
                    let v: Value = resp.json().await?;
                    v.get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("message"))
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                        .map(|s| s.trim().to_string())
                        .ok_or_else(|| ServiceError::Unexpected("perplexity: no content".into()))
                }
                401 | 403 => Err(ServiceError::Auth("perplexity auth failed".into())),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("perplexity status {s}"))),
            }
        })
        .await?;
        Ok(clean_text(&content))
    }

    pub async fn health_check(&self) -> ServiceResult<String> {
        // The API requires max_tokens >= 16.
        self.chat("You are a helpful assistant.", "Say 'OK' if you can hear me.", 16).await?;
        Ok("api key valid".into())
    }

    /// Generate an album description; returns the stored object
    /// `{description, generated_at, model, source}`.
    pub async fn generate_album_description(
        &self,
        artist: &str,
        album: &str,
        genres: &[String],
        labels: &[String],
        context: Option<&str>,
    ) -> ServiceResult<Value> {
        let mut prompt = format!("Write a 2-3 paragraph description of \"{album}\" by {artist}.");
        if let Some(ctx) = context {
            prompt.push_str(&format!(" Important context: {ctx}."));
        }
        let mut parts = Vec::new();
        if !genres.is_empty() {
            parts.push(format!("genres: {}", genres.iter().take(3).cloned().collect::<Vec<_>>().join(", ")));
        }
        if !labels.is_empty() {
            parts.push(format!("label: {}", labels.iter().take(2).cloned().collect::<Vec<_>>().join(", ")));
        }
        if !parts.is_empty() {
            prompt.push_str(&format!(" Context: {}.", parts.join("; ")));
        }
        prompt.push_str(" Write the description NOW. Do not ask questions or request clarification. If this is a self-titled album, describe that album. If it's a reissue or remaster, describe the original album. If it's a box set or compilation, describe its contents. Output ONLY the 2-3 paragraph description, nothing else.");

        let description = self.chat(ALBUM_SYSTEM, &prompt, 500).await?;
        Ok(json!({
            "description": description,
            "generated_at": crate::util::now_iso(),
            "model": self.model,
            "source": "perplexity",
        }))
    }

    /// Generate an artist biography; returns `{biography, generated_at, model, source}`.
    pub async fn generate_artist_biography(
        &self,
        artist: &str,
        genres: &[String],
        context: Option<&str>,
    ) -> ServiceResult<Value> {
        let mut prompt = format!("Write a 2-3 paragraph biography of the music artist \"{artist}\".");
        if let Some(ctx) = context {
            prompt.push_str(&format!(" Important context to identify the correct artist: {ctx}."));
        }
        if !genres.is_empty() {
            prompt.push_str(&format!(
                " This artist performs in the following genres: {}.",
                genres.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
            ));
        }
        prompt.push_str(" Write the biography NOW. Do not ask questions or request clarification. Output ONLY the 2-3 paragraph biography, nothing else.");

        let biography = self.chat(ARTIST_SYSTEM, &prompt, 600).await?;
        Ok(json!({
            "biography": biography,
            "generated_at": crate::util::now_iso(),
            "model": self.model,
            "source": "perplexity",
        }))
    }
}

/// Clean model output: strip citation brackets, markdown emphasis, edge quotes; normalize
/// paragraphs to double-newline separation.
fn clean_text(text: &str) -> String {
    static CITES: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[\d+\]").unwrap());
    static WS: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ \t]+").unwrap());
    let mut s = CITES.replace_all(text, "").to_string();
    s = s.replace("**", "").replace('*', "");
    s = s.trim_matches(|c| c == '"' || c == '\'').to_string();
    // Collapse runs of spaces/tabs but keep newlines.
    s = WS.replace_all(&s, " ").to_string();
    let paragraphs: Vec<String> = s
        .split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();
    paragraphs.join("\n\n")
}
