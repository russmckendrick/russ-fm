//! `tv.json` generator — the video index behind the frontend's `/tv` page. Written alongside
//! `collection.json` by [`super::collection::generate`]. Compact JSON (the file is large), fixed
//! key order via the structs below, releases sorted by `date_added` descending then `uri`.
//!
//! Videos come from the Discogs release's `raw_data.discogs.videos` (the `videos` column only
//! holds bare URLs). Audio-only uploads are dropped — a static sleeve is no use on TV — and each
//! kept video gets a cleaned song title plus a `kind` (`live` / `video` / `other`).

use std::collections::{HashMap, HashSet};
use std::path::Path;

use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;

use super::collection::{date_added, release_identity, string_list_filtered};
use crate::db::ReleaseRecord;
use crate::Config;

#[derive(Serialize)]
struct TvFile {
    version: u32,
    releases: Vec<TvRelease>,
}

#[derive(Serialize)]
struct TvRelease {
    uri: String,
    /// Release name and joined headliner credit, as `release_name` / `release_artist` in
    /// collection.json (lets the worker title a shared video link without the collection).
    name: String,
    artist: String,
    date_added: String,
    genres: Vec<String>,
    styles: Vec<String>,
    videos: Vec<TvVideo>,
}

#[derive(Serialize, Debug, PartialEq)]
struct TvVideo {
    id: String,
    title: String,
    /// The track artist, when it differs from the release headliner (compilations).
    #[serde(skip_serializing_if = "Option::is_none")]
    artist: Option<String>,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<u64>,
}

/// Build and write `tv.json` to `path` from the already-loaded releases. Returns the number of
/// releases listed (those with at least one kept video).
pub fn write(cfg: &Config, releases: &[ReleaseRecord], path: &Path) -> Result<usize> {
    let file = build(cfg, releases);
    let count = file.releases.len();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string(&file)?)?;
    Ok(count)
}

fn build(cfg: &Config, releases: &[ReleaseRecord]) -> TvFile {
    let mut out: Vec<TvRelease> = releases
        .iter()
        .filter_map(|rec| {
            let identity = release_identity(cfg, rec)?;
            let artist = ArtistMatch::new(&identity.names, &track_artists(rec));
            let videos = release_videos(rec, &artist);
            if videos.is_empty() {
                return None;
            }
            let release_artist = identity.names.join(" & ");
            Some(TvRelease {
                uri: identity.uri_release,
                name: identity.release_name.clone(),
                artist: release_artist,
                date_added: date_added(rec),
                genres: string_list_filtered(&rec.genres),
                styles: string_list_filtered(&rec.styles),
                videos,
            })
        })
        .collect();
    out.sort_by(|a, b| b.date_added.cmp(&a.date_added).then_with(|| a.uri.cmp(&b.uri)));
    TvFile { version: 1, releases: out }
}

/// The kept videos for one release, in Discogs order, de-duplicated by YouTube id.
fn release_videos(rec: &ReleaseRecord, artist: &ArtistMatch) -> Vec<TvVideo> {
    let Some(list) = rec.raw_data.get("discogs").and_then(|d| d.get("videos")).and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    list.iter()
        .filter_map(|v| video_entry(v, artist))
        .filter(|v| seen.insert(v.id.clone()))
        .collect()
}

fn video_entry(v: &Value, artist: &ArtistMatch) -> Option<TvVideo> {
    let embed = v.get("embed");
    if matches!(embed, Some(Value::Bool(false))) || embed.and_then(|e| e.as_i64()) == Some(0) {
        return None;
    }
    let id = youtube_id(v.get("uri")?.as_str()?)?;
    let raw_title = v.get("title").and_then(|t| t.as_str()).unwrap_or("").trim();
    let description = v.get("description").and_then(|d| d.as_str()).unwrap_or("");
    if is_audio_only(raw_title, description) {
        return None;
    }
    let duration = v
        .get("duration")
        .and_then(|d| d.as_u64().or_else(|| d.as_f64().filter(|f| *f > 0.0).map(|f| f.round() as u64)))
        .filter(|d| *d > 0);
    let kind = video_kind(raw_title);
    if is_long_form(raw_title, duration, kind) {
        return None;
    }
    let (title, credit) = title_and_credit(raw_title, artist);
    Some(TvVideo { id, title, artist: credit, kind, duration })
}

