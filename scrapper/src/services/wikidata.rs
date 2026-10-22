//! Wikidata client — no auth. One SPARQL query maps Discogs artist IDs (property P1953) to their
//! Wikidata item, MusicBrainz artist ID (P434) and Wikipedia article title, so an artist's other
//! pages are found by ID rather than by guessing from the name. Another lists the YouTube videos
//! (P1651) Wikidata records on an artist's songs and singles.

use std::collections::HashMap;

use serde_json::Value;

use super::http::{build_client, with_retry, Limiter, ServiceError, ServiceResult};
use crate::config::Config;

/// Wikidata asks for a descriptive User-Agent with a way to get in touch.
pub const USER_AGENT: &str = "russ-fm-scrapper/1.0 (https://russ.fm)";

const SPARQL: &str = "https://query.wikidata.org/sparql";

/// IDs per query: keeps the URL-encoded body small and each query well under the timeout.
const CHUNK: usize = 200;

/// Artists per music-video query (a prolific artist has hundreds of songs).
const VIDEO_CHUNK: usize = 50;

/// The kinds of item whose YouTube video is the song's video: single, musical work/composition,
/// music track with vocals, song, music video. Albums (full-album uploads), audio tracks and
/// everything else are left out.
const VIDEO_WORK_TYPES: &str = "wd:Q134556 wd:Q105543609 wd:Q55850593 wd:Q7366 wd:Q193977";

/// Album, studio album, live album, compilation album, EP: a song's `part of` (P361) that names
/// its album.
const ALBUM_TYPES: &str = "wd:Q482994 wd:Q208569 wd:Q209939 wd:Q222910 wd:Q169930";

/// A song with more YouTube IDs than this is ambiguous (several songs share an item, or every
/// re-upload was added), so none of them are used.
const MAX_VIDEOS_PER_WORK: usize = 3;

/// A YouTube video Wikidata records on one of an artist's songs.
#[derive(Debug, Clone, PartialEq)]
pub struct WikidataVideo {
    /// The song's item ID.
    pub work: String,
    pub youtube_id: String,
    /// The song's English label.
    pub title: String,
    /// The English label of the album the song is part of, when Wikidata says.
    pub album: Option<String>,
}

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

    /// The music videos on each artist's songs, by artist item ID. Artists with none are left
    /// out. A statement qualified with a role other than "music video" (a trailer) is skipped.
    pub async fn music_videos(&self, qids: &[String]) -> ServiceResult<HashMap<String, Vec<WikidataVideo>>> {
        let qids: Vec<&str> = qids.iter().map(|s| s.trim()).filter(|q| q.len() > 1 && q.starts_with('Q') && q[1..].bytes().all(|b| b.is_ascii_digit())).collect();
        let mut out = HashMap::new();
        for chunk in qids.chunks(VIDEO_CHUNK) {
            let values = chunk.iter().map(|q| format!("wd:{q}")).collect::<Vec<_>>().join(" ");
            let query = format!(
                "SELECT ?artist ?work ?yt ?title ?album WHERE {{ VALUES ?artist {{ {values} }} \
                 ?work wdt:P175 ?artist ; p:P1651 ?st ; wdt:P31 ?type . ?st ps:P1651 ?yt . \
                 VALUES ?type {{ {VIDEO_WORK_TYPES} }} \
                 FILTER NOT EXISTS {{ ?st pq:P3831 ?role FILTER(?role != wd:Q193977) }} \
                 ?work rdfs:label ?title FILTER(lang(?title) = \"en\") \
                 OPTIONAL {{ ?work wdt:P361 ?a . ?a wdt:P31 ?atype . VALUES ?atype {{ {ALBUM_TYPES} }} \
                   ?a rdfs:label ?album FILTER(lang(?album) = \"en\") }} }}"
            );
            let v = self.sparql(&query).await?;
            out.extend(parse_videos(&v));
        }
        Ok(out)
    }
}

/// Fold music-video rows into each artist's videos: one per (song, YouTube ID), the first album
/// seen kept, songs with more than [`MAX_VIDEOS_PER_WORK`] IDs dropped.
fn parse_videos(v: &Value) -> HashMap<String, Vec<WikidataVideo>> {
    let field = |row: &Value, key: &str| row.get(key).and_then(|f| f.get("value")).and_then(|s| s.as_str()).map(String::from);
    let qid = |uri: String| uri.rsplit('/').next().unwrap_or(&uri).to_string();
    let mut out: HashMap<String, Vec<WikidataVideo>> = HashMap::new();
    for row in v.pointer("/results/bindings").and_then(|b| b.as_array()).into_iter().flatten() {
        let (Some(artist), Some(work), Some(yt), Some(title)) = (field(row, "artist"), field(row, "work"), field(row, "yt"), field(row, "title"))
        else {
            continue;
        };
        let (artist, work) = (qid(artist), qid(work));
        let videos = out.entry(artist).or_default();
        match videos.iter_mut().find(|x| x.work == work && x.youtube_id == yt) {
            Some(existing) => {
                if existing.album.is_none() {
                    existing.album = field(row, "album");
                }
            }
            None => videos.push(WikidataVideo { work, youtube_id: yt, title, album: field(row, "album") }),
        }
    }
    for videos in out.values_mut() {
        let mut per_work: HashMap<String, usize> = HashMap::new();
        for v in videos.iter() {
            *per_work.entry(v.work.clone()).or_default() += 1;
        }
        videos.retain(|v| per_work[&v.work] <= MAX_VIDEOS_PER_WORK);
    }
    out.retain(|_, v| !v.is_empty());
    out
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

    fn video_row(artist: &str, work: &str, yt: &str, title: &str, album: Option<&str>) -> Value {
        let e = |q: &str| json!({ "value": format!("http://www.wikidata.org/entity/{q}") });
        let mut r = json!({ "artist": e(artist), "work": e(work), "yt": { "value": yt }, "title": { "value": title } });
        if let Some(a) = album {
            r["album"] = json!({ "value": a });
        }
        r
    }

    #[test]
    fn videos_fold_per_artist_and_drop_ambiguous_songs() {
        let mut rows = vec![
            video_row("Q714", "Q1", "ftdZ363R9kQ", "Superstition", None),
            video_row("Q714", "Q1", "ftdZ363R9kQ", "Superstition", Some("Talking Book")),
            video_row("Q714", "Q2", "aaa", "Master Blaster", None),
            video_row("Q714", "Q2", "bbb", "Master Blaster", None),
        ];
        rows.extend((0..4).map(|i| video_row("Q873384", "Q9", &format!("id{i}"), "Hasta Siempre", None)));
        let got = parse_videos(&json!({ "results": { "bindings": rows } }));
        let stevie = &got["Q714"];
        assert_eq!(stevie.len(), 3);
        assert_eq!(stevie[0].album.as_deref(), Some("Talking Book"));
        assert!(!got.contains_key("Q873384"), "four IDs on one song: none used");
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
