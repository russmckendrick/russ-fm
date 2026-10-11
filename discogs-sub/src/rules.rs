//! Discogs Release Submission Guidelines (RSG) conventions, as pure functions.
//!
//! Section numbers refer to the RSG at support.discogs.com (General Rules, last updated
//! 2026-06-09).

use once_cell::sync::Lazy;
use regex::Regex;

/// The Discogs format families a draft can target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum, serde::Serialize, serde::Deserialize)]
pub enum Family {
    Vinyl,
    Cd,
    Cassette,
}

impl Family {
    /// The Discogs format name ("Vinyl", "CD", "Cassette").
    pub fn discogs_name(self) -> &'static str {
        match self {
            Family::Vinyl => "Vinyl",
            Family::Cd => "CD",
            Family::Cassette => "Cassette",
        }
    }

    /// True for carriers whose tracklist positions are sides (A1, B1…) — RSG §12.2.3.
    pub fn has_sides(self) -> bool {
        matches!(self, Family::Vinyl | Family::Cassette)
    }

    /// Companies that only describe how *another* carrier was made, so never carry across from
    /// a sibling of a different family.
    fn foreign_companies(self) -> &'static [&'static str] {
        match self {
            Family::Vinyl => &["Glass Mastered At", "Replicated By", "Duplicated By", "Authoring At"],
            Family::Cd => &["Lacquer Cut At", "Plated At", "Duplicated By"],
            Family::Cassette => &["Glass Mastered At", "Replicated By", "Lacquer Cut At", "Plated At", "Authoring At"],
        }
    }

    fn foreign_roles(self) -> &'static [&'static str] {
        match self {
            Family::Vinyl | Family::Cassette => &["5.1", "atmos", "surround", "multichannel", "blu-ray", "dvd"],
            Family::Cd => &["lacquer cut", "5.1", "atmos", "surround", "blu-ray", "dvd"],
        }
    }

    /// Companies tied to the physical manufacture of one specific pressing. Kept when copying
    /// from a same-family sibling but flagged, and dropped across families.
    pub fn is_manufacturing_company(entity: &str) -> bool {
        matches!(
            entity,
            "Pressed By" | "Manufactured By" | "Made By" | "Printed By" | "Lacquer Cut At" | "Plated At" | "Glass Mastered At"
        )
    }

    /// True when a company entity (e.g. "Glass Mastered At") cannot apply to this family.
    pub fn rejects_company(self, entity: &str) -> bool {
        self.foreign_companies().contains(&entity)
    }

    /// True when a credit role (e.g. "Mixed By [5.1 And Dolby Atmos Mixes By]") is about a
    /// carrier this family doesn't have.
    pub fn rejects_role(self, role: &str) -> bool {
        let r = role.to_lowercase();
        self.foreign_roles().iter().any(|f| r.contains(f))
    }
}

/// RSG §1.2.1: "the First Letter Of Each Word Is Capitalized" — every word, including "Of",
/// "The" and "A". Only the first letter is touched, so acronyms, Roman numerals and names like
/// "McCartney" survive. Also applies §1.2.4 (typewriter apostrophe).
pub fn discogs_case(s: &str) -> String {
    let s = s.replace(['\u{2019}', '\u{2018}'], "'");
    let mut out = String::with_capacity(s.len());
    let mut at_word_start = true;
    for ch in s.chars() {
        if at_word_start && ch.is_alphabetic() {
            out.extend(ch.to_uppercase());
            at_word_start = false;
        } else {
            out.push(ch);
            if ch.is_whitespace() || matches!(ch, '(' | '[' | '"' | '/' | '-') {
                at_word_start = true;
            } else if ch.is_alphanumeric() || ch == '\'' {
                at_word_start = false;
            }
        }
    }
    out
}