/// Longest kept video, in seconds: 30 minutes, or 90 for live performances.
const MAX_DURATION: u64 = 1800;
const MAX_LIVE_DURATION: u64 = 5400;

/// Full-album / full-concert uploads: tagged as such, or simply too long for a video channel.
fn is_long_form(title: &str, duration: Option<u64>, kind: &str) -> bool {
    static FULL: Lazy<Regex> = Lazy::new(|| {
        Regex::new(concat!(
            r"(?i)\bfull[\s-]+(?:album|concert|show|lp|ep|length)\b|\balbum\s+full\b",
            r"|\bcomplete\s+(?:album|lp|ep)\b|\b(?:album|audio|vinyl)\s+rip\b",
            r"|\bside\s+[ab12]\b.*\bfull\b|\bfull\b.*\bside\s+[ab12]\b",
        ))
        .expect("full album pattern")
    });
    let limit = if kind == "live" { MAX_LIVE_DURATION } else { MAX_DURATION };
    FULL.is_match(title) || duration.is_some_and(|d| d > limit)
}

/// The 11-character YouTube id from a watch (`v=`), short (`youtu.be/`) or embed URL.
fn youtube_id(uri: &str) -> Option<String> {
    static ID: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?:[?&]v=|youtu\.be/|/embed/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)").expect("youtube id pattern")
    });
    ID.captures(uri).map(|c| c[1].to_string())
}

/// Audio-only uploads: YouTube's auto-generated art tracks, and anything tagged as (official)
/// audio or a visualiser.
fn is_audio_only(title: &str, description: &str) -> bool {
    static AUDIO: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)[(\[][^()\[\]]*\baudio\b[^()\[\]]*[)\]]|\s[-–—|]\s*(?:official\s+)?audio\b|\bofficial\s+audio\b|\bvisuali[sz]er\b",
        )
        .expect("audio tag pattern")
    });
    description.trim_start().starts_with("Provided to YouTube by") || AUDIO.is_match(title)
}

fn video_kind(title: &str) -> &'static str {
    // "Live" only as a tag or a performance phrase, never as a lyric word ("Live Forever",
    // "I Live To Make You Smile"): inside brackets, closing a dash/pipe segment, or followed
    // by at/from/in/on/@/session/performance/version/….
    static LIVE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(concat!(
            r"(?i)[(\[][^()\[\]]*\blive\b",
            r"|[-–—|]\s*live\s*(?:$|[-–—|(\[,])",
            r"|\blive\s*@",
            r"|\blive\s+(?:at|from|in|on|sessions?|performance|version|recording|studio|acoustic|concert|show|vol)\b",
        ))
        .expect("live pattern")
    });
    static VIDEO: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\bofficial\s+(?:music\s+)?video\b|\bmusic\s+video\b|\bpromo\b|[(\[]\s*video\s*[)\]]|\bm/?v\b")
            .expect("video pattern")
    });
    if LIVE.is_match(title) {
        "live"
    } else if VIDEO.is_match(title) {
        "video"
    } else {
        "other"
    }
}

/// Normalised artist names used to recognise an "Artist - " credit on a video title.
struct ArtistMatch {
    /// Normalised name → the credit to show for it: `None` for the release's own headliners
    /// (and their joined `A & B` credit), the canonical Discogs name for a track artist.
    names: HashMap<String, Option<String>>,
    joined: String,
    /// Credited to "Various" — a compilation.
    various: bool,
}

impl ArtistMatch {
    /// `track_artists` are `(name as it may appear, canonical name)` pairs.
    fn new(names: &[String], track_artists: &[(String, String)]) -> Self {
        let joined = normalise_artist(&names.join(" & "));
        let headliners: HashSet<String> =
            names.iter().map(|n| normalise_artist(n)).chain(std::iter::once(joined.clone())).collect();
        let mut map: HashMap<String, Option<String>> = HashMap::new();
        for (alias, canonical) in track_artists {
            let credit = clean_credit(canonical);
            let shown = (!headliners.contains(&normalise_artist(&credit))).then_some(credit);
            map.entry(normalise_artist(alias)).or_insert(shown);
        }
        for h in &headliners {
            map.insert(h.clone(), None);
        }
        map.remove("");
        Self { names: map, various: headliners.contains("various"), joined }
    }

