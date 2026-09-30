//! Pressing detail from a Discogs release's `formats[]`: the per-disc format objects (`name`,
//! `qty`, `descriptions`, `text`) and the vinyl colours derived from their `text`.
//!
//! Discogs records a coloured pressing as free text on the format ("Red Smoke, 180 Gram",
//! "Yellow And Black Marble [Memphis Dust]"), so the colour is a heuristic: a comma- or
//! dash-separated segment counts when it names a colour or a pattern, and weights, sleeve and
//! edition notes are left out. The untouched text stays in `format_details` for anything the
//! heuristic misses. Plain black vinyl yields no colour.
//!
//! The source is `raw_data.discogs.formats`, the Discogs array stored as-is.

use std::collections::HashSet;

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};

/// The colour vocabulary, one file shared with the site (`src/lib/vinylLook.ts` draws what this
/// module finds). Embedded at build time, so a change to it needs a rebuild and a
/// `backfill-formats` run.
const VOCAB_JSON: &str = include_str!("../../src/config/vinyl-colours.json");

/// The parts of the vocabulary this module reads.
struct Vocab {
    /// Words that mark a `text` segment as describing the vinyl itself: every colour except the
    /// standard black (plain black is the ordinary pressing, so it only counts alongside a
    /// colour or pattern), plus the glass and finish words.
    colour_words: HashSet<String>,
    /// Prefixes of pattern words (marble, splatter, sparkle…), which also mark a coloured pressing.
    pattern_prefixes: Vec<String>,
    /// Patterns for "coloured" without saying which colour ("Coloured", "Tri-Color").
    generic: Vec<Regex>,
    /// Words that make a segment about the sleeve, labels or an anniversary rather than the vinyl.
    not_vinyl: HashSet<String>,
    /// Words dropped from a kept segment: weights ("180 Gram"), the "Vinyl" suffix and edition
    /// labels, so "Crystal Clear Edition" is the colour "Crystal Clear".
    filler: HashSet<String>,
}

static VOCAB: Lazy<Vocab> = Lazy::new(|| {
    let v: Value = serde_json::from_str(VOCAB_JSON).expect("src/config/vinyl-colours.json is valid JSON");
    let list = |key: &str| -> Vec<String> {
        v[key].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
    };
    let standard = v["standard"].as_str().unwrap_or("black");
    let mut colour_words: HashSet<String> = v["colours"]
        .as_object()
        .map(|o| o.keys().filter(|k| k.as_str() != standard).cloned().collect())
        .unwrap_or_default();
    colour_words.extend(list("glass"));
    colour_words.extend(list("translucent"));
    colour_words.extend(v["flame"]["words"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)));
    let pattern_prefixes = v["patterns"]
        .as_object()
        .map(|o| o.values().flat_map(|p| p.as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from))).collect())
        .unwrap_or_default();
    Vocab {
        colour_words,
        pattern_prefixes,
        generic: list("generic").iter().map(|p| Regex::new(p).expect("generic pattern in vinyl-colours.json")).collect(),
        not_vinyl: list("notVinyl").into_iter().collect(),
        filler: list("filler").into_iter().collect(),
    }
});

fn is_colour_word(part: &str) -> bool {
    VOCAB.colour_words.contains(part)
        || VOCAB.generic.iter().any(|re| re.is_match(part))
        || VOCAB.pattern_prefixes.iter().any(|p| part.starts_with(p.as_str()))
}

/// Lower-case alphanumeric pieces of a word, so "Blue/Black", "Crystal-Clear" and "[Memphis" are
/// checked part by part.
fn parts(word: &str) -> Vec<String> {
    word.split(|c: char| !c.is_alphanumeric()).filter(|p| !p.is_empty()).map(str::to_lowercase).collect()
}

/// A weight such as "180", "180g" or "140gr" (the unit may also be its own word).
fn is_weight(part: &str) -> bool {
    let digits = part.trim_end_matches(|c: char| c.is_alphabetic());
    let unit = &part[digits.len()..];
    !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) && (unit.is_empty() || VOCAB.filler.contains(unit))
}

