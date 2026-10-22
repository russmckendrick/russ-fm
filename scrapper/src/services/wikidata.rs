//! Wikidata client — no auth. One SPARQL query maps Discogs artist IDs (property P1953) to their
//! Wikidata item, MusicBrainz artist ID (P434) and Wikipedia article title, so an artist's other
//! pages are found by ID rather than by guessing from the name.

use std::collections::HashMap;

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

/// Wikidata asks for a descriptive User-Agent with a way to get in touch.
pub const USER_AGENT: &str = "russ-fm-scrapper/1.0 (https://russ.fm)";

const SPARQL: &str = "https://query.wikidata.org/sparql";

/// IDs per query: keeps the URL-encoded body small and each query well under the timeout.
const CHUNK: usize = 200;

/// What Wikidata says about the artist behind one Discogs artist ID.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct WikidataArtist {
    /// The item ID, e.g. `Q714`.
    pub qid: String,
    /// Every MusicBrainz artist ID on the item. Usually one; an item with several (aliases,
    /// unmerged duplicates) doesn't say which belongs to this Discogs ID.
    pub mbids: Vec<String>,
    /// The article title on the configured Wikipedia, when there is one.
    pub wikipedia_title: Option<String>,
}

#[derive(Clone)]
pub struct WikidataService {
    client: reqwest::Client,
    wiki: String,
    limiter: Limiter,
    retries: u32,
    retry_delay: std::time::Duration,
}

impl WikidataService {
    pub fn new(cfg: &Config) -> Self {
        let lang = if cfg.wikipedia.language.is_empty() { "en" } else { cfg.wikipedia.language.as_str() };
        Self {
            client: build_client(USER_AGENT),
            wiki: format!("https://{lang}.wikipedia.org/"),
            limiter: Limiter::per_minute(30),
            retries: cfg.processing.retry_attempts,
            retry_delay: std::time::Duration::from_secs(cfg.processing.retry_delay),
        }
    }

    async fn sparql(&self, query: &str) -> ServiceResult<Value> {
        with_retry(self.retries, self.retry_delay, || async {
            self.limiter.acquire().await;
            let resp = self
                .client
                .post(SPARQL)
                .header("Accept", "application/sparql-results+json")
                .form(&[("query", query)])
                .send()
                .await?;
            match resp.status().as_u16() {
                200 => Ok(resp.json::<Value>().await?),
                429 => Err(ServiceError::RateLimited),
                s => Err(ServiceError::Unexpected(format!("wikidata status {s}"))),
            }
        })
        .await
    }

    /// The Wikidata artist for each Discogs artist ID that has one. IDs Wikidata doesn't know are
    /// left out, as is an ID claimed by more than one item (Wikidata can't say which is right).
    pub async fn artists_by_discogs(&self, discogs_ids: &[String]) -> ServiceResult<HashMap<String, WikidataArtist>> {
        let ids: Vec<&str> = discogs_ids.iter().map(|s| s.trim()).filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())).collect();
        let mut out = HashMap::new();
        for chunk in ids.chunks(CHUNK) {
            let values = chunk.iter().map(|id| format!("\"{id}\"")).collect::<Vec<_>>().join(" ");
            let query = format!(
                "SELECT ?d ?item ?mbid ?title WHERE {{ VALUES ?d {{ {values} }} ?item wdt:P1953 ?d . \
                 OPTIONAL {{ ?item wdt:P434 ?mbid }} \
                 OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <{}> ; schema:name ?title }} }}",
                self.wiki
            );
            let v = self.sparql(&query).await?;
            out.extend(parse_bindings(&v));
        }
        Ok(out)
    }
}

/// Fold SPARQL rows (one per item × MBID) into one artist per Discogs ID.
fn parse_bindings(v: &Value) -> HashMap<String, WikidataArtist> {
    let field = |row: &Value, key: &str| row.get(key).and_then(|f| f.get("value")).and_then(|s| s.as_str()).map(String::from);
    let mut found: HashMap<String, Vec<WikidataArtist>> = HashMap::new();
    for row in v.pointer("/results/bindings").and_then(|b| b.as_array()).into_iter().flatten() {
        let (Some(d), Some(item)) = (field(row, "d"), field(row, "item")) else { continue };
        let qid = item.rsplit('/').next().unwrap_or(&item).to_string();
        let items = found.entry(d).or_default();
        let entry = match items.iter_mut().position(|a| a.qid == qid) {
            Some(i) => &mut items[i],
            None => {
                items.push(WikidataArtist { qid, ..Default::default() });
                items.last_mut().expect("just pushed")
            }
        };
        if let Some(m) = field(row, "mbid") {
            if !entry.mbids.contains(&m) {
                entry.mbids.push(m);
            }
        }
        if entry.wikipedia_title.is_none() {
            entry.wikipedia_title = field(row, "title");
        }
    }
    found.into_iter().filter_map(|(d, mut items)| (items.len() == 1).then(|| (d, items.remove(0)))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn row(d: &str, q: &str, mbid: Option<&str>, title: Option<&str>) -> Value {
        let mut r = json!({ "d": { "value": d }, "item": { "value": format!("http://www.wikidata.org/entity/{q}") } });
        if let Some(m) = mbid {
            r["mbid"] = json!({ "value": m });
        }
        if let Some(t) = title {
            r["title"] = json!({ "value": t });
        }
        r
    }

    #[test]
    fn rows_fold_into_one_artist_per_discogs_id() {
        let v = json!({ "results": { "bindings": [
            row("18956", "Q714", Some("1ee18fb3"), Some("Stevie Wonder")),
            row("45", "Q223161", Some("a"), Some("Aphex Twin")),
            row("45", "Q223161", Some("b"), Some("Aphex Twin")),
            row("7", "Q1", None, None),
            row("9", "Q2", None, Some("One")),
            row("9", "Q3", None, Some("Other")),
        ] } });
        let got = parse_bindings(&v);
        assert_eq!(got["18956"], WikidataArtist { qid: "Q714".into(), mbids: vec!["1ee18fb3".into()], wikipedia_title: Some("Stevie Wonder".into()) });
        assert_eq!(got["45"].mbids, ["a", "b"]);
        assert_eq!(got["7"], WikidataArtist { qid: "Q1".into(), mbids: vec![], wikipedia_title: None });
        // Two items claim the same Discogs ID: neither is trusted.
        assert!(!got.contains_key("9"));
    }
}