    /// `None` when `s` is not a known artist; `Some(credit)` when it is, where `credit` is
    /// `None` for the release's headliners.
    fn lookup(&self, s: &str) -> Option<Option<String>> {
        self.names.get(&normalise_artist(s)).cloned()
    }

    /// Looser test for single-separator titles: either side contains the other
    /// (`Daryl Hall & John Oates with David Ruffin` ⊇ `Daryl Hall & John Oates`).
    fn loosely_matches(&self, s: &str) -> bool {
        let n = normalise_artist(s);
        n.len() >= 3 && !self.joined.is_empty() && (n.contains(&self.joined) || self.joined.contains(&n))
    }

    /// The credit for a free-text left side on a compilation, unless it is the headliner or
    /// doesn't look like an artist name (brackets, quotes, `#2`, "Official Trailer", "OST", …).
    fn free_credit(&self, s: &str) -> Option<String> {
        static NOT_ARTIST: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r#"(?i)[()\[\]#:"“”‘]|^'|\b(?:trailer|ost|soundtrack|vol|official|clip|scene)\b"#)
                .expect("not-artist pattern")
        });
        let credit = clean_credit(s.trim_matches(is_separator_char));
        let n = normalise_artist(&credit);
        let plausible = !n.is_empty() && credit.chars().count() <= 40 && !NOT_ARTIST.is_match(&credit);
        (plausible && !matches!(self.names.get(&n), Some(None))).then_some(credit)
    }
}

/// `(name as it may appear, canonical name)` for every per-track artist in the Discogs
/// tracklist — both the name and its variation (`anv`) point at the canonical name.
fn track_artists(rec: &ReleaseRecord) -> Vec<(String, String)> {
    let Some(tracks) = rec.raw_data.get("discogs").and_then(|d| d.get("tracklist")).and_then(|t| t.as_array()) else {
        return Vec::new();
    };
    let field = |a: &Value, k: &str| a.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    tracks
        .iter()
        .filter_map(|t| t.get("artists").and_then(|a| a.as_array()))
        .flatten()
        .flat_map(|a| {
            let name = field(a, "name");
            [(name.clone(), name.clone()), (field(a, "anv"), name)]
        })
        .filter(|(alias, canonical)| !alias.is_empty() && !canonical.is_empty())
        .collect()
}

/// A Discogs artist name for display: no `(2)` disambiguation suffix, no trailing `*`.
fn clean_credit(name: &str) -> String {
    static SUFFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*\(\d+\)\s*$").expect("suffix pattern"));
    let name = name.trim().trim_end_matches('*');
    SUFFIX.replace(name, "").trim().trim_end_matches('*').trim().to_string()
}

/// Lowercase alphanumerics only, `&` read as "and", a leading "The" and a Discogs `(2)`
/// disambiguation suffix dropped.
fn normalise_artist(s: &str) -> String {
    let s = clean_credit(s);
    let lower = s.to_lowercase().replace('&', " and ");
    let lower = lower.trim_start();
    let lower = lower.strip_prefix("the ").unwrap_or(lower);
    lower.chars().filter(|c| c.is_alphanumeric()).collect()
}

/// A dash separator with whitespace on at least one side (`A - B`, `A- B`, `A -B`), so
/// hyphenated words (`Go-Go's`) never split.
static DASH_SEP: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+[-–—]\s*|\s*[-–—]\s+").expect("dash pattern"));