/// One comma/dash-separated piece of a format's `text`, cleaned up, when it names a colour.
fn colour_segment(segment: &str) -> Option<String> {
    let words: Vec<(&str, Vec<String>)> = segment.split_whitespace().map(|w| (w, parts(w))).collect();
    let any_part = |pred: &dyn Fn(&str) -> bool| words.iter().any(|(_, ps)| ps.iter().any(|p| pred(p)));
    if any_part(&|p| VOCAB.not_vinyl.contains(p)) || !any_part(&is_colour_word) {
        return None;
    }
    let kept: Vec<&str> = words
        .iter()
        .filter(|(_, ps)| !ps.iter().all(|p| VOCAB.filler.contains(p.as_str()) || is_weight(p)))
        .map(|(w, _)| *w)
        .collect();
    (!kept.is_empty()).then(|| kept.join(" "))
}

/// The boundary between separate parenthesised notes, "(180g) (Flame Vinyl)".
static NOTE_BREAK: Lazy<Regex> = Lazy::new(|| Regex::new(r"\)\s*\(").expect("note break pattern"));

/// The colours named in one format's `text`, in order.
fn colours_in_text(text: &str) -> Vec<String> {
    text.split([',', ';'])
        .flat_map(|part| part.split(" - "))
        .flat_map(|part| NOTE_BREAK.split(part))
        .filter_map(colour_segment)
        .collect()
}

/// The colour of the disc(s) one format entry describes. Discogs writes one entry per disc set
/// and its `text` describes a single disc, so the colour parts are one colour, not several:
/// "Yellow, Transparent" is a transparent yellow LP.
fn colour_of_text(text: &str) -> Option<String> {
    let parts = colours_in_text(text);
    (!parts.is_empty()).then(|| parts.join(" "))
}

/// The stored Discogs `formats[]` normalised to the public `format_details` shape:
/// `{ name, qty, descriptions, text, colour }` per format entry (one per disc set), where
/// `colour` is the vinyl colour derived from `text` (null for other formats and uncoloured
/// vinyl). `None` when the release has no stored formats yet, which is how "not backfilled"
/// differs from "no formats".
pub fn details_from_raw(raw_data: &Value) -> Option<Vec<Value>> {
    let formats = raw_data.get("discogs")?.get("formats")?.as_array()?;
    Some(
        formats
            .iter()
            .filter_map(|f| {
                let name = f.get("name")?.as_str()?;
                let qty = match f.get("qty") {
                    Some(Value::String(s)) => s.clone(),
                    Some(Value::Number(n)) => n.to_string(),
                    _ => "1".into(),
                };
                let descriptions: Vec<&str> = f
                    .get("descriptions")
                    .and_then(|d| d.as_array())
                    .map(|d| d.iter().filter_map(|s| s.as_str()).collect())
                    .unwrap_or_default();
                let text = f.get("text").and_then(|t| t.as_str()).map(str::trim).filter(|t| !t.is_empty());
                let colour = if name == "Vinyl" { text.and_then(colour_of_text) } else { None };
                Some(json!({ "name": name, "qty": qty, "descriptions": descriptions, "text": text, "colour": colour }))
            })
            .collect(),
    )
}

/// The colours of a release's vinyl, one per disc set in order, without repeats
/// (case-insensitive). Empty for black vinyl, non-vinyl releases and vinyl whose text names no
/// colour.
pub fn colours_from_details(details: &[Value]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for f in details.iter().filter(|f| f.get("name").and_then(|n| n.as_str()) == Some("Vinyl")) {
        let Some(colour) = f.get("text").and_then(|t| t.as_str()).and_then(colour_of_text) else { continue };
        if !out.iter().any(|c| c.eq_ignore_ascii_case(&colour)) {
            out.push(colour);
        }
    }
    out
}

