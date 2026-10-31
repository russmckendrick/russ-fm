//! Artist identity: the Wikidata item, MusicBrainz ID and Wikipedia article behind a Discogs
//! artist ID, so Wikipedia, TheAudioDB and Last.fm are matched by ID instead of by name.
//!
//! Name lookups go wrong for common names and for artists who share a name or a page with
//! someone else: "Stevie Wonder" on TheAudioDB returned The Supremes, the Wikipedia page titled
//! "Santana" is a disambiguation page. Wikidata maps a Discogs artist ID (P1953) straight to the
//! MusicBrainz ID (P434) and the Wikipedia article; MusicBrainz fills in the MBID when Wikidata
//! has none or several. The result is stored as `raw_data.identity` on the artist row.
//!
//! `backfill-identities` resolves every stored artist and repairs what a name match got wrong.

use std::collections::HashMap;

use anyhow::Result;
use serde_json::{json, Map, Value};

use crate::cli::BackfillIdentitiesArgs;
use crate::db::{ArtistRecord, Db};
use crate::ops::service_input;
use crate::services::http::ServiceResult;
use crate::services::theaudiodb::TheAudioDbService;
use crate::services::Services;
use crate::util::now_iso;
use crate::Config;

/// The `raw_data` key the identity is stored under.
pub const RAW_KEY: &str = "identity";

/// Where an artist's other pages are, found from its Discogs ID. Every field may be missing:
/// a stored identity with none set means "looked up, nothing known", so it isn't retried.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ArtistIdentity {
    pub wikidata_id: Option<String>,
    pub musicbrainz_id: Option<String>,
    pub wikipedia_title: Option<String>,
}

impl ArtistIdentity {
    /// The identity stored in an artist's `raw_data`.
    pub fn from_raw(raw: &Value) -> Option<Self> {
        Self::from_value(raw.get(RAW_KEY)?)
    }

    /// An identity from its stored `raw_data.identity` object.
    pub fn from_value(v: &Value) -> Option<Self> {
        let v = v.as_object()?;
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).filter(|s| !s.is_empty()).map(String::from);
        Some(Self { wikidata_id: s("wikidata_id"), musicbrainz_id: s("musicbrainz_id"), wikipedia_title: s("wikipedia_title") })
    }

    pub fn to_value(&self) -> Value {
        json!({
            "wikidata_id": self.wikidata_id,
            "musicbrainz_id": self.musicbrainz_id,
            "wikipedia_title": self.wikipedia_title,
            "resolved_at": now_iso(),
        })
    }
}

/// Resolve one Discogs artist ID. An error means a service failed (try again later), not that
/// the artist is unknown.
pub async fn resolve(services: &Services, discogs_id: &str) -> ServiceResult<ArtistIdentity> {
    let ids = [discogs_id.to_string()];
    let mut found = resolve_many(services, &ids).await?;
    Ok(found.remove(discogs_id).unwrap_or_default())
}

/// Resolve many Discogs artist IDs: one Wikidata query per 200, then MusicBrainz (one a second)
/// for each ID whose MBID Wikidata didn't settle. An ID whose MusicBrainz lookup failed is left
/// out, so it is retried rather than stored without its MBID.
pub async fn resolve_many(services: &Services, discogs_ids: &[String]) -> ServiceResult<HashMap<String, ArtistIdentity>> {
    let wikidata = services.wikidata.artists_by_discogs(discogs_ids).await?;
    let mut out = HashMap::new();
    for id in discogs_ids {
        let wd = wikidata.get(id);
        let mut identity = ArtistIdentity {
            wikidata_id: wd.map(|w| w.qid.clone()),
            musicbrainz_id: wd.and_then(|w| match w.mbids.as_slice() {
                [one] => Some(one.clone()),
                _ => None,
            }),
            wikipedia_title: wd.and_then(|w| w.wikipedia_title.clone()),
        };
        if identity.musicbrainz_id.is_none() {
            match services.musicbrainz.artist_for_discogs(id).await {
                Ok(mbid) => identity.musicbrainz_id = mbid,
                Err(e) => {
                    tracing::warn!("musicbrainz lookup for discogs artist {id} failed: {e}");
                    continue;
                }
            }
        }
        out.insert(id.clone(), identity);
    }
    Ok(out)
}