/// Strip a leading artist credit: `<artist> - `, `<artist>: `, `<artist>  ` (double space) or
/// `<artist> "…"`, where `<artist>` is a known artist name. With exactly one dash separator a
/// looser match against the joined credit is accepted too, and on a "Various" compilation any
/// left side is taken as the credit (unless the right side is the known artist). Returns the
/// rest of the title and the credit to show, if it differs from the headliner.
fn strip_artist_prefix<'a>(title: &'a str, artist: &ArtistMatch) -> (&'a str, Option<String>) {
    let mut splits: Vec<(usize, usize)> = DASH_SEP.find_iter(title).map(|m| (m.start(), m.end())).collect();
    for sep in [": ", "  "] {
        if let Some(i) = title.find(sep) {
            splits.push((i, i + sep.len()));
        }
    }
    // `Artist "Song"` — keep the quote so the wrapping-quote step removes the pair.
    if let Some((i, _)) =
        title.char_indices().find(|&(i, c)| matches!(c, '"' | '“' | '\'' | '‘') && title[..i].ends_with(' '))
    {
        splits.push((i, i));
    }
    splits.sort_unstable();
    for (left_end, rest_start) in &splits {
        if let Some(credit) = artist.lookup(&title[..*left_end]) {
            return (&title[*rest_start..], credit);
        }
    }
    let dashes: Vec<_> = DASH_SEP.find_iter(title).collect();
    if let [m] = dashes.as_slice() {
        let (left, right) = (&title[..m.start()], &title[m.end()..]);
        if artist.loosely_matches(left) {
            return (right, None);
        }
        if artist.various && artist.lookup(right).is_none() {
            if let Some(credit) = artist.free_credit(left) {
                return (right, Some(credit));
            }
        }
    }
    (title, None)
}

/// Strip a trailing ` - <artist>` credit (`Walking Zero - Sneaker Pimps`).
fn strip_artist_suffix<'a>(title: &'a str, artist: &ArtistMatch) -> (&'a str, Option<String>) {
    match DASH_SEP.find_iter(title).last() {
        Some(m) => match artist.lookup(&title[m.end()..]) {
            Some(credit) => (&title[..m.start()], credit),
            None => (title, None),
        },
        None => (title, None),
    }
}

/// A song title fit for on-screen credits — artist prefix, promo/format tags and wrapping
/// quotes removed; the raw title when cleaning leaves nothing — plus the artist credit found
/// on it when that is not the release's headliner (compilation track artists).
fn title_and_credit(raw: &str, artist: &ArtistMatch) -> (String, Option<String>) {
    static TAG_BRACKET: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*[(\[]([^()\[\]]*)[)\]]").expect("bracket pattern"));
    static TAG_WORDS: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(?:official|video|audio|hd|4k|remaster(?:ed)?|lyrics?|visuali[sz]er|promo|mv|m/v|clip|hq|high quality)\b")
            .expect("tag word pattern")
    });
    static TAIL: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)\s+(?:[-–—]\s+official\b.*|\|.*)$").expect("tail pattern"));
    static BY_ARTIST: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\s+by\s+(.+)$").expect("by pattern"));
    static SPACES: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").expect("space pattern"));
    static TRACK_NO: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\d{1,2}\.\s+").expect("track number pattern"));
    // Bare trailing quality/format tags: `Cars HD`, `Song Official Video`, `… HQ!`.
    static BARE_TAG: Lazy<Regex> = Lazy::new(|| {
        Regex::new(concat!(
            r"(?i)[\s,]+(?:(?:(?:in|full)\s+)?h[dq]|4k|1080p|720p|(?:hd\s+)?remaster(?:ed)?(?:\s+(?:in\s+)?hd)?",
            r"|official\s+(?:hd\s+)?(?:music\s+)?video|music\s+video|(?:hd\s+)?promo(?:\s+video)?)[\s!.,]*$",
        ))
        .expect("bare tag pattern")
    });

    let raw = raw.trim();
    let (stripped, mut credit) = strip_artist_prefix(raw, artist);
    let mut t = TRACK_NO.replace(stripped.trim_start_matches(is_separator_char), "").into_owned();

    // Bracketed tags; loop so a tag exposed by removing an inner one goes too.
    loop {
        let next = TAG_BRACKET
            .replace_all(&t, |c: &regex::Captures| {
                if TAG_WORDS.is_match(&c[1]) {
                    String::new()
                } else {
                    c[0].to_string()
                }
            })
            .into_owned();
        if next == t {
            break;
        }
        t = next;
    }
    t = TAIL.replace(&t, "").into_owned();
    loop {
        let next = BARE_TAG.replace(&t, "").into_owned();
        if next == t {
            break;
        }
        t = next;
    }
    // `"Song" by Artist`.
    if let Some(c) = BY_ARTIST.captures(&t) {
        if let Some(found) = artist.lookup(&c[1]) {
            credit = credit.or(found);
            t.truncate(c.get(0).map_or(t.len(), |m| m.start()));
        }
    }
    let (rest, found) = strip_artist_suffix(&t, artist);
    t = rest.to_string();
    credit = credit.or(found);
    t = SPACES.replace_all(t.trim_matches(is_separator_char), " ").into_owned();
    t = strip_wrapping_quotes(&t).trim().to_string();
    if t.is_empty() {
        (raw.to_string(), None)
    } else {
        (t, credit)
    }
}