/// `vinyl_colours` for a release's `raw_data`; empty when nothing is stored or nothing is coloured.
pub fn vinyl_colours(raw_data: &Value) -> Vec<String> {
    details_from_raw(raw_data).map(|d| colours_from_details(&d)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn colours(text: &str) -> Vec<String> {
        let details = vec![json!({ "name": "Vinyl", "qty": "1", "descriptions": [], "text": text })];
        colours_from_details(&details)
    }

    #[test]
    fn plain_colours_pass_through() {
        assert_eq!(colours("Blue"), ["Blue"]);
        assert_eq!(colours("Yellow "), ["Yellow"]);
        assert_eq!(colours("Red Translucent"), ["Red Translucent"]);
        assert_eq!(colours("Coke Bottle Clear"), ["Coke Bottle Clear"]);
        assert_eq!(colours("Coloured"), ["Coloured"]);
    }

    #[test]
    fn weights_sleeves_and_editions_are_dropped() {
        assert_eq!(colours("Red Smoke, 180 Gram"), ["Red Smoke"]);
        assert_eq!(colours("180g, Gatefold"), Vec::<String>::new());
        assert_eq!(colours("White - 25th Anniversary"), ["White"]);
        assert_eq!(colours("Green, 30th Anniversary Edition"), ["Green"]);
        assert_eq!(colours("Orange Opaque, 35th Anniversary"), ["Orange Opaque"]);
        assert_eq!(colours("Silver Anniversary Edition"), Vec::<String>::new());
        assert_eq!(colours("Half Speed Mastered"), Vec::<String>::new());
        assert_eq!(colours("Definitive Edition"), Vec::<String>::new());
        assert_eq!(colours("Expanded Edition, Clear"), ["Clear"]);
        assert_eq!(colours("180 Gram Red"), ["Red"]);
        assert_eq!(colours("Clear, 180g"), ["Clear"]);
    }

    #[test]
    fn vinyl_suffix_and_patterns() {
        assert_eq!(colours("Cloudy Clear Vinyl"), ["Cloudy Clear"]);
        assert_eq!(colours("Yellow And Black Marble [Memphis Dust]"), ["Yellow And Black Marble [Memphis Dust]"]);
        assert_eq!(colours("Black Splatter"), ["Black Splatter"]);
        assert_eq!(colours("Clear With Red Swirl"), ["Clear With Red Swirl"]);
    }

    #[test]
    fn joined_colours_are_split_into_parts() {
        assert_eq!(colours("180g, Crystal-Clear"), ["Crystal-Clear"]);
        assert_eq!(colours("Blue/Black Split"), ["Blue/Black Split"]);
        assert_eq!(colours("Pale-Blue"), ["Pale-Blue"]);
        assert_eq!(colours("Glow-in-the-dark"), ["Glow-in-the-dark"]);
        assert_eq!(colours("Eco-Mix"), ["Eco-Mix"]);
        assert_eq!(colours("180-gram"), Vec::<String>::new());
    }

    #[test]
    fn label_and_cover_colours_are_not_vinyl_colours() {
        assert_eq!(colours("Blue/White Labels"), Vec::<String>::new());
        assert_eq!(colours("Black Labels, 180 Gram"), Vec::<String>::new());
        assert_eq!(colours("CORG - Cyan/Orange/Red/Green Cover"), Vec::<String>::new());
        assert_eq!(colours("Gold Foil Stamp"), Vec::<String>::new());
    }

    #[test]
    fn an_edition_name_around_a_colour_keeps_the_colour() {
        assert_eq!(colours("Crystal Clear Edition"), ["Crystal Clear"]);
        assert_eq!(colours("Cosmic Rainbow Edition"), ["Cosmic Rainbow"]);
        assert_eq!(colours("Sparkle Rainbow Expanded Edition "), ["Sparkle Rainbow"]);
        assert_eq!(colours("Signed Edition, Clear 180g"), ["Clear"]);
    }

    #[test]
    fn the_shared_vocabulary_names_colours_the_site_can_draw() {
        assert_eq!(colours("Pearl Sunrise Coloured"), ["Pearl Sunrise Coloured"]);
        assert_eq!(colours("Sparkle"), ["Sparkle"]);
        assert_eq!(colours("Tri-Color"), ["Tri-Color"]);
        assert_eq!(colours("Emerald [Translucent]"), ["Emerald [Translucent]"]);
        assert_eq!(colours("Crimson Nebula Edition"), ["Crimson Nebula"]);
        // "Tri-Fold" is a sleeve, not a "tri-colour".
        assert_eq!(colours("Tri-Fold"), Vec::<String>::new());
        assert_eq!(colours("180g, Tri-Fold"), Vec::<String>::new());
        // Words that are not in the vocabulary still are not colours.
        assert_eq!(colours("Definitive Edition"), Vec::<String>::new());
        assert_eq!(colours("Independent Record Store Edition"), Vec::<String>::new());
    }

    #[test]
    fn the_vocabulary_file_loads_with_every_list_this_module_needs() {
        assert!(VOCAB.colour_words.contains("red") && VOCAB.colour_words.contains("clear") && VOCAB.colour_words.contains("transparent"));
        assert!(!VOCAB.colour_words.contains("black"), "plain black is not a colour word");
        assert!(!VOCAB.pattern_prefixes.is_empty() && !VOCAB.generic.is_empty());
        assert!(VOCAB.not_vinyl.contains("gatefold") && VOCAB.filler.contains("edition"));
    }

    #[test]
    fn flame_is_a_colour_and_each_parenthesised_note_stands_alone() {
        assert_eq!(colours("Flame Vinyl"), ["Flame"]);
        assert_eq!(colours("Flaming Coloured"), ["Flaming Coloured"]);
        assert_eq!(colours("Yellow Flame"), ["Yellow Flame"]);
        assert_eq!(colours("(30th Anniversary) (180g) (Limited Numbered Edition) (Flame Vinyl)"), ["Flame"]);
        // A flamingo is a colour by way of "neon"/"translucent", not "flame".
        assert!(!VOCAB.colour_words.contains("flamingo"));
    }

    #[test]
    fn black_is_not_a_colour() {
        assert_eq!(colours("Black"), Vec::<String>::new());
        assert_eq!(colours("Black Vinyl, Gatefold"), Vec::<String>::new());
    }

    #[test]
    fn colours_dedupe_across_discs_and_ignore_non_vinyl() {
        let details = vec![
            json!({ "name": "Vinyl", "text": "Red" }),
            json!({ "name": "Vinyl", "text": "yellow" }),
            json!({ "name": "Vinyl", "text": "RED" }),
            json!({ "name": "CD", "text": "Blue" }),
            json!({ "name": "All Media" }),
        ];
        assert_eq!(colours_from_details(&details), ["Red", "yellow"]);
    }

    #[test]
    fn details_normalise_the_stored_discogs_shape() {
        let raw = json!({ "discogs": { "formats": [
            { "name": "Vinyl", "qty": "2", "descriptions": ["LP", "Album"], "text": " Gatefold, 180g " },
            { "name": "Vinyl", "qty": 1 },
            { "name": "Box Set", "text": "" },
            { "qty": "1" },
        ] } });
        let details = details_from_raw(&raw).unwrap();
        assert_eq!(details.len(), 3);
        assert_eq!(details[0], json!({ "name": "Vinyl", "qty": "2", "descriptions": ["LP", "Album"], "text": "Gatefold, 180g", "colour": null }));
        assert_eq!(details[1], json!({ "name": "Vinyl", "qty": "1", "descriptions": [], "text": null, "colour": null }));
        assert_eq!(details[2]["text"], Value::Null);
    }

    #[test]
    fn one_entry_is_one_disc_colour_however_its_text_is_split() {
        // Glastonbury 1994: two LPs, each "colour, finish".
        let raw = json!({ "discogs": { "formats": [
            { "name": "Vinyl", "qty": "1", "descriptions": ["LP"], "text": "Yellow, Transparent" },
            { "name": "Vinyl", "qty": "1", "descriptions": ["LP"], "text": "Blue, Transparent" },
            { "name": "All Media", "qty": "1", "text": "Red" },
        ] } });
        let details = details_from_raw(&raw).unwrap();
        assert_eq!(details[0]["colour"], "Yellow Transparent");
        assert_eq!(details[1]["colour"], "Blue Transparent");
        assert_eq!(details[2]["colour"], Value::Null);
        assert_eq!(colours_from_details(&details), ["Yellow Transparent", "Blue Transparent"]);
        assert_eq!(colours("Clear, Red Splatter"), ["Clear Red Splatter"]);
    }

    #[test]
    fn missing_formats_mean_not_backfilled() {
        assert!(details_from_raw(&json!({})).is_none());
        assert!(details_from_raw(&json!({ "discogs": { "images": [] } })).is_none());
        assert_eq!(details_from_raw(&json!({ "discogs": { "formats": [] } })), Some(vec![]));
        assert!(vinyl_colours(&json!({ "discogs": { "images": [] } })).is_empty());
    }
}