/// An artist name reduced for comparison: lower case, accents folded, "&" read as "and", a
/// leading "The" and all punctuation dropped. "Siouxsie & The Banshees" and "Siouxsie and the
/// Banshees" compare equal; "Stevie Wonder" and "The Supremes" don't.
fn name_key(name: &str) -> String {
    let folded: String = name
        .to_lowercase()
        .replace('&', " and ")
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ø' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            'ý' | 'ÿ' => 'y',
            c => c,
        })
        .collect();
    let words: Vec<&str> = folded.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect();
    let words = match words.as_slice() {
        ["the", rest @ ..] if !rest.is_empty() => rest,
        all => all,
    };
    words.concat()
}

pub fn names_match(a: &str, b: &str) -> bool {
    let (a, b) = (name_key(a), name_key(b));
    !a.is_empty() && a == b
}

/// A stored TheAudioDB artist's name and MusicBrainz ID, in either the Rust (`strArtist`) or the
/// old Python (`name`) shape.
fn theaudiodb_name_and_mbid(stored: &Value) -> (Option<&str>, Option<&str>) {
    let s = |keys: &[&str]| keys.iter().find_map(|k| stored.get(*k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()));
    (s(&["strArtist", "name"]), s(&["strMusicBrainzID", "musicbrainz_id"]))
}

/// Whether a TheAudioDB artist is this artist: the MusicBrainz IDs agree when both are known
/// (TheAudioDB may list a renamed artist under another name: Cat Stevens is "Yusuf Islam"),
/// otherwise the names match.
pub fn theaudiodb_fits(stored: &Value, name: &str, mbid: Option<&str>) -> bool {
    match theaudiodb_name_and_mbid(stored) {
        (_, Some(theirs)) if mbid.is_some() => mbid.is_some_and(|m| m.eq_ignore_ascii_case(theirs)),
        (Some(theirs), _) => names_match(theirs, name),
        _ => false,
    }
}

/// A stored TheAudioDB artist's English biography, in either shape.
pub fn theaudiodb_biography(stored: &Value) -> Option<&str> {
    ["strBiographyEN", "biography_en"].iter().find_map(|k| stored.get(*k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()))
}

/// The page title of a Wikipedia URL (or title), for comparing two links to the same page.
fn wiki_title_key(url_or_title: &str) -> Option<String> {
    service_input::wikipedia_title(url_or_title).map(|t| t.trim().to_lowercase())
}

// ── backfill-identities ──────────────────────────────────────────────────────

/// What a resolved identity says is wrong with a stored artist, worked out without any requests.
#[derive(Debug, Default, PartialEq)]
struct Plan {
    /// The stored TheAudioDB artist is someone else.
    theaudiodb_wrong: bool,
    /// The Wikipedia link to set: `Some(None)` clears it, `None` leaves it.
    wikipedia_url: Option<Option<String>>,
    /// The MusicBrainz ID to store as `lastfm_mbid`.
    mbid: Option<String>,
    /// The biography came from a source now known to be wrong (or is empty), so re-derive it.
    rebuild_bio: bool,
}

impl Plan {
    fn is_empty(&self) -> bool {
        *self == Plan::default()
    }
}

fn plan(services: &Services, rec: &ArtistRecord, identity: &ArtistIdentity) -> Plan {
    let raw = &rec.raw_data;
    let mut p = Plan::default();
    // An all-null object is the old "not on TheAudioDB" placeholder, not a match.
    let tadb = raw.get("theaudiodb").filter(|t| theaudiodb_name_and_mbid(t) != (None, None));
    p.theaudiodb_wrong = tadb.is_some_and(|t| !theaudiodb_fits(t, &rec.name, identity.musicbrainz_id.as_deref()));

    // Only a Wikidata match can say an artist has no article; without one, leave the link.
    let mut wiki_wrong = false;
    if identity.wikidata_id.is_some() {
        let want = identity.wikipedia_title.as_deref().map(|t| services.wikipedia.page_url(t));
        let have = rec.wikipedia_url.as_deref();
        if have.and_then(wiki_title_key) != identity.wikipedia_title.as_deref().and_then(wiki_title_key) {
            wiki_wrong = have.is_some();
            p.wikipedia_url = Some(want);
        }
    }

    if let Some(m) = &identity.musicbrainz_id {
        if rec.lastfm_mbid.as_deref() != Some(m.as_str()) {
            p.mbid = Some(m.clone());
        }
    }

    let bio = rec.biography.as_deref().map(str::trim).unwrap_or("");
    let same = |other: Option<&str>| other.is_some_and(|o| o.trim() == bio);
    let from_perplexity = same(raw.pointer("/perplexity/biography").and_then(|b| b.as_str()));
    let from_lastfm = same(raw.pointer("/lastfm/bio_content").and_then(|b| b.as_str()));
    let from_tadb = same(tadb.and_then(theaudiodb_biography));
    p.rebuild_bio = (bio.is_empty() && identity.wikipedia_title.is_some())
        || (from_tadb && p.theaudiodb_wrong)
        // Neither Perplexity, Last.fm nor TheAudioDB: the text came from the old Wikipedia link.
        || (wiki_wrong && !from_perplexity && !from_lastfm && !from_tadb);
    p
}