fn is_separator_char(c: char) -> bool {
    c.is_whitespace() || matches!(c, '-' | '–' | '—' | ':' | '|' | ',')
}

fn strip_wrapping_quotes(s: &str) -> &str {
    const PAIRS: [(char, char); 4] = [('"', '"'), ('\'', '\''), ('“', '”'), ('‘', '’')];
    for (open, close) in PAIRS {
        if let Some(inner) = s.strip_prefix(open).and_then(|r| r.strip_suffix(close)) {
            // Only a true wrapper: no further quote of the same kind inside.
            if !inner.contains(close) {
                return inner;
            }
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn clean_title(raw: &str, artist: &ArtistMatch) -> String {
        title_and_credit(raw, artist).0
    }

    fn artist(names: &[&str]) -> ArtistMatch {
        ArtistMatch::new(&names.iter().map(|n| n.to_string()).collect::<Vec<_>>(), &[])
    }

    #[test]
    fn parses_youtube_ids() {
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=2eBZqmL8ehg").as_deref(), Some("2eBZqmL8ehg"));
        assert_eq!(youtube_id("https://www.youtube.com/watch?feature=x&v=2eBZqmL8ehg&t=3").as_deref(), Some("2eBZqmL8ehg"));
        assert_eq!(youtube_id("https://youtu.be/2eBZqmL8ehg").as_deref(), Some("2eBZqmL8ehg"));
        assert_eq!(youtube_id("https://www.youtube.com/embed/2eBZqmL8ehg?rel=0").as_deref(), Some("2eBZqmL8ehg"));
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=short"), None);
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=2eBZqmL8ehgTOOLONG"), None);
        assert_eq!(youtube_id("https://vimeo.com/12345678901"), None);
    }

    #[test]
    fn skips_audio_only_uploads() {
        assert!(is_audio_only("Selfish", "Provided to YouTube by Columbia\n\nSelfish"));
        assert!(is_audio_only("Placebo - HK Farewell (RE:CREATED VERSION) Official Audio", ""));
        assert!(is_audio_only("De La Soul - Stone Age (Official Audio) ft. Biz Markie", ""));
        assert!(is_audio_only("Song [Audio]", ""));
        assert!(is_audio_only("Song - Official Audio", ""));
        assert!(is_audio_only("Arcade Fire - She Cries Diamond Rain (Official Visualiser)", ""));
        assert!(is_audio_only("Song (Visualizer)", ""));
        assert!(!is_audio_only("Sneaker Pimps - 6 Underground - Official Video [HD]", "Sneaker Pimps"));
        assert!(!is_audio_only("Audioslave - Like a Stone (Official Video)", ""));
    }

    #[test]
    fn skips_full_album_and_overlong_uploads() {
        for t in [
            "Stone Temple Pilots - Core (Full Album)",
            "Dog Eat Dog - All Boro Kings SPECIAL [HQ FULL ALBUM]",
            "Nirvana - Live at Reading (Full Concert)",
            "Band - Full Show 1994",
            "Darkness on the Edge of Town (complete album)",
            "Artist - Debut (Full LP)",
            "Artist - Four Songs FULL EP",
            "The Smiths - The Queen Is Dead (Full Length)",
            "Artist - Debut [Full-Length]",
            "A4  I Go To Sleep - Pretenders – Pretenders II Original 1981 Vinyl Album HQ Audio Rip",
            "John Cale - Paris 1919 (1973) FULL ALBUM Vinyl Rip",
            "Artist - Record (Album Rip)",
            "Let Your Dim Light Shine - Album Full",
            "Artist - Record Side A (Full)",
            "Artist - Full Side B",
            "Artist - The Complete LP",
            "Artist - Complete EP",
        ] {
            assert!(is_long_form(t, None, video_kind(t)), "{t}");
        }
        assert!(is_long_form("Busy Making Progress", Some(2070), "other"));
        assert!(!is_long_form("Song", Some(1800), "other"));
        assert!(!is_long_form("Song (Live at Glastonbury)", Some(3600), "live"));
        assert!(is_long_form("Song (Live at Glastonbury)", Some(5401), "live"));
        assert!(!is_long_form("Fuller Album Notes", Some(240), "other"));
        assert!(!is_long_form("Side A Of The Moon", Some(240), "other"));
        assert!(!is_long_form("Complete Control", Some(180), "other"));
        assert!(!is_long_form("Full Moon Fever", Some(200), "other"));
    }

    #[test]
    fn classifies_kind() {
        assert_eq!(video_kind("Pink Floyd - Have A Cigar (Live From The LA Sports Arena, 1975)"), "live");
        assert_eq!(video_kind("Monster Magnet -  Monolithic (live @ With Full Force 2004)"), "live");
        assert_eq!(video_kind("Sneaker Pimps - 6 Underground - Official Video [HD]"), "video");
        assert_eq!(video_kind("Sublime - \"Ensenada\" [Official Music Video]"), "video");
        assert_eq!(video_kind("Go-Go's - Our Lips Are Sealed (Music Video)"), "video");
        assert_eq!(video_kind("Song (Promo)"), "video");
        assert_eq!(video_kind("Song [M/V]"), "video");
        assert_eq!(video_kind("Simple Minds - Street Fighting Years (Live)"), "live");
        assert_eq!(video_kind("The Stone Roses - Breaking into Heaven [Live]"), "live");
        assert_eq!(video_kind("Tom Waits - Goin' Out West [Live - Glitter and Doom] HQ!"), "live");
        assert_eq!(video_kind("Tears For Fears Broken - LIVE"), "live");
        assert_eq!(video_kind("Jimmy Page & The Black Crowes - Live at the Greek"), "live");
        assert_eq!(video_kind("Tears for Fears — The Tipping Point | LIVE Performance | SiriusXM"), "live");
        assert_eq!(video_kind("Regina Spektor - \"How\" LIVE Studio Session + Interview"), "live");
        assert_eq!(video_kind("Fleet Foxes - Mykonos (Live Version)"), "live");
        assert_eq!(video_kind("Khruangbin - Maria También Live on KEXP"), "live");
        assert_eq!(video_kind("Devin Townsend - Deadhead - Empath Live Vol 2 2020"), "live");
        // Song names, not performances.
        assert_eq!(video_kind("Orchestral Manoeuvres In The Dark - The Best Of OMD - 432Hz - Forever Live And Die"), "other");
        assert_eq!(video_kind("Jamie Lidell - \"I Live To Make You Smile\" (Official Video)"), "video");
        assert_eq!(video_kind("Oasis - Live Forever (Official Video)"), "video");
        assert_eq!(video_kind("Wings - Live And Let Die"), "other");
        assert_eq!(video_kind("Beth Orton - Weather Alive"), "other");
        assert_eq!(video_kind("Screaming Trees - Dollar Bill"), "other");
    }

    #[test]
    fn cleans_titles() {
        let a = artist(&["Sneaker Pimps"]);
        assert_eq!(clean_title("Sneaker Pimps - 6 Underground - Official Video [HD]", &a), "6 Underground");
        assert_eq!(clean_title("Sublime - \"Ensenada\" [Official Music Video]", &artist(&["Sublime"])), "Ensenada");
        assert_eq!(
            clean_title("Pink Floyd - Have A Cigar (Live From The LA Sports Arena, 1975)", &artist(&["Pink Floyd"])),
            "Have A Cigar (Live From The LA Sports Arena, 1975)"
        );
        // Leading "The", "&"/"and" and Discogs "(2)" suffixes are ignored when matching.
        assert_eq!(clean_title("Jam - English Rose", &artist(&["The Jam"])), "English Rose");
        assert_eq!(
            clean_title("Jive Bunny and the Mastermixers - Swing The Mood", &artist(&["Jive Bunny & The Mastermixers"])),
            "Swing The Mood"
        );
        assert_eq!(clean_title("Placebo: Pure Morning", &artist(&["Placebo (2)"])), "Pure Morning");
        // Loose match on the joined credit when there is a single separator.
        assert_eq!(
            clean_title(
                "Daryl Hall & John Oates with David Ruffin - The Way You Do The Things You Do",
                &artist(&["Daryl Hall & John Oates"])
            ),
            "The Way You Do The Things You Do"
        );
        // Unrelated left sides stay.
        assert_eq!(
            clean_title("Pink Floyd at Pompeii – MCMLXXII - Echoes", &artist(&["Pink Floyd"])),
            "Pink Floyd at Pompeii – MCMLXXII - Echoes"
        );
        assert_eq!(
            clean_title("Carter U.S.M. - After The Watershed", &artist(&["Carter The Unstoppable Sex Machine"])),
            "Carter U.S.M. - After The Watershed"
        );
        // Tags, tails, quotes.
        assert_eq!(
            clean_title("Red Hot Chili Peppers - Otherside [Official Music Video]", &artist(&["Red Hot Chili Peppers"])),
            "Otherside"
        );
        assert_eq!(
            clean_title("Suddenly Last Summer (Remastered 2002)", &artist(&["The Motels"])),
            "Suddenly Last Summer"
        );
        assert_eq!(clean_title("Tears for Fears — The Tipping Point | LIVE Performance | SiriusXM", &artist(&["Tears For Fears"])), "The Tipping Point");
        assert_eq!(clean_title("Wilco - “Nope”", &artist(&["Wilco"])), "Nope");
        assert_eq!(clean_title("Dead Cross \"Seizure and Desist\"", &artist(&["Dead Cross"])), "Seizure and Desist");
        assert_eq!(clean_title("\"Staring at the Sun\" by TV on the Radio", &artist(&["TV On The Radio"])), "Staring at the Sun");
        assert_eq!(clean_title("XTC   In Loving Memory of a Name", &artist(&["XTC"])), "In Loving Memory of a Name");
        // Bare trailing quality/format tags.
        let numan = artist(&["Gary Numan"]);
        assert_eq!(clean_title("Gary Numan - Cars HD", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars HQ!", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars 4K", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars 1080p HD", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars 720p", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars HD Remaster", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars Official Video", &numan), "Cars");
        assert_eq!(clean_title("Cars Official Music Video", &numan), "Cars");
        assert_eq!(clean_title("Cars Music Video [HD]", &numan), "Cars");
        assert_eq!(clean_title("Tom Waits - Goin' Out West [Live - Glitter and Doom] HQ!", &artist(&["Tom Waits"])), "Goin' Out West [Live - Glitter and Doom]");
        assert_eq!(clean_title("Gary Numan - Cars in HD", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars - FULL HD", &numan), "Cars");
        assert_eq!(clean_title("Gary Numan - Cars [VINYL], HQ", &numan), "Cars [VINYL]");
        // Only whole trailing words go.
        assert_eq!(clean_title("Gary Numan - Shadow", &numan), "Shadow");
        assert_eq!(clean_title("Gary Numan - Orchid", &numan), "Orchid");
        // Lopsided or doubled separators, stray dashes, track numbers, trailing credits.
        assert_eq!(clean_title("Therapy?  - \"Deep Sleep\"", &artist(&["Therapy?"])), "Deep Sleep");
        assert_eq!(clean_title("Stars- One More Night", &artist(&["Stars"])), "One More Night");
        assert_eq!(clean_title("XTC -Seagulls Screaming Kiss Her, Kiss Her -", &artist(&["XTC"])), "Seagulls Screaming Kiss Her, Kiss Her");
        assert_eq!(clean_title("Amplifier - 01. MotorHead", &artist(&["Amplifier"])), "MotorHead");
        assert_eq!(clean_title("Walking Zero - Sneaker Pimps", &a), "Walking Zero");
        assert_eq!(clean_title("Go-Go's - Our Lips Are Sealed", &artist(&["The Go-Go's"])), "Our Lips Are Sealed");
        // Compilations match per-track artists.
        let single = ArtistMatch::new(&["Tori Amos".to_string()], &[]);
        assert_eq!(clean_title("Carter U.S.M. - After The Watershed", &single), "Carter U.S.M. - After The Watershed");
        // Nothing left → raw title.
        assert_eq!(clean_title("(Official Video)", &a), "(Official Video)");
    }

    fn pair(alias: &str, canonical: &str) -> (String, String) {
        (alias.to_string(), canonical.to_string())
    }

    #[test]
    fn compilation_titles_carry_the_track_artist() {
        let various = ArtistMatch::new(
            &["Various".to_string()],
            &[pair("The Cure", "The Cure"), pair("Dave Stewart", "David A. Stewart"), pair("Placebo (2)", "Placebo (2)"), pair("Lemon Jelly*", "Lemon Jelly*")],
        );
        // Track artist matched → canonical name, suffixes cleaned.
        assert_eq!(title_and_credit("The Cure - A Forest", &various), ("A Forest".into(), Some("The Cure".into())));
        assert_eq!(title_and_credit("Dave Stewart - Lily Was Here", &various), ("Lily Was Here".into(), Some("David A. Stewart".into())));
        assert_eq!(title_and_credit("Placebo - Pure Morning", &various), ("Pure Morning".into(), Some("Placebo".into())));
        assert_eq!(title_and_credit("Lemon Jelly - Space Walk", &various), ("Space Walk".into(), Some("Lemon Jelly".into())));
        assert_eq!(title_and_credit("A Forest - The Cure", &various), ("A Forest".into(), Some("The Cure".into())));
        // Unknown artist, single separator on a compilation → taken as the credit.
        assert_eq!(title_and_credit("Tevin Campbell - Just Ask Me", &various), ("Just Ask Me".into(), Some("Tevin Campbell".into())));
        // …unless it doesn't look like an artist.
        assert_eq!(
            title_and_credit("Kill Bill: Vol. 1 (2003) Official Trailer - Uma Thurman", &various).1,
            None
        );
        assert_eq!(title_and_credit("\"Prisoner\" - Spiders From Mars (5/11)", &various).1, None);
        // …and not with more than one separator.
        assert_eq!(
            title_and_credit("Pink Floyd at Pompeii – MCMLXXII - Echoes", &various),
            ("Pink Floyd at Pompeii – MCMLXXII - Echoes".into(), None)
        );
        // Not a compilation: headliner credits are never repeated, unknown left sides stay.
        let single = ArtistMatch::new(&["Eurythmics".to_string()], &[pair("Eurythmics", "Eurythmics"), pair("Annie Lennox", "Annie Lennox")]);
        assert_eq!(title_and_credit("Eurythmics - Love Is A Stranger", &single), ("Love Is A Stranger".into(), None));
        assert_eq!(title_and_credit("Annie Lennox - Why", &single), ("Why".into(), Some("Annie Lennox".into())));
        assert_eq!(title_and_credit("Tevin Campbell - Just Ask Me", &single), ("Tevin Campbell - Just Ask Me".into(), None));
    }

    #[test]
    fn release_videos_filter_dedupe_and_omit_zero_duration() {
        let rec = ReleaseRecord {
            raw_data: json!({ "discogs": { "videos": [
                { "uri": "https://www.youtube.com/watch?v=2eBZqmL8ehg", "title": "Sneaker Pimps - 6 Underground - Official Video [HD]", "description": "", "duration": 236, "embed": true },
                { "uri": "https://www.youtube.com/watch?v=2eBZqmL8ehg", "title": "duplicate", "description": "", "duration": 236, "embed": true },
                { "uri": "https://www.youtube.com/watch?v=AAAAAAAAAAA", "title": "Spin Spin Sugar", "description": "Provided to YouTube by One Little Indian", "duration": 200, "embed": true },
                { "uri": "https://www.youtube.com/watch?v=BBBBBBBBBBB", "title": "Not embeddable", "description": "", "duration": 100, "embed": false },
                { "uri": "https://www.youtube.com/watch?v=CCCCCCCCCCC", "title": "Tesko Suicide", "description": "", "duration": 0, "embed": true },
            ] } }),
            ..Default::default()
        };
        let videos = release_videos(&rec, &artist(&["Sneaker Pimps"]));
        assert_eq!(
            videos,
            vec![
                TvVideo { id: "2eBZqmL8ehg".into(), title: "6 Underground".into(), artist: None, kind: "video", duration: Some(236) },
                TvVideo { id: "CCCCCCCCCCC".into(), title: "Tesko Suicide".into(), artist: None, kind: "other", duration: None },
            ]
        );
        let text = serde_json::to_string(&videos[1]).unwrap();
        assert_eq!(text, r#"{"id":"CCCCCCCCCCC","title":"Tesko Suicide","kind":"other"}"#);
    }
}
