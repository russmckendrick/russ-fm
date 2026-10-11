//! Gather everything known about a release: Discogs siblings (other versions already in the
//! database), and reference albums from MusicBrainz, Apple Music and Spotify normalised into one
//! shape ([`RefAlbum`]).

use std::collections::BTreeMap;

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

use scrapper::services::{AppleMusicService, DiscogsService, SpotifyService};

use crate::musicbrainz::{self, MusicBrainz};
use crate::rules::{norm, Family};

/// How many sibling releases to fetch in full (each is one Discogs request).
const MAX_SIBLINGS: usize = 8;

pub struct Clients {
    pub discogs: DiscogsService,
    pub apple: AppleMusicService,
    pub spotify: SpotifyService,
    pub mb: MusicBrainz,
}

impl Clients {
    pub fn new(cfg: &scrapper::Config) -> Self {
        Self {
            discogs: DiscogsService::new(cfg),
            apple: AppleMusicService::new(cfg),
            spotify: SpotifyService::new(cfg),
            mb: MusicBrainz::new(),
        }
    }
}

/// One track of a reference (non-Discogs) album.
#[derive(Debug, Clone, Serialize)]
pub struct RefTrack {
    pub disc: usize,
    /// Position as the source gives it ("A1" from MusicBrainz vinyl, else the track number).
    pub position: String,
    pub title: String,
    pub artists: Vec<String>,
    pub duration_ms: Option<u64>,
    pub composers: Vec<String>,
}

/// An album from MusicBrainz, Apple Music or Spotify, reduced to what a draft can use.
#[derive(Debug, Clone, Serialize)]
pub struct RefAlbum {
    pub source: &'static str,
    pub url: String,
    pub title: String,
    pub artist: String,
    pub label: Option<String>,
    pub date: Option<String>,
    /// Barcode / UPC. Digital UPCs differ from the physical barcode, so this is never copied.
    pub barcode: Option<String>,
    /// (kind, text) — kind "P" (℗) or "C" (©).
    pub copyrights: Vec<(String, String)>,
    pub genres: Vec<String>,
    pub formats: Vec<String>,
    pub disambiguation: Option<String>,
    pub tracks: Vec<RefTrack>,
    /// Release-level credits (MusicBrainz relationships): (role, name).
    pub credits: Vec<(String, String)>,
}

/// A MusicBrainz release of the album — used to spot the variant that isn't on Discogs yet.
#[derive(Debug, Clone, Serialize)]
pub struct MbVariant {
    pub mbid: String,
    pub barcode: Option<String>,
    pub country: Option<String>,
    pub date: Option<String>,
    pub formats: Vec<String>,
    pub disambiguation: Option<String>,
    pub on_discogs: bool,
}

#[derive(Default)]
pub struct Gathered {
    /// Discogs releases already carrying the barcode (search results).
    pub barcode_hits: Vec<Value>,
    /// Full Discogs releases of the same album.
    pub siblings: Vec<Value>,
    pub master_id: Option<String>,
    pub mb_variants: Vec<MbVariant>,
    pub mb: Option<RefAlbum>,
    pub apple: Option<RefAlbum>,
    pub spotify: Option<RefAlbum>,
    /// Sources that failed or weren't configured, with the reason.
    pub skipped: Vec<String>,
}

impl RefAlbum {
    /// True when every medium is of `family` (a MusicBrainz "12\" Vinyl" release for Vinyl).
    pub fn is_family(&self, family: Family) -> bool {
        let fam = family.discogs_name().to_lowercase();
        !self.formats.is_empty() && self.formats.iter().all(|f| f.to_lowercase().contains(&fam))
    }
}

impl Gathered {
    pub fn references(&self) -> Vec<&RefAlbum> {
        [&self.mb, &self.apple, &self.spotify].into_iter().flatten().collect()
    }
}