/// Milliseconds → RSG §12.6.1 duration (`m:ss`, or `h:mm:ss` past the hour).
pub fn duration(ms: u64) -> String {
    let secs = (ms + 500) / 1000;
    let (h, m, s) = (secs / 3600, (secs % 3600) / 60, secs % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

/// `m:ss` / `h:mm:ss` → seconds.
pub fn parse_duration(s: &str) -> Option<u64> {
    let parts: Vec<u64> = s.trim().split(':').map(|p| p.parse().ok()).collect::<Option<_>>()?;
    match parts.as_slice() {
        [m, s] => Some(m * 60 + s),
        [h, m, s] => Some(h * 3600 + m * 60 + s),
        _ => None,
    }
}

/// Lower-case alphanumerics only, with "&" read as "and" — for matching titles across sources
/// ("Clowns and Jugglers = The Songs of Syd Barrett" ≡ "Clowns And Jugglers (The Songs Of Syd
/// Barrett)").
pub fn norm(s: &str) -> String {
    s.to_lowercase().replace('&', "and").chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Track titles without the version qualifiers streaming services append
/// ("Still Living - 2026 Remaster", "Love You (Live)") so they line up with the sleeve.
pub fn norm_track(s: &str) -> String {
    static QUALIFIER: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo).*$").unwrap());
    norm(&QUALIFIER.replace(s, ""))
}

/// Side letters for `count` sides: A, B, C…
pub fn side_letter(i: usize) -> char {
    (b'A' + (i as u8 % 26)) as char
}

/// How many LPs a running time needs when nothing better is known: one up to 50 minutes,
/// then roughly 22 minutes a side.
pub fn guess_lp_count(total_secs: u64) -> usize {
    if total_secs == 0 || total_secs <= 50 * 60 {
        1
    } else {
        total_secs.div_ceil(44 * 60) as usize
    }
}

/// Split tracks (in order) across `sides`, minimising the longest side. Unknown durations count
/// as the average. Returns the number of tracks on each side.
pub fn split_sides(durations: &[Option<u64>], sides: usize) -> Vec<usize> {
    let n = durations.len();
    let sides = sides.clamp(1, n.max(1));
    if n == 0 {
        return vec![0; sides];
    }
    let known: Vec<u64> = durations.iter().flatten().copied().collect();
    let avg = if known.is_empty() { 240 } else { known.iter().sum::<u64>() / known.len() as u64 };
    let d: Vec<u64> = durations.iter().map(|x| x.unwrap_or(avg)).collect();
    let mut prefix = vec![0u64; n + 1];
    for i in 0..n {
        prefix[i + 1] = prefix[i] + d[i];
    }
    // best[k][i] = minimal max-side for the first i tracks over k sides (each side ≥ 1 track).
    let inf = u64::MAX;
    let mut best = vec![vec![inf; n + 1]; sides + 1];
    let mut cut = vec![vec![0usize; n + 1]; sides + 1];
    best[0][0] = 0;
    for k in 1..=sides {
        for i in k..=n {
            for j in (k - 1)..i {
                if best[k - 1][j] == inf {
                    continue;
                }
                let cost = best[k - 1][j].max(prefix[i] - prefix[j]);
                if cost < best[k][i] {
                    best[k][i] = cost;
                    cut[k][i] = j;
                }
            }
        }
    }
    let mut counts = vec![0; sides];
    let mut i = n;
    for k in (1..=sides).rev() {
        let j = cut[k][i];
        counts[k - 1] = i - j;
        i = j;
    }
    counts
}

/// Positions for tracks laid out `counts` per side: A1, A2, B1… (RSG §12.2.9; multiple LPs
/// continue the letters).
pub fn side_positions(counts: &[usize]) -> Vec<String> {
    counts
        .iter()
        .enumerate()
        .flat_map(|(side, &n)| (1..=n).map(move |t| format!("{}{t}", side_letter(side))))
        .collect()
}

/// Positions for discs: `1, 2…` for a single disc, `1-1, 1-2, 2-1…` for several (§12.2.9).
pub fn disc_positions(discs: &[usize]) -> Vec<String> {
    let multi = discs.iter().filter(|d| **d > 0).count() > 1;
    discs
        .iter()
        .enumerate()
        .flat_map(|(disc, &n)| {
            (1..=n).map(move |t| if multi { format!("{}-{t}", disc + 1) } else { t.to_string() })
        })
        .collect()
}

pub fn digits(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// The usual printed spacing of a barcode (RSG §5.2.a wants it exactly as printed, so this is a
/// starting point to check against the sleeve): UPC-A `1 99584 52211 1`, EAN-13 `5 060966 702528`.
pub fn printed_barcode(code: &str) -> String {
    let d = digits(code);
    match d.len() {
        12 => format!("{} {} {} {}", &d[..1], &d[1..6], &d[6..11], &d[11..]),
        13 => format!("{} {} {}", &d[..1], &d[1..7], &d[7..]),
        _ => code.trim().to_string(),
    }
}

/// Labels such as Sony number their catalogue with the barcode minus its check digit
/// (barcode `199584522111` → catno `19958452211`), so each colour variant has its own. When a
/// sibling's catno follows that pattern, derive ours from our barcode.
pub fn derive_catno(sibling_catno: &str, sibling_barcode: &str, our_barcode: &str) -> Option<String> {
    let (cat, sib, ours) = (digits(sibling_catno), digits(sibling_barcode), digits(our_barcode));
    if cat.len() < 8 || sib.len() < 12 || ours.len() != sib.len() || cat != sib[..sib.len() - 1] {
        return None;
    }
    (cat.len() == sibling_catno.trim().len()).then(|| ours[..ours.len() - 1].to_string())
}

/// Release-level credit `tracks` strings ("A1 to A3, B2") remapped through `map` (old position
/// → new position). Pieces that don't map are dropped; `None` when nothing maps (the credit
/// only covered tracks this release doesn't have). An empty string means "all tracks".
pub fn remap_tracks(tracks: &str, map: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    if tracks.trim().is_empty() {
        return Some(String::new());
    }
    let mut out = Vec::new();
    for piece in tracks.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        if let Some((a, b)) = piece.split_once(" to ") {
            if let (Some(a), Some(b)) = (map(a.trim()), map(b.trim())) {
                out.push(format!("{a} to {b}"));
            }
        } else if let Some(p) = map(piece) {
            out.push(p);
        }
    }
    (!out.is_empty()).then(|| out.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capitalises_every_word() {
        assert_eq!(discogs_case("Hold the Ashes"), "Hold The Ashes");
        assert_eq!(discogs_case("who wants it?"), "Who Wants It?");
        assert_eq!(discogs_case("don’t stop (live at the BBC)"), "Don't Stop (Live At The BBC)");
        assert_eq!(discogs_case("McCartney II"), "McCartney II");
    }

    #[test]
    fn formats_durations() {
        assert_eq!(duration(263_000), "4:23");
        assert_eq!(duration(3_725_000), "1:02:05");
        assert_eq!(parse_duration("7:16"), Some(436));
    }

    #[test]
    fn splits_sides_by_running_time() {
        let d: Vec<Option<u64>> = [263, 263, 350, 202, 382, 397, 318, 256, 436].iter().map(|s| Some(*s)).collect();
        let counts = split_sides(&d, 2);
        assert_eq!(counts.iter().sum::<usize>(), 9);
        assert_eq!(side_positions(&counts)[0], "A1");
        assert_eq!(side_positions(&[2, 1, 1, 1]), ["A1", "A2", "B1", "C1", "D1"]);
        assert_eq!(disc_positions(&[2, 1]), ["1-1", "1-2", "2-1"]);
    }

    #[test]
    fn barcode_and_catno() {
        assert_eq!(printed_barcode("199584522111"), "1 99584 52211 1");
        assert_eq!(printed_barcode("5060966702528"), "5 060966 702528");
        assert_eq!(derive_catno("19958452211", "1 99584 52211 1", "199584675817"), Some("19958467581".into()));
        assert_eq!(derive_catno("IOM773", "199584522111", "199584675817"), None);
    }

    #[test]
    fn remaps_credit_tracks() {
        let map = |p: &str| match p {
            "CD1-1" => Some("A1".to_string()),
            "CD1-3" => Some("A3".to_string()),
            _ => None,
        };
        assert_eq!(remap_tracks("CD1-1 to CD1-3, BD-1", &map), Some("A1 to A3".into()));
        assert_eq!(remap_tracks("BD-1", &map), None);
        assert_eq!(remap_tracks("", &map), Some(String::new()));
    }
}