/// Apply a plan: re-match TheAudioDB (and its music videos), fetch the Wikipedia summary and
/// re-derive the biography as needed. Returns a short description of each change.
async fn apply(services: &Services, rec: &mut ArtistRecord, identity: &ArtistIdentity, p: &Plan) -> Vec<String> {
    let mut changes = Vec::new();
    let mut raw: Map<String, Value> = rec.raw_data.as_object().cloned().unwrap_or_default();
    let mbid = identity.musicbrainz_id.as_deref();

    if p.theaudiodb_wrong {
        let old = raw.get("theaudiodb").and_then(|t| theaudiodb_name_and_mbid(t).0.map(String::from)).unwrap_or_default();
        match crate::ops::artist::enrich_theaudiodb(services, &rec.name, mbid).await {
            Some(t) => {
                let new = theaudiodb_name_and_mbid(&t).0.unwrap_or("?").to_string();
                match TheAudioDbService::artist_id_of(&t) {
                    Some(id) => match crate::ops::videos::theaudiodb_videos(services, &id).await {
                        Ok(v) => {
                            raw.insert("theaudiodb_videos".into(), v);
                        }
                        Err(_) => {
                            raw.remove("theaudiodb_videos");
                        }
                    },
                    None => {
                        raw.remove("theaudiodb_videos");
                    }
                }
                raw.insert("theaudiodb".into(), t);
                changes.push(format!("TheAudioDB {old} → {new}"));
            }
            None => {
                raw.remove("theaudiodb");
                raw.remove("theaudiodb_videos");
                changes.push(format!("TheAudioDB {old} dropped"));
            }
        }
    }

    let mut wiki_url = rec.wikipedia_url.clone();
    if let Some(url) = &p.wikipedia_url {
        wiki_url = url.clone();
        changes.push(match url {
            Some(u) => format!("Wikipedia → {u}"),
            None => "Wikipedia link cleared (no article)".into(),
        });
    }

    if p.rebuild_bio {
        let wiki = match identity.wikipedia_title.as_deref() {
            Some(t) => crate::ops::artist::wikipedia_summary(services, t).await,
            None => None,
        };
        if let Some(u) = wiki.as_ref().and_then(|w| w.get("url")).and_then(|v| v.as_str()) {
            wiki_url = Some(u.to_string());
        }
        let bio = crate::ops::artist::derive_biography(wiki.as_ref(), raw.get("lastfm"), raw.get("theaudiodb"));
        if bio.as_deref().map(str::trim) != rec.biography.as_deref().map(str::trim) {
            let source = if wiki.is_some() { "Wikipedia" } else if bio.is_some() { "Last.fm/TheAudioDB" } else { "none" };
            changes.push(format!("biography from {source}"));
            rec.biography = bio;
        }
    }
    rec.wikipedia_url = wiki_url;

    if let Some(m) = &p.mbid {
        changes.push(format!("MBID {} → {m}", rec.lastfm_mbid.as_deref().unwrap_or("none")));
        rec.lastfm_mbid = Some(m.clone());
    }

    raw.insert(RAW_KEY.into(), identity.to_value());
    rec.raw_data = Value::Object(raw);
    changes
}