/// Discogs releases already carrying `barcode` — tried as digits, then as typed. Errors
/// propagate: a failed lookup must never read as "not on Discogs".
pub async fn barcode_hits(c: &Clients, barcode: &str) -> Result<Vec<Value>> {
    let mut hits: BTreeMap<i64, Value> = BTreeMap::new();
    let digits = crate::rules::digits(barcode);
    for q in [digits.as_str(), barcode.trim()] {
        if q.is_empty() {
            continue;
        }
        let v = c.discogs.search_barcode(q).await.map_err(|e| anyhow::anyhow!("Discogs barcode search failed: {e}"))?;
        for r in v.get("results").and_then(|r| r.as_array()).into_iter().flatten() {
            if let Some(id) = r.get("id").and_then(|i| i.as_i64()) {
                hits.insert(id, r.clone());
            }
        }
        if !hits.is_empty() || q == barcode.trim() {
            break;
        }
    }
    Ok(hits.into_values().collect())
}

pub async fn gather(c: &Clients, artist: &str, title: &str, family: Family, barcode: Option<&str>, base: Option<&str>) -> Result<Gathered> {
    let mut g = Gathered::default();
    if let Some(b) = barcode {
        g.barcode_hits = barcode_hits(c, b).await?;
    }

    eprintln!("· Discogs: looking for other versions of \"{title}\"");
    // A failed search must not read as "not on Discogs" — that's how duplicates get submitted.
    // Anonymous search allows ~25 requests a minute, so wait out one window before giving up.
    let found = match siblings(c, artist, title, family, base).await {
        Ok(found) => found,
        Err(e) => {
            eprintln!("  ! Discogs search failed ({e}) — waiting a minute and retrying");
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            siblings(c, artist, title, family, base)
                .await
                .map_err(|e| anyhow::anyhow!("Discogs search failed twice ({e}); not drafting without checking for existing versions"))?
        }
    };
    (g.siblings, g.master_id) = found;
    let sibling_barcodes: Vec<String> = g
        .siblings
        .iter()
        .flat_map(|s| s.get("identifiers").and_then(|i| i.as_array()).cloned().unwrap_or_default())
        .filter(|i| i.get("type").and_then(|t| t.as_str()) == Some("Barcode"))
        .filter_map(|i| i.get("value").and_then(|v| v.as_str()).map(crate::rules::digits))
        .collect();

    eprintln!("· MusicBrainz");
    match musicbrainz_ref(c, artist, title, family, barcode, &sibling_barcodes).await {
        Ok((variants, mb)) => {
            g.mb_variants = variants;
            g.mb = mb;
        }
        Err(e) => g.skipped.push(format!("MusicBrainz: {e}")),
    }

    if c.apple.is_configured() {
        eprintln!("· Apple Music");
        match apple_ref(c, artist, title).await {
            Ok(a) => g.apple = a,
            Err(e) => g.skipped.push(format!("Apple Music: {e}")),
        }
    } else {
        g.skipped.push("Apple Music: not configured".into());
    }

    if c.spotify.is_configured() {
        eprintln!("· Spotify");
        match spotify_ref(c, artist, title).await {
            Ok(s) => g.spotify = s,
            Err(e) => g.skipped.push(format!("Spotify: {e}")),
        }
    } else {
        g.skipped.push("Spotify: not configured".into());
    }
    Ok(g)
}

// ── Discogs ─────────────────────────────────────────────────────────────────────────────────

/// "Artist - Title" search-result title → does its title part match ours?
fn title_match(result_title: &str, want: &str) -> u8 {
    let t = result_title.split_once(" - ").map(|(_, t)| t).unwrap_or(result_title);
    let (t, w) = (norm(t), norm(want));
    if t == w {
        2
    } else if !w.is_empty() && (t.starts_with(&w) || w.starts_with(&t)) && t.len().min(w.len()) >= 6 {
        1
    } else {
        0
    }
}

