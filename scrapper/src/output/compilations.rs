//! `compilations.json` — who plays on the records credited to "Various", from each track's own
//! artist credit. Written with collection.json; read by the Various Artists page, compilation
//! album pages (to link track artists) and every artist page ("Also appears on").
//!
//! A track artist is linked to an artist page by Discogs ID (through the artists table), or by
//! name when the credit has no ID, and only when that page is published. Track credits never
//! become collection artists (see `ops::release::track_artists`), so most are not linked.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

use super::collection::release_identity;
use crate::db::{ArtistSummary, ReleaseRecord};
use crate::sanitize::sanitize_folder_name;
use crate::Config;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct CompilationsFile {
    /// Per compilation (`uri_release`): how many artists are credited on its tracks, and the
    /// artist page of each one that has a page, by the name the track credits.
    pub releases: BTreeMap<String, CompilationRelease>,
    /// Per artist page (`uri_artist`): the compilations they play on.
    pub artists: BTreeMap<String, ArtistAppearances>,
    /// The most credited artists without a page, most compilations first ([`OTHERS_KEPT`]).
    pub others: Vec<OtherArtist>,
    /// How many credited artists have no page.
    pub others_count: usize,
}

/// How many artists without a page are listed by name.
pub const OTHERS_KEPT: usize = 60;

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct CompilationRelease {
    pub artists: usize,
    pub links: BTreeMap<String, String>,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct ArtistAppearances {
    pub name: String,
    pub on: Vec<Appearance>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Appearance {
    pub release: String,
    /// Their tracks on it, in tracklist order.
    pub tracks: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct OtherArtist {
    pub name: String,
    pub releases: usize,
}

/// One per-track artist credit.
struct TrackCredit {
    name: String,
    discogs_id: Option<String>,
    track: String,
}

fn str_of(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Discogs' stand-ins for a missing credit, not artists.
fn is_placeholder(name: &str) -> bool {
    crate::ops::is_various(name) || name.eq_ignore_ascii_case("no artist") || name.eq_ignore_ascii_case("unknown artist")
}

/// Every per-track artist credit, in tracklist order (movements included).
fn track_credits(tracklist: &Value) -> Vec<TrackCredit> {
    let mut out = Vec::new();
    for t in tracklist.as_array().into_iter().flatten() {
        let track = str_of(t, "title").unwrap_or_default();
        for a in t.get("artists").and_then(Value::as_array).into_iter().flatten() {
            let Some(name) = str_of(a, "name").filter(|n| !is_placeholder(n)) else { continue };
            out.push(TrackCredit { name, discogs_id: str_of(a, "discogs_id").or_else(|| str_of(a, "id")), track: track.clone() });
        }
    }
    out
}

/// Build the file from every release; `page_for` resolves a credit to a published artist page.
pub fn build(cfg: &Config, releases: &[ReleaseRecord], page_for: &dyn Fn(&str, Option<&str>) -> Option<String>) -> CompilationsFile {
    let mut file = CompilationsFile::default();
    let mut others: HashMap<String, usize> = HashMap::new();
    for rec in releases {
        let Some(identity) = release_identity(cfg, rec) else { continue };
        if !identity.names.iter().any(|n| crate::ops::is_various(n)) {
            continue;
        }
        let credits = track_credits(&rec.tracklist);
        if credits.is_empty() {
            continue;
        }
        let mut release = CompilationRelease::default();
        // name → (page, tracks), in first-credit order.
        let mut seen: Vec<(String, Option<String>, Vec<String>)> = Vec::new();
        for c in credits {
            match seen.iter_mut().find(|(n, ..)| n.eq_ignore_ascii_case(&c.name)) {
                Some((_, _, tracks)) => {
                    if !tracks.contains(&c.track) {
                        tracks.push(c.track);
                    }
                }
                None => {
                    let page = page_for(&c.name, c.discogs_id.as_deref());
                    seen.push((c.name, page, vec![c.track]));
                }
            }
        }
        release.artists = seen.len();
        for (name, page, tracks) in seen {
            match page {
                Some(uri) => {
                    release.links.insert(name.clone(), uri.clone());
                    let entry = file.artists.entry(uri).or_insert_with(|| ArtistAppearances { name, on: Vec::new() });
                    if !entry.on.iter().any(|a| a.release == identity.uri_release) {
                        entry.on.push(Appearance { release: identity.uri_release.clone(), tracks });
                    }
                }
                None => *others.entry(name).or_default() += 1,
            }
        }
        file.releases.insert(identity.uri_release, release);
    }
    let mut others: Vec<OtherArtist> = others.into_iter().map(|(name, releases)| OtherArtist { name, releases }).collect();
    others.sort_by(|a, b| b.releases.cmp(&a.releases).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    file.others_count = others.len();
    others.truncate(OTHERS_KEPT);
    file.others = others;
    file
}

/// Write `compilations.json` beside collection.json. Returns how many compilations it covers.
pub fn write(cfg: &Config, releases: &[ReleaseRecord], artists: &[ArtistSummary], path: &Path) -> Result<usize> {
    let by_discogs: HashMap<&str, &str> = artists
        .iter()
        .filter_map(|a| Some((a.discogs_id.as_deref().filter(|d| !d.is_empty())?, a.name.as_str())))
        .collect();
    let dir = cfg.artists_dir();
    let published = |name: &str| {
        let folder = sanitize_folder_name(name);
        dir.join(&folder).join(format!("{folder}.json")).is_file().then(|| format!("/{}/{folder}/", cfg.artists.path))
    };
    // By Discogs ID when the credit has one (a name can belong to several artists), else by name.
    let page_for = |name: &str, discogs_id: Option<&str>| match discogs_id {
        Some(id) => by_discogs.get(id).and_then(|n| published(n)),
        None => published(name),
    };
    let file = build(cfg, releases, &page_for);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string(&file)?)?;
    Ok(file.releases.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release(id: &str, title: &str, artists: Value, tracklist: Value) -> ReleaseRecord {
        ReleaseRecord { discogs_id: Some(id.into()), title: title.into(), artists, tracklist, ..Default::default() }
    }

    #[test]
    fn links_track_artists_with_pages_and_counts_the_rest() {
        let cfg = Config::default();
        let releases = vec![
            release(
                "1",
                "Clowns And Jugglers",
                json!([{"name": "Various", "discogs_id": "194"}]),
                json!([
                    {"position": "A1", "title": "Arnold Layne", "artists": [{"name": "Pink Floyd", "discogs_id": "45467"}, {"name": "Richard Wright", "discogs_id": "12"}]},
                    {"position": "A2", "title": "See Emily Play", "artists": [{"name": "Martha Wainwright", "discogs_id": "99"}]},
                    {"position": "D5", "title": "Arnold Layne (Live)", "artists": [{"name": "Pink Floyd", "discogs_id": "45467"}]}
                ]),
            ),
            release("2", "Meddle", json!([{"name": "Pink Floyd", "discogs_id": "45467"}]), json!([{"position": "A1", "title": "One Of These Days", "artists": [{"name": "Pink Floyd"}]}])),
            release("3", "Help", json!([{"name": "Various", "discogs_id": "194"}]), json!([{"position": "1", "title": "Come Together", "artists": [{"name": "Martha Wainwright", "discogs_id": "99"}]}])),
        ];
        let page_for = |_: &str, id: Option<&str>| (id == Some("45467")).then(|| "/artist/pink-floyd/".to_string());
        let file = build(&cfg, &releases, &page_for);

        assert_eq!(file.releases.len(), 2, "only Various releases count");
        let clowns = file.releases.values().find(|r| r.artists == 3).expect("clowns");
        assert_eq!(clowns.links.get("Pink Floyd").map(String::as_str), Some("/artist/pink-floyd/"));
        let floyd = &file.artists["/artist/pink-floyd/"];
        assert_eq!(floyd.name, "Pink Floyd");
        assert_eq!(floyd.on.len(), 1);
        assert_eq!(floyd.on[0].tracks, vec!["Arnold Layne", "Arnold Layne (Live)"]);
        assert_eq!(file.others[0], OtherArtist { name: "Martha Wainwright".into(), releases: 2 });
        assert_eq!(file.others[1].name, "Richard Wright");
        assert_eq!(file.others_count, 2);
    }
}