pub async fn run(cfg: &Config, args: BackfillIdentitiesArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let services = Services::new(cfg);

    let mut artists: Vec<ArtistRecord> = Vec::new();
    for s in db.list_artists(u32::MAX, "name")? {
        // Wikidata knows Discogs 194 as the "Various artists" concept, not a performer.
        if s.discogs_id.as_deref().is_none_or(str::is_empty) || super::is_various(&s.name) {
            continue;
        }
        if args.artist.as_deref().is_some_and(|a| !s.name.eq_ignore_ascii_case(a)) {
            continue;
        }
        if let Some(rec) = db.get_artist_by_id(&s.id)? {
            artists.push(rec);
        }
    }

    let stored = |r: &ArtistRecord| if args.force { None } else { ArtistIdentity::from_raw(&r.raw_data) };
    let mut to_resolve: Vec<String> =
        artists.iter().filter(|r| stored(r).is_none()).filter_map(|r| r.discogs_id.clone()).collect();
    to_resolve.dedup();
    if let Some(l) = args.limit {
        to_resolve.truncate(l as usize);
    }
    crate::say!(
        "{} artist(s) with a Discogs ID; resolving {} via Wikidata/MusicBrainz{}...",
        artists.len(),
        to_resolve.len(),
        if args.dry_run { " (dry run: nothing is written)" } else { "" }
    );
    let resolved = resolve_many(&services, &to_resolve).await?;
    crate::say!("Resolved {} of {}.", resolved.len(), to_resolve.len());

    let (mut changed, mut stored_only, mut unresolved, mut failed) = (0usize, 0usize, 0usize, 0usize);
    // Wikipedia links on artists Wikidata doesn't know: nothing can confirm or correct them.
    let mut unverified: Vec<(&str, &str)> = Vec::new();
    for rec in &artists {
        let discogs_id = rec.discogs_id.as_deref().unwrap_or_default();
        let fresh = resolved.get(discogs_id);
        let Some(identity) = fresh.cloned().or_else(|| stored(rec)) else {
            unresolved += 1;
            continue;
        };
        if identity.wikidata_id.is_none() {
            if let Some(url) = rec.wikipedia_url.as_deref() {
                unverified.push((&rec.name, url));
            }
        }
        let p = plan(&services, rec, &identity);
        if p.is_empty() {
            if fresh.is_some() && !args.dry_run {
                db.set_artist_raw_key(&rec.id, RAW_KEY, identity.to_value())?;
                stored_only += 1;
            }
            continue;
        }
        if args.dry_run {
            let mut what = Vec::new();
            if p.theaudiodb_wrong {
                let (n, m) = rec.raw_data.get("theaudiodb").map(theaudiodb_name_and_mbid).unwrap_or_default();
                what.push(format!("TheAudioDB is someone else ({}, {} vs {})", n.unwrap_or("?"), m.unwrap_or("no MBID"), identity.musicbrainz_id.as_deref().unwrap_or("no MBID")));
            }
            if let Some(u) = &p.wikipedia_url {
                what.push(format!("Wikipedia {} → {}", rec.wikipedia_url.as_deref().unwrap_or("none"), u.as_deref().unwrap_or("none")));
            }
            if p.rebuild_bio {
                what.push("rebuild biography".into());
            }
            if let Some(m) = &p.mbid {
                what.push(format!("MBID → {m}"));
            }
            crate::say!("  {}: {}", rec.name, what.join("; "));
            changed += 1;
            continue;
        }
        let mut updated = rec.clone();
        let changes = apply(&services, &mut updated, &identity, &p).await;
        updated.updated_at = Some(now_iso());
        match crate::ops::artist::persist_artist(cfg, &db, &updated) {
            Ok(_) => {
                crate::say!("✓ {}: {}", rec.name, changes.join("; "));
                changed += 1;
            }
            Err(e) => {
                crate::say!("✗ {}: {e}", rec.name);
                failed += 1;
            }
        }
    }

    if !unverified.is_empty() {
        crate::say!("\nWikipedia links Wikidata can't confirm (check by hand in the TUI):");
        for (name, url) in &unverified {
            crate::say!("  {name}: {url}");
        }
    }
    let verb = if args.dry_run { "would change" } else { "changed" };
    crate::say!(
        "\nDone: {changed} artist(s) {verb}, {stored_only} identity stored with nothing to fix, {unresolved} not resolved (re-run to retry), {failed} failed."
    );
    if changed > 0 && !args.dry_run {
        let n = crate::output::collection::regenerate(cfg, &db)?;
        crate::say!("Regenerated collection.json ({n} entries). Rebuild tv.json if any TheAudioDB match changed.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_match_ignores_spelling_but_not_people() {
        assert!(names_match("Siouxsie & The Banshees", "Siouxsie and the Banshees"));
        assert!(names_match("The Frank And Walters", "The Frank & Walters"));
        assert!(names_match("Emiliana Torrini", "Emilíana Torrini"));
        assert!(names_match("Go-Go's", "The Go-Go's"));
        assert!(names_match("The The", "The The"));
        assert!(!names_match("Stevie Wonder", "The Supremes"));
        assert!(!names_match("Edwin Starr", "Michael Jackson"));
        assert!(!names_match("Mark Lanegan Band", "Mark Lanegan"));
        assert!(!names_match("", ""));
    }

    #[test]
    fn theaudiodb_fits_prefers_the_mbid() {
        let supremes = json!({ "name": "The Supremes", "musicbrainz_id": "c1aa2ec9" });
        assert!(!theaudiodb_fits(&supremes, "Stevie Wonder", Some("1ee18fb3")));
        assert!(!theaudiodb_fits(&supremes, "Stevie Wonder", None));
        let yusuf = json!({ "strArtist": "Yusuf Islam", "strMusicBrainzID": "AAA" });
        assert!(theaudiodb_fits(&yusuf, "Cat Stevens", Some("aaa")));
        let no_mbid = json!({ "strArtist": "Huey Lewis and the News" });
        assert!(theaudiodb_fits(&no_mbid, "Huey Lewis & The News", Some("x")));
    }

    #[test]
    fn an_empty_theaudiodb_placeholder_is_not_a_wrong_match() {
        let services = Services::new(&Config::default());
        let identity = ArtistIdentity { musicbrainz_id: Some("m".into()), ..Default::default() };
        let mut rec = artist("Jo Quail", "Cellist.", None, json!({ "theaudiodb": { "name": null, "musicbrainz_id": null } }));
        rec.lastfm_mbid = Some("m".into());
        assert!(plan(&services, &rec, &identity).is_empty());
    }

    #[test]
    fn identity_round_trips_through_raw_data() {
        let id = ArtistIdentity { wikidata_id: Some("Q714".into()), musicbrainz_id: None, wikipedia_title: Some("Stevie Wonder".into()) };
        let raw = json!({ RAW_KEY: id.to_value() });
        assert_eq!(ArtistIdentity::from_raw(&raw), Some(id));
        assert_eq!(ArtistIdentity::from_raw(&json!({})), None);
    }

    fn artist(name: &str, bio: &str, wiki: Option<&str>, raw: Value) -> ArtistRecord {
        ArtistRecord {
            name: name.into(),
            biography: Some(bio.into()),
            wikipedia_url: wiki.map(String::from),
            raw_data: raw,
            ..Default::default()
        }
    }

    #[test]
    fn plan_fixes_a_wrong_theaudiodb_bio_and_keeps_perplexity() {
        let services = Services::new(&Config::default());
        let identity = ArtistIdentity {
            wikidata_id: Some("Q714".into()),
            musicbrainz_id: Some("1ee18fb3".into()),
            wikipedia_title: Some("Stevie Wonder".into()),
        };
        let supremes = json!({ "theaudiodb": { "name": "The Supremes", "musicbrainz_id": "c1aa2ec9", "biography_en": "The Supremes were…" } });
        let p = plan(&services, &artist("Stevie Wonder", "The Supremes were…", None, supremes), &identity);
        assert!(p.theaudiodb_wrong && p.rebuild_bio);
        assert_eq!(p.wikipedia_url, Some(Some("https://en.wikipedia.org/wiki/Stevie_Wonder".into())));
        assert_eq!(p.mbid.as_deref(), Some("1ee18fb3"));

        // A wrong Wikipedia link with a Perplexity bio: fix the link, keep the bio.
        let raw = json!({ "perplexity": { "biography": "Written by Perplexity." } });
        let rec = artist("Stevie Wonder", "Written by Perplexity.", Some("https://en.wikipedia.org/wiki/The_Supremes"), raw);
        let p = plan(&services, &rec, &identity);
        assert!(p.wikipedia_url.is_some() && !p.rebuild_bio);

        // The same text from the wrong Wikipedia page is rebuilt.
        let rec = artist("Stevie Wonder", "The Supremes were…", Some("https://en.wikipedia.org/wiki/The_Supremes"), json!({}));
        assert!(plan(&services, &rec, &identity).rebuild_bio);
    }

    #[test]
    fn plan_leaves_a_correct_artist_alone() {
        let services = Services::new(&Config::default());
        let identity = ArtistIdentity { wikidata_id: Some("Q873384".into()), musicbrainz_id: Some("m".into()), wikipedia_title: Some("Santana (band)".into()) };
        let mut rec = artist("Santana", "Santana are…", Some("https://en.wikipedia.org/wiki/Santana_(band)"), json!({}));
        rec.lastfm_mbid = Some("m".into());
        assert!(plan(&services, &rec, &identity).is_empty());
        // Without a Wikidata match nothing can be said about the link.
        let unknown = ArtistIdentity { musicbrainz_id: Some("m".into()), ..Default::default() };
        rec.wikipedia_url = Some("https://en.wikipedia.org/wiki/Something_else".into());
        assert!(plan(&services, &rec, &unknown).is_empty());
    }
}