async fn siblings(c: &Clients, artist: &str, title: &str, family: Family, base: Option<&str>) -> Result<(Vec<Value>, Option<String>)> {
    // (id, title-match strength, formats text)
    let mut found: BTreeMap<String, (u8, String)> = BTreeMap::new();
    let mut masters: BTreeMap<String, usize> = BTreeMap::new();

    let any_match = |v: &Value| {
        v.get("results").and_then(|r| r.as_array()).into_iter().flatten().any(|r| title_match(r.get("title").and_then(|t| t.as_str()).unwrap_or(""), title) > 0)
    };
    // Compilations are often credited to someone other than what was typed ("Various" vs the
    // main artist on Discogs), and Discogs search trips over parallel titles ("A = B") — so
    // fall back to the title alone, then the main title alone.
    let mut res = Value::Null;
    for (a, t) in [(artist, title), ("", title), ("", main_title(title))] {
        res = c.discogs.search_releases(a, t, 50).await?;
        if any_match(&res) {
            break;
        }
    }
    for r in res.get("results").and_then(|r| r.as_array()).into_iter().flatten() {
        let rt = r.get("title").and_then(|t| t.as_str()).unwrap_or("");
        let strength = title_match(rt, title);
        if strength == 0 {
            continue;
        }
        let Some(id) = r.get("id").and_then(|i| i.as_i64()) else { continue };
        let formats = r.get("format").and_then(|f| f.as_array()).map(|f| f.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
        found.insert(id.to_string(), (strength, formats));
        if let Some(m) = r.get("master_id").and_then(|m| m.as_i64()).filter(|m| *m > 0) {
            *masters.entry(m.to_string()).or_default() += 1;
        }
    }

    let master = masters.into_iter().max_by_key(|(_, n)| *n).map(|(m, _)| m);
    if let Some(m) = &master {
        if let Ok(v) = c.discogs.master_versions(m).await {
            for r in v.get("versions").and_then(|r| r.as_array()).into_iter().flatten() {
                let Some(id) = r.get("id").and_then(|i| i.as_i64()) else { continue };
                let formats = r.get("format").and_then(|f| f.as_str()).unwrap_or("").to_string();
                let major = r.get("major_formats").and_then(|f| f.as_array()).map(|f| f.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
                found.entry(id.to_string()).or_insert((2, format!("{major}, {formats}")));
            }
        }
    }

    // Rank what to fetch: exact title, same family, then not a test pressing / promo.
    let fam = family.discogs_name().to_lowercase();
    let mut ranked: Vec<(String, i32)> = found
        .into_iter()
        .map(|(id, (strength, formats))| {
            let f = formats.to_lowercase();
            let mut score = i32::from(strength) * 10;
            if f.contains(&fam) {
                score += 20;
            }
            if f.contains("test pressing") || f.contains("promo") || f.contains("unofficial") {
                score -= 30;
            }
            (id, score)
        })
        .collect();
    ranked.sort_by_key(|a| std::cmp::Reverse(a.1));
    let mut ids: Vec<String> = ranked.into_iter().map(|(id, _)| id).take(MAX_SIBLINGS).collect();
    if let Some(b) = base {
        ids.retain(|i| i != b);
        ids.insert(0, b.to_string());
    }

    let mut out = Vec::new();
    for id in ids {
        match c.discogs.get_release(&id).await {
            Ok(r) => out.push(r),
            Err(e) => eprintln!("  ! Discogs release {id}: {e}"),
        }
    }
    Ok((out, master))
}

// ── MusicBrainz ─────────────────────────────────────────────────────────────────────────────

async fn musicbrainz_ref(
    c: &Clients,
    artist: &str,
    title: &str,
    family: Family,
    barcode: Option<&str>,
    discogs_barcodes: &[String],
) -> Result<(Vec<MbVariant>, Option<RefAlbum>)> {
    let mut releases = c.mb.search_releases(artist, title).await?;
    releases.retain(|r| r.get("title").and_then(|t| t.as_str()).map(|t| norm(t) == norm(title)).unwrap_or(false));
    if let Some(b) = barcode {
        for r in c.mb.releases_by_barcode(&crate::rules::digits(b)).await.unwrap_or_default() {
            if !releases.iter().any(|x| x.get("id") == r.get("id")) {
                releases.push(r);
            }
        }
    }

    let s = |r: &Value, k: &str| r.get(k).and_then(|v| v.as_str()).filter(|v| !v.is_empty()).map(String::from);
    let variants: Vec<MbVariant> = releases
        .iter()
        .map(|r| {
            let bc = s(r, "barcode");
            MbVariant {
                mbid: s(r, "id").unwrap_or_default(),
                on_discogs: bc.as_ref().map(|b| discogs_barcodes.contains(&crate::rules::digits(b))).unwrap_or(false),
                barcode: bc,
                country: s(r, "country"),
                date: s(r, "date"),
                formats: musicbrainz::media_formats(r),
                disambiguation: s(r, "disambiguation"),
            }
        })
        .collect();

    // Best release to read tracks from: our barcode, else same family not yet on Discogs, else
    // same family, else anything.
    let want = barcode.map(crate::rules::digits);
    let pick = variants
        .iter()
        .max_by_key(|v| {
            let mut score = 0;
            if want.is_some() && v.barcode.as_deref().map(crate::rules::digits) == want {
                score += 100;
            }
            if v.formats.iter().any(|f| f.to_lowercase().contains(&family.discogs_name().to_lowercase())) {
                score += 10;
                if !v.on_discogs {
                    score += 5;
                }
            }
            if !v.formats.iter().any(|f| f.contains("Digital")) {
                score += 2;
            }
            score
        })
        .map(|v| v.mbid.clone());

    let album = match pick {
        Some(mbid) => Some(mb_album(&c.mb.release(&mbid).await?)),
        None => None,
    };
    Ok((variants, album))
}

fn credit_names(ac: Option<&Value>) -> String {
    ac.and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .map(|x| {
                    let name = x.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    format!("{name}{}", x.get("joinphrase").and_then(|j| j.as_str()).unwrap_or(""))
                })
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn mb_album(r: &Value) -> RefAlbum {
    let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from);
    let album_artist = credit_names(r.get("artist-credit"));
    let mut tracks = Vec::new();
    for m in r.get("media").and_then(|m| m.as_array()).into_iter().flatten() {
        let disc = m.get("position").and_then(|p| p.as_u64()).unwrap_or(1) as usize;
        for t in m.get("tracks").and_then(|t| t.as_array()).into_iter().flatten() {
            let rec = t.get("recording").cloned().unwrap_or(Value::Null);
            let mut composers = Vec::new();
            for rel in rec.get("relations").and_then(|x| x.as_array()).into_iter().flatten() {
                for wr in rel.get("work").and_then(|w| w.get("relations")).and_then(|x| x.as_array()).into_iter().flatten() {
                    if matches!(wr.get("type").and_then(|t| t.as_str()), Some("composer" | "writer" | "lyricist")) {
                        if let Some(n) = wr.get("artist").and_then(|a| a.get("name")).and_then(|n| n.as_str()) {
                            if !composers.iter().any(|c: &String| c == n) {
                                composers.push(n.to_string());
                            }
                        }
                    }
                }
            }
            let track_artist = credit_names(t.get("artist-credit"));
            tracks.push(RefTrack {
                disc,
                position: s(t, "number").unwrap_or_default(),
                title: s(t, "title").unwrap_or_default(),
                artists: if track_artist.is_empty() || track_artist == album_artist { vec![] } else { vec![track_artist] },
                duration_ms: t.get("length").and_then(|l| l.as_u64()),
                composers,
            });
        }
    }
    let credits = r
        .get("relations")
        .and_then(|x| x.as_array())
        .into_iter()
        .flatten()
        .filter_map(|rel| {
            let name = rel.get("artist").and_then(|a| a.get("name")).and_then(|n| n.as_str())?;
            Some((rel.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string(), name.to_string()))
        })
        .collect();
    let labels = r.get("label-info").and_then(|l| l.as_array()).cloned().unwrap_or_default();
    RefAlbum {
        source: "MusicBrainz",
        url: format!("https://musicbrainz.org/release/{}", s(r, "id").unwrap_or_default()),
        title: s(r, "title").unwrap_or_default(),
        artist: album_artist,
        label: labels.iter().find_map(|l| l.get("label").and_then(|x| x.get("name")).and_then(|n| n.as_str()).map(String::from)),
        date: s(r, "date"),
        barcode: s(r, "barcode"),
        copyrights: vec![],
        genres: vec![],
        formats: musicbrainz::media_formats(r),
        disambiguation: s(r, "disambiguation"),
        tracks,
        credits,
    }
}

// ── Apple Music / Spotify ───────────────────────────────────────────────────────────────────

/// Score a streaming album candidate: exact title beats "Title (Deluxe)", artist must match.
fn candidate_score(name: &str, artist: &str, want_title: &str, want_artist: &str) -> i32 {
    let (n, t) = (norm(name), norm(want_title));
    let mut score = if n == t {
        10
    } else if n.starts_with(&t) && t.len() >= 6 {
        // "Title (Deluxe Edition)" for "Title".
        5
    } else {
        return 0;
    };
    let (a, wa) = (norm(artist), norm(want_artist));
    if wa.is_empty() || wa.starts_with("various") {
        // Compilation: the exact title is all we can go on.
        if n != t {
            return 0;
        }
    } else if a == wa || a.contains(&wa) || wa.contains(&a) {
        score += 5;
    } else {
        return 0;
    }
    let lower = name.to_lowercase();
    if lower.contains("single") || lower.contains(" - ep") {
        score -= 3;
    }
    score
}

/// The title before any parallel title or subtitle: "Clowns and Jugglers = The Songs of Syd
/// Barrett" → "Clowns and Jugglers". Streaming catalogues rarely carry the full sleeve title.
fn main_title(title: &str) -> &str {
    let cut = [" = ", " (", ": "].iter().filter_map(|sep| title.find(sep)).min().unwrap_or(title.len());
    title[..cut].trim()
}

/// Search terms to try, most specific first. "Various" never helps a streaming search.
fn streaming_attempts<'a>(artist: &'a str, title: &'a str) -> Vec<(&'a str, &'a str)> {
    let artist = if norm(artist).starts_with("various") { "" } else { artist };
    let mut out = vec![(artist, title)];
    if main_title(title) != title {
        out.push((artist, main_title(title)));
    }
    out
}

async fn apple_ref(c: &Clients, artist: &str, title: &str) -> Result<Option<RefAlbum>> {
    for (a, t) in streaming_attempts(artist, title) {
        if let Some(album) = apple_ref_once(c, a, t, artist, title).await? {
            return Ok(Some(album));
        }
    }
    Ok(None)
}

async fn spotify_ref(c: &Clients, artist: &str, title: &str) -> Result<Option<RefAlbum>> {
    for (a, t) in streaming_attempts(artist, title) {
        if let Some(album) = spotify_ref_once(c, a, t, artist, title).await? {
            return Ok(Some(album));
        }
    }
    Ok(None)
}

async fn apple_ref_once(c: &Clients, artist: &str, title: &str, want_artist: &str, full_title: &str) -> Result<Option<RefAlbum>> {
    let res = c.apple.search_release(artist, title).await?;
    let best = res
        .pointer("/results/albums/data")
        .and_then(|d| d.as_array())
        .into_iter()
        .flatten()
        .filter_map(|a| {
            let at = a.get("attributes")?;
            let (name, by) = (at.get("name")?.as_str()?, at.get("artistName")?.as_str()?);
            let score = candidate_score(name, by, title, want_artist).max(candidate_score(name, by, full_title, want_artist));
            if score > 0 { Some((score, a.get("id")?.as_str()?.to_string())) } else { None }
        })
        .max_by_key(|(s, _)| *s);
    let Some((_, id)) = best else { return Ok(None) };
    let v = c.apple.get_album(&id).await?;
    let album = v.pointer("/data/0").cloned().unwrap_or(Value::Null);
    let at = album.get("attributes").cloned().unwrap_or(Value::Null);
    let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from);
    let album_artist = s(&at, "artistName").unwrap_or_default();
    let tracks = album
        .pointer("/relationships/tracks/data")
        .and_then(|d| d.as_array())
        .into_iter()
        .flatten()
        .filter_map(|t| t.get("attributes"))
        .map(|t| {
            let ta = s(t, "artistName").unwrap_or_default();
            RefTrack {
                disc: t.get("discNumber").and_then(|d| d.as_u64()).unwrap_or(1) as usize,
                position: t.get("trackNumber").and_then(|d| d.as_u64()).unwrap_or(0).to_string(),
                title: s(t, "name").unwrap_or_default(),
                artists: if ta.is_empty() || ta == album_artist { vec![] } else { vec![ta] },
                duration_ms: t.get("durationInMillis").and_then(|d| d.as_u64()),
                composers: s(t, "composerName").map(|c| split_names(&c)).unwrap_or_default(),
            }
        })
        .collect();
    let copyrights = s(&at, "copyright").map(|c| vec![(copyright_kind(&c), c)]).unwrap_or_default();
    Ok(Some(RefAlbum {
        source: "Apple Music",
        url: s(&at, "url").unwrap_or_default(),
        title: s(&at, "name").unwrap_or_default(),
        artist: album_artist,
        label: s(&at, "recordLabel"),
        date: s(&at, "releaseDate"),
        barcode: s(&at, "upc"),
        copyrights,
        genres: at.get("genreNames").and_then(|g| g.as_array()).map(|g| g.iter().filter_map(|x| x.as_str().map(String::from)).filter(|g| g != "Music").collect()).unwrap_or_default(),
        formats: vec!["Digital".into()],
        disambiguation: None,
        tracks,
        credits: vec![],
    }))
}

async fn spotify_ref_once(c: &Clients, artist: &str, title: &str, want_artist: &str, full_title: &str) -> Result<Option<RefAlbum>> {
    let res = c.spotify.search_release(artist, title).await?;
    let best = res
        .pointer("/albums/items")
        .and_then(|d| d.as_array())
        .into_iter()
        .flatten()
        .filter_map(|a| {
            let first_artist = a.pointer("/artists/0/name")?.as_str()?;
            let name = a.get("name")?.as_str()?;
            if a.get("album_type").and_then(|t| t.as_str()) == Some("single") {
                return None;
            }
            let score = candidate_score(name, first_artist, title, want_artist).max(candidate_score(name, first_artist, full_title, want_artist));
            if score > 0 { Some((score, a.get("id")?.as_str()?.to_string())) } else { None }
        })
        .max_by_key(|(s, _)| *s);
    let Some((_, id)) = best else { return Ok(None) };
    let a = c.spotify.get_album(&id).await?;
    let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from);
    let names = |v: &Value| -> Vec<String> {
        v.get("artists").and_then(|x| x.as_array()).map(|x| x.iter().filter_map(|n| s(n, "name")).collect()).unwrap_or_default()
    };
    let album_artists = names(&a);
    let tracks = a
        .pointer("/tracks/items")
        .and_then(|d| d.as_array())
        .into_iter()
        .flatten()
        .map(|t| {
            let ta = names(t);
            RefTrack {
                disc: t.get("disc_number").and_then(|d| d.as_u64()).unwrap_or(1) as usize,
                position: t.get("track_number").and_then(|d| d.as_u64()).unwrap_or(0).to_string(),
                title: s(t, "name").unwrap_or_default(),
                artists: if ta == album_artists { vec![] } else { ta },
                duration_ms: t.get("duration_ms").and_then(|d| d.as_u64()),
                composers: vec![],
            }
        })
        .collect();
    let copyrights = a
        .get("copyrights")
        .and_then(|c| c.as_array())
        .into_iter()
        .flatten()
        .filter_map(|c| Some((s(c, "type").unwrap_or_default(), s(c, "text")?)))
        .collect();
    Ok(Some(RefAlbum {
        source: "Spotify",
        url: a.pointer("/external_urls/spotify").and_then(|u| u.as_str()).unwrap_or("").to_string(),
        title: s(&a, "name").unwrap_or_default(),
        artist: album_artists.join(", "),
        label: s(&a, "label"),
        date: s(&a, "release_date"),
        barcode: a.pointer("/external_ids/upc").and_then(|u| u.as_str()).map(String::from),
        copyrights,
        genres: vec![],
        formats: vec!["Digital".into()],
        disambiguation: None,
        tracks,
        credits: vec![],
    }))
}

fn copyright_kind(text: &str) -> String {
    if text.contains('℗') || text.to_lowercase().starts_with("(p)") { "P" } else { "C" }.to_string()
}

/// "Bruce Soord, Jon Sykes & Steve Kitch" → three names.
fn split_names(s: &str) -> Vec<String> {
    s.split([',', '&', '/']).map(str::trim).filter(|n| !n.is_empty()).map(String::from).collect()
}
