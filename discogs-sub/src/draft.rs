//! The draft: a new Discogs release shaped like the Discogs API's release JSON, plus provenance
//! flags and the edit list for starting from a sibling with "Copy to Draft".

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::rules::{self, norm, norm_track, Family};
use crate::sources::{Gathered, RefAlbum};

// ── Model ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Credit {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    #[serde(default)]
    pub anv: String,
    #[serde(default)]
    pub join: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub tracks: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Label {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    #[serde(default)]
    pub catno: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Company {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    #[serde(default)]
    pub entity_type_name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Format {
    pub name: String,
    pub qty: String,
    #[serde(default)]
    pub descriptions: Vec<String>,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Identifier {
    #[serde(rename = "type")]
    pub kind: String,
    pub value: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Track {
    pub position: String,
    #[serde(default = "track_type")]
    pub type_: String,
    pub title: String,
    #[serde(default)]
    pub duration: String,
    /// Durations from other releases (MusicBrainz / Apple Music / Spotify). RSG §12.6.4 forbids
    /// transferring them, so they only reach `duration` with `--fill-durations`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reference_durations: Vec<(String, String)>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artists: Vec<Credit>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extraartists: Vec<Credit>,
}

fn track_type() -> String {
    "track".into()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    /// Must be filled from the record in hand before submitting.
    Todo,
    /// Pre-filled from another source — check it against the record.
    Verify,
}

#[derive(Debug, Clone, Serialize)]
pub struct Flag {
    pub level: Level,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SiblingRef {
    pub id: u64,
    pub url: String,
    pub summary: String,
}

/// Facts about the copy in hand, from flags or interactive prompts.
#[derive(Debug, Clone, Default, Serialize)]
pub struct InHand {
    pub barcode: Option<String>,
    pub colour: Option<String>,
    pub weight: Option<String>,
    pub limited: Option<bool>,
    pub numbered: bool,
    pub lps: Option<usize>,
    pub sides: Option<Vec<usize>>,
    /// (side letter, runout text).
    pub matrix: Vec<(String, String)>,
    pub notes: Option<String>,
    pub fill_durations: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Draft {
    pub generated_at: String,
    pub query: Query,
    pub base: Option<SiblingRef>,
    pub credits_from: Option<SiblingRef>,
    pub master_id: Option<String>,

    pub artists: Vec<Credit>,
    pub title: String,
    pub labels: Vec<Label>,
    pub formats: Vec<Format>,
    pub country: String,
    pub released: String,
    pub genres: Vec<String>,
    pub styles: Vec<String>,
    pub tracklist: Vec<Track>,
    pub extraartists: Vec<Credit>,
    pub companies: Vec<Company>,
    pub identifiers: Vec<Identifier>,
    pub notes: String,
    pub submission_notes: String,

    pub flags: Vec<Flag>,
    /// What to change after "Copy to Draft" of `base`.
    pub copy_to_draft_edits: Vec<String>,
    pub hints: Vec<String>,
    pub siblings: Vec<SiblingRef>,
    pub references: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Query {
    pub artist: String,
    pub title: String,
    pub family: Family,
    pub in_hand: InHand,
}

/// (source, [(normalised title, duration ms)]) — one reference tracklist for duration lookups.
type TimedTracks = (String, Vec<(String, Option<u64>)>);

// ── Discogs JSON helpers ────────────────────────────────────────────────────────────────────

fn parse<T: for<'de> Deserialize<'de>>(v: &Value, key: &str) -> Vec<T> {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| serde_json::from_value(x.clone()).ok()).collect()).unwrap_or_default()
}

fn str_of(v: &Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").trim().to_string()
}

fn release_id(v: &Value) -> u64 {
    v.get("id").and_then(|i| i.as_u64()).unwrap_or(0)
}

fn release_family(v: &Value) -> Option<String> {
    v.pointer("/formats/0/name").and_then(|n| n.as_str()).map(String::from)
}

fn formats_summary(v: &Value) -> String {
    parse::<Format>(v, "formats")
        .iter()
        .map(|f| {
            let mut s = format!("{}× {}", f.qty, f.name);
            if !f.descriptions.is_empty() {
                s.push_str(&format!(" ({})", f.descriptions.join(", ")));
            }
            if !f.text.is_empty() {
                s.push_str(&format!(" \"{}\"", f.text));
            }
            s
        })
        .collect::<Vec<_>>()
        .join(" + ")
}

fn sibling_ref(v: &Value) -> SiblingRef {
    let id = release_id(v);
    let barcode = parse::<Identifier>(v, "identifiers").into_iter().find(|i| i.kind == "Barcode").map(|i| format!(", barcode {}", i.value)).unwrap_or_default();
    SiblingRef {
        id,
        url: format!("https://www.discogs.com/release/{id}"),
        summary: format!("{} — {}, {}{barcode}", str_of(v, "title"), formats_summary(v), str_of(v, "country")),
    }
}

fn is_dud(v: &Value) -> bool {
    let f = formats_summary(v).to_lowercase();
    f.contains("test pressing") || f.contains("promo") || f.contains("unofficial") || f.contains("cdr")
}

fn credit_count(v: &Value) -> usize {
    let tracks: Vec<Track> = parse(v, "tracklist");
    parse::<Credit>(v, "extraartists").len() + tracks.iter().map(|t| t.extraartists.len()).sum::<usize>()
}

fn richness(v: &Value) -> usize {
    let tracks: Vec<Track> = parse(v, "tracklist");
    tracks.len()
        + tracks.iter().filter(|t| !t.duration.is_empty()).count()
        + 2 * credit_count(v)
        + parse::<Company>(v, "companies").len()
        + parse::<Identifier>(v, "identifiers").len()
        + if str_of(v, "notes").is_empty() { 0 } else { 3 }
}

fn media_count(v: &Value) -> usize {
    parse::<Format>(v, "formats").iter().filter(|f| f.name != "All Media").map(|f| f.qty.parse::<usize>().unwrap_or(1)).sum()
}

// ── Build ───────────────────────────────────────────────────────────────────────────────────

pub fn build(g: &Gathered, q: Query, base_override: Option<u64>) -> Draft {
    let family = q.family;
    let fam_name = family.discogs_name();
    let hand = q.in_hand.clone();
    let mut flags: Vec<Flag> = Vec::new();
    let mut hints: Vec<String> = Vec::new();
    let mut flag = |level, field: &str, message: String| flags.push(Flag { level, field: field.into(), message });

    let usable: Vec<&Value> = g.siblings.iter().filter(|s| !is_dud(s) || Some(release_id(s)) == base_override).collect();
    let same: Vec<&Value> = usable.iter().copied().filter(|s| release_family(s).as_deref() == Some(fam_name)).collect();

    // Base = the release we'd "Copy to Draft": same family and richest, else the plainest
    // (fewest media — not the deluxe box) of another family.
    // Market of our copy, when MusicBrainz knows its barcode — prefer a sibling of the same market.
    let our_country = hand.barcode.as_ref().and_then(|b| {
        let b = rules::digits(b);
        g.mb_variants.iter().find(|v| v.barcode.as_deref().map(rules::digits) == Some(b.clone())).and_then(|v| v.country.clone())
    });
    let market = our_country.as_deref().map(discogs_country);
    let base: Option<&Value> = base_override
        .and_then(|id| g.siblings.iter().find(|s| release_id(s) == id))
        .or_else(|| same.iter().copied().max_by_key(|s| (market.is_some_and(|m| str_of(s, "country") == m), richness(s))))
        .or_else(|| usable.iter().copied().min_by_key(|s| (media_count(s), usize::MAX - richness(s))));
    let same_family = base.map(|b| release_family(b).as_deref() == Some(fam_name)).unwrap_or(false);

    // Credits come from the base when it has any, else the sibling with the most.
    let credits_src: Option<&Value> = match base {
        Some(b) if credit_count(b) > 0 => Some(b),
        _ => usable.iter().copied().filter(|s| credit_count(s) > 0).max_by_key(|s| credit_count(s)),
    };

    let refs = g.references();
    // Reference used for titles/order when Discogs has nothing: MB of our family, then Spotify
    // (per-track artists), Apple, any MB.
    let primary_ref: Option<&RefAlbum> = g
        .mb
        .as_ref()
        .filter(|m| m.is_family(family))
        .or(g.spotify.as_ref())
        .or(g.apple.as_ref())
        .or(g.mb.as_ref());

    // ── Artists & title
    let (artists, title) = match base {
        Some(b) => (parse::<Credit>(b, "artists"), str_of(b, "title")),
        None => {
            let name = primary_ref.map(|r| r.artist.clone()).unwrap_or_else(|| q.artist.clone());
            let name = if norm(&name) == "variousartists" { "Various".to_string() } else { rules::discogs_case(&name) };
            flag(Level::Verify, "artists", format!("\"{name}\" is not linked to a Discogs artist yet — pick the existing artist page in the form (add an ANV only if the printed name differs beyond capitalisation, §2.5.5)."));
            (vec![Credit { name, ..Default::default() }], rules::discogs_case(primary_ref.map(|r| r.title.as_str()).unwrap_or(&q.title)))
        }
    };

    // ── Tracklist
    let mut tracklist: Vec<Track>;
    let src_tracks: Vec<Track> = base.map(|b| parse(b, "tracklist")).unwrap_or_default();
    let mut positions_guessed = false;
    if same_family && !src_tracks.is_empty() {
        tracklist = src_tracks.clone();
    } else {
        // Tracks only (headings like "Far And Wide - Instrumentals" belong to the other carrier).
        tracklist = if !src_tracks.is_empty() {
            src_tracks.iter().filter(|t| t.type_ != "heading").cloned().collect()
        } else if let Some(r) = primary_ref {
            r.tracks
                .iter()
                .map(|t| Track {
                    position: t.position.clone(),
                    type_: "track".into(),
                    title: rules::discogs_case(&t.title),
                    artists: t.artists.iter().map(|a| Credit { name: a.clone(), join: ",".into(), ..Default::default() }).collect(),
                    ..Default::default()
                })
                .collect()
        } else {
            Vec::new()
        };
        if !tracklist.is_empty() {
            positions_guessed = reposition(&mut tracklist, family, &hand, g, &mut hints);
        }
    }
    if tracklist.is_empty() {
        flag(Level::Todo, "tracklist", "No tracklist found anywhere — enter it from the labels/sleeve.".into());
    }

    for t in tracklist.iter_mut() {
        t.title = t.title.trim().to_string();
    }

    // Reference durations, matched by title then by order: MusicBrainz / Apple Music / Spotify,
    // then any other Discogs version with printed times (e.g. the CD).
    let mut flat_refs: Vec<TimedTracks> = refs
        .iter()
        .map(|r| (r.source.to_string(), r.tracks.iter().map(|t| (norm_track(&t.title), t.duration_ms)).collect()))
        .collect();
    for s in usable.iter().filter(|s| !(same_family && base.map(release_id) == Some(release_id(s)))) {
        let timed: Vec<(String, Option<u64>)> = parse::<Track>(s, "tracklist")
            .iter()
            .filter(|t| t.type_ == "track")
            .map(|t| (norm_track(&t.title), rules::parse_duration(&t.duration).map(|d| d * 1000)))
            .collect();
        if timed.iter().any(|(_, d)| d.is_some()) {
            flat_refs.push((format!("r{}", release_id(s)), timed));
        }
    }
    let n_tracks = tracklist.iter().filter(|t| t.type_ == "track").count();
    for (idx, t) in tracklist.iter_mut().filter(|t| t.type_ == "track").enumerate() {
        let key = norm_track(&t.title);
        for (source, rt) in &flat_refs {
            let hit = rt.iter().find(|(k, _)| *k == key).or_else(|| (rt.len() == n_tracks).then(|| &rt[idx]));
            if let Some((_, Some(ms))) = hit {
                let d = rules::duration(*ms);
                // One entry per distinct time is enough once several Discogs versions agree.
                if !(source.starts_with('r') && t.reference_durations.iter().any(|(s, x)| s.starts_with('r') && *x == d)) {
                    t.reference_durations.push((source.clone(), d));
                }
            }
        }
    }
    let printed_durations = tracklist.iter().any(|t| !t.duration.is_empty());
    let mut durations_note = None;
    if printed_durations {
        if !same_family {
            for t in &mut tracklist {
                t.duration.clear();
            }
            flag(Level::Todo, "tracklist", "Durations on the copied tracks came from a different carrier and were cleared (§12.6.4) — enter them only if printed on your copy.".into());
        } else {
            flag(Level::Verify, "tracklist", "Durations come from the sibling release — keep them only if they are printed on your copy.".into());
        }
    }
    if !tracklist.iter().any(|t| !t.duration.is_empty()) {
        if hand.fill_durations {
            let mut used = Vec::new();
            for t in &mut tracklist {
                if let Some((src, d)) = t.reference_durations.first() {
                    t.duration = d.clone();
                    let src = if src.starts_with('r') { format!("Discogs {src} (another version)") } else { src.clone() };
                    if !used.contains(&src) {
                        used.push(src);
                    }
                }
            }
            durations_note = Some(format!(
                "Track durations are not printed on the release; taken from the {} listing of this album.",
                used.join(" / ")
            ));
            flag(Level::Verify, "tracklist", "Durations filled from streaming/MusicBrainz data (--fill-durations). RSG §12.6.4 says timings should come from this exact release — time the sides if you can; the Submission Notes say where they came from.".into());
        } else if tracklist.iter().any(|t| !t.reference_durations.is_empty()) {
            flag(Level::Todo, "tracklist", "Durations left blank (RSG §12.6.4: no transferring timings between releases). Reference times are listed beside each track; rerun with --fill-durations to use them with a Submission Notes line.".into());
        }
    }
    if positions_guessed {
        flag(Level::Todo, "tracklist", "Side layout is a guess balanced by running time — check the labels and fix positions, or rerun with --sides 5,4.".into());
    }

    // Old position → new position (via title), for remapping credit `tracks` strings.
    let credits_tracks: Vec<Track> = credits_src.map(|c| parse(c, "tracklist")).unwrap_or_default();
    let new_by_title: Vec<(String, String)> = tracklist.iter().filter(|t| t.type_ == "track").map(|t| (norm(&t.title), t.position.clone())).collect();
    let pos_map = |old: &str| -> Option<String> {
        let title = credits_tracks.iter().find(|t| t.position == old).map(|t| norm(&t.title))?;
        new_by_title.iter().find(|(k, _)| *k == title).map(|(_, p)| p.clone())
    };

    // Track artists / track credits from the credits source when the base had none.
    if let Some(cs) = credits_src {
        if base.map(release_id) != Some(release_id(cs)) {
            for t in tracklist.iter_mut() {
                if let Some(src) = credits_tracks.iter().find(|s| norm(&s.title) == norm(&t.title)) {
                    if t.artists.is_empty() {
                        t.artists = src.artists.clone();
                    }
                    if t.extraartists.is_empty() {
                        t.extraartists = src.extraartists.iter().filter(|c| !family.rejects_role(&c.role)).cloned().collect();
                    }
                }
            }
        }
    }

    // ── Credits
    let mut extraartists = Vec::new();
    let mut dropped_credits = Vec::new();
    for c in credits_src.map(|c| parse::<Credit>(c, "extraartists")).unwrap_or_default() {
        if family.rejects_role(&c.role) {
            dropped_credits.push(format!("{} ({})", c.name, c.role));
            continue;
        }
        match rules::remap_tracks(&c.tracks, &pos_map) {
            Some(tracks) => extraartists.push(Credit { tracks, ..c }),
            None => dropped_credits.push(format!("{} ({}, tracks {})", c.name, c.role, c.tracks)),
        }
    }
    if let Some(cs) = credits_src {
        let r = sibling_ref(cs);
        flag(Level::Verify, "credits", format!(
            "{} credits copied from r{} ({}). RSG §10.7.2/§1.5.5: delete every credit not printed on your copy.",
            extraartists.len(), r.id, formats_summary(cs)
        ));
    } else {
        flag(Level::Todo, "credits", "No credits on any Discogs version — add the ones printed on your sleeve/labels.".into());
    }
    if !dropped_credits.is_empty() {
        hints.push(format!("Credits not carried over (other carrier or tracks): {}", dropped_credits.join("; ")));
    }

    // External credit hints (never auto-added: §10.7.1 needs [Uncredited] + a source).
    for r in &refs {
        let mut writers: Vec<String> = r.tracks.iter().flat_map(|t| t.composers.clone()).collect();
        writers.sort();
        writers.dedup();
        if !writers.is_empty() {
            hints.push(format!("{} lists writers: {} — add as Written-By only if printed; otherwise as \"Written-By [Uncredited]\" with {} named in Submission Notes (§10.7.1).", r.source, writers.join(", "), r.source));
        }
        if !r.credits.is_empty() {
            hints.push(format!("{} release credits: {}", r.source, r.credits.iter().map(|(role, n)| format!("{n} ({role})")).collect::<Vec<_>>().join(", ")));
        }
    }

    // ── Various check (§2.3.1)
    let with_track_artist = tracklist.iter().filter(|t| !t.artists.is_empty()).count();
    if with_track_artist * 2 > n_tracks.max(1) && !artists.iter().any(|a| a.name == "Various") {
        flag(Level::Verify, "artists", format!(
            "{with_track_artist} of {n_tracks} tracks credit their own artists. RSG §2.3.1: use \"Various\" as the main artist when no one is billed as main artist on the cover."
        ));
    }

    // ── Companies
    let company_src = base.filter(|b| !parse::<Company>(b, "companies").is_empty()).or(credits_src);
    let mut companies = Vec::new();
    for c in company_src.map(|c| parse::<Company>(c, "companies")).unwrap_or_default() {
        if family.rejects_company(&c.entity_type_name) {
            continue;
        }
        if !same_family && Family::is_manufacturing_company(&c.entity_type_name) {
            continue;
        }
        companies.push(c);
    }
    if companies.iter().any(|c| Family::is_manufacturing_company(&c.entity_type_name)) {
        flag(Level::Verify, "companies", "Pressing/printing companies are specific to each pressing — keep only those printed on your copy.".into());
    }
    for r in &refs {
        for (kind, text) in &r.copyrights {
            hints.push(format!("{} {} line: \"{}\" → Companies: {} — only if printed on the sleeve.", r.source, kind, text, if kind == "P" { "Phonographic Copyright (p)" } else { "Copyright (c)" }));
        }
    }

    // ── Labels (catno per variant where the label numbers by barcode)
    let mut labels: Vec<Label> = base.map(|b| parse(b, "labels")).unwrap_or_default();
    let base_barcode = base.and_then(|b| parse::<Identifier>(b, "identifiers").into_iter().find(|i| i.kind == "Barcode")).map(|i| i.value);
    if let (Some(bb), Some(ours)) = (&base_barcode, &hand.barcode) {
        for l in labels.iter_mut() {
            if let Some(cat) = rules::derive_catno(&l.catno, bb, ours) {
                flag(Level::Verify, "labels", format!("{} catno changed {} → {cat} (this label numbers each variant by its barcode).", l.name, l.catno));
                l.catno = cat;
            }
        }
    }
    if labels.is_empty() {
        let name = refs.iter().find_map(|r| r.label.clone()).unwrap_or_default();
        flag(Level::Todo, "labels", format!("Enter the label and catalogue number exactly as printed (\"none\" if there is no number, §4.7.2). Streaming label: \"{name}\"."));
        if !name.is_empty() {
            labels.push(Label { name, id: None, catno: String::new() });
        }
    } else if !same_family {
        flag(Level::Verify, "labels", "Catalogue numbers copied from a different carrier — vinyl usually has its own (e.g. …LP vs …CD).".into());
    }

    // ── Formats
    let base_formats: Vec<Format> = base.map(|b| parse(b, "formats")).unwrap_or_default();
    let kind_desc: Vec<String> = base_formats
        .iter()
        .flat_map(|f| f.descriptions.clone())
        .filter(|d| matches!(d.as_str(), "Album" | "Compilation" | "EP" | "Mini-Album" | "Single"))
        .take(1)
        .collect();
    let mut formats: Vec<Format> = if same_family {
        base_formats.iter().filter(|f| f.name == fam_name || f.name == "All Media").cloned().collect()
    } else {
        let medium = match family {
            Family::Vinyl => vec!["LP".to_string()],
            _ => vec![],
        };
        let count = match family {
            Family::Vinyl => hand.lps.unwrap_or_else(|| tracklist_side_count(&tracklist).div_ceil(2).max(1)),
            _ => 1,
        };
        // §6.1.2: multiple LPs are entered expanded, one "1 × LP" row each.
        (0..count)
            .map(|_| Format { name: fam_name.into(), qty: "1".into(), descriptions: [medium.clone(), kind_desc.clone()].concat(), text: String::new() })
            .collect()
    };
    if formats.is_empty() {
        formats.push(Format { name: fam_name.into(), qty: "1".into(), descriptions: kind_desc.clone(), text: String::new() });
    }
    let sibling_text: Vec<String> = formats.iter().map(|f| f.text.clone()).filter(|t| !t.is_empty()).collect();
    let free_text = [hand.colour.clone(), hand.weight.clone()].into_iter().flatten().collect::<Vec<_>>().join(", ");
    for f in formats.iter_mut().filter(|f| f.name == fam_name) {
        f.text = free_text.clone();
        if let Some(limited) = hand.limited {
            f.descriptions.retain(|d| d != "Limited Edition");
            if limited {
                f.descriptions.push("Limited Edition".into());
            }
        }
        if hand.numbered && !f.descriptions.iter().any(|d| d == "Numbered") {
            f.descriptions.push("Numbered".into());
        }
    }
    if family == Family::Vinyl && hand.colour.is_none() {
        flag(Level::Todo, "formats", format!(
            "Enter your vinyl colour in the format free text, most distinctive word first (§6.1.5, §6.1.7){}. Leave it empty for black.",
            if sibling_text.is_empty() { String::new() } else { format!(" — the sibling's was \"{}\"", sibling_text.join(", ")) }
        ));
    }
    if hand.limited.is_none() && formats.iter().any(|f| f.descriptions.iter().any(|d| d == "Limited Edition")) {
        flag(Level::Verify, "formats", "\"Limited Edition\" came from the sibling — keep it only if printed on your copy or stated by the label (§6.11.1).".into());
    }

    // ── Identifiers: never copy a sibling's barcode or runouts.
    let mut identifiers = Vec::new();
    match &hand.barcode {
        Some(b) => {
            identifiers.push(Identifier { kind: "Barcode".into(), value: rules::printed_barcode(b), description: "Printed".into() });
            identifiers.push(Identifier { kind: "Barcode".into(), value: rules::digits(b), description: "Scanned".into() });
            flag(Level::Verify, "identifiers", "Printed barcode spacing is the usual pattern — match it to the sleeve exactly (§5.2.a).".into());
        }
        None => flag(Level::Todo, "identifiers", "Add the barcode as printed (with its spaces) and as scanned (§5.2.a).".into()),
    }
    let side_letters = sides_of(&tracklist);
    for side in &side_letters {
        match hand.matrix.iter().find(|(s, _)| s.eq_ignore_ascii_case(side)) {
            Some((_, text)) => identifiers.push(Identifier { kind: "Matrix / Runout".into(), value: text.clone(), description: format!("Side {side} runout") }),
            None if family.has_sides() => {
                identifiers.push(Identifier { kind: "Matrix / Runout".into(), value: String::new(), description: format!("Side {side} runout") });
            }
            None => {}
        }
    }
    if family.has_sides() && hand.matrix.len() < side_letters.len() {
        flag(Level::Todo, "identifiers", "Copy each side's runout verbatim — same capitalisation, one space per gap, [describe] symbols (§5.2.o).".into());
    }
    let mut runout_examples = Vec::new();
    for s in same.iter() {
        for i in parse::<Identifier>(s, "identifiers") {
            match i.kind.as_str() {
                "Rights Society" | "Label Code" if !identifiers.iter().any(|x| x.kind == i.kind && x.value == i.value) => {
                    identifiers.push(i.clone());
                    flag(Level::Verify, "identifiers", format!("{} \"{}\" copied from a sibling — keep only if printed on yours.", i.kind, i.value));
                }
                "Matrix / Runout" if runout_examples.len() < 2 => runout_examples.push(format!("{} — {} (r{})", i.description, i.value, release_id(s))),
                _ => {}
            }
        }
    }
    if !runout_examples.is_empty() {
        hints.push(format!("Sibling runouts, for the pattern to look for (yours will differ): {}", runout_examples.join("; ")));
    }

    // ── Country, date, genres
    let country = base.map(|b| str_of(b, "country")).unwrap_or_default();
    let released = base.map(|b| str_of(b, "released")).unwrap_or_default();
    if !country.is_empty() {
        flag(Level::Verify, "country", format!(
            "\"{country}\" is the sibling's market{} — check the sleeve/label for where yours was sold.",
            market.map(|m| format!(" (MusicBrainz has your barcode as {m})")).unwrap_or_default()
        ));
    }
    if country.is_empty() {
        flag(Level::Todo, "country", "Country = the market the release was for, not where it was pressed (§7.1.1). Leave blank if unsure and say so in Submission Notes.".into());
    }
    if released.is_empty() {
        let dates: Vec<String> = refs.iter().filter_map(|r| r.date.as_ref().map(|d| format!("{} {d}", r.source))).collect();
        flag(Level::Todo, "released", format!("Release date of this pressing, if known (YYYY-MM-DD or YYYY; leave empty if unsure, §1.5.7). References: {}.", dates.join(", ")));
    } else {
        flag(Level::Verify, "released", format!("\"{released}\" is the sibling's date — keep it if your variant came out at the same time."));
    }
    let genres: Vec<String> = base.map(|b| parse_strings(b, "genres")).unwrap_or_default();
    let styles: Vec<String> = base.map(|b| parse_strings(b, "styles")).unwrap_or_default();
    if genres.is_empty() {
        let streaming: Vec<String> = refs.iter().flat_map(|r| r.genres.clone()).collect();
        flag(Level::Todo, "genres", format!("Pick at least one genre (streaming genres: {}).", if streaming.is_empty() { "none".into() } else { streaming.join(", ") }));
    }

    // ── Notes
    let colour_words: Vec<String> = sibling_text.iter().flat_map(|t| t.split(|c: char| !c.is_alphanumeric()).map(|w| w.to_lowercase())).filter(|w| w.len() > 2).collect();
    let mut notes_lines: Vec<String> = if same_family {
        base.map(|b| str_of(b, "notes"))
            .unwrap_or_default()
            .lines()
            .filter(|l| {
                // Drop short lines describing the sibling's own colour ("Black vinyl.", "Gatefold
                // translucent", "coke bottle clear LP").
                let lower = l.to_lowercase();
                let short = lower.split_whitespace().count() <= 6;
                !(short && (lower.contains("vinyl") || colour_words.iter().any(|w| lower.split(|c: char| !c.is_alphanumeric()).any(|x| x == w))))
            })
            .map(String::from)
            .collect()
    } else {
        Vec::new()
    };
    if let Some(n) = &hand.notes {
        notes_lines.push(n.clone());
    }
    if durations_note.is_some() {
        notes_lines.push("Track durations are not printed on the release.".into());
    }
    let notes = notes_lines.join("\n").trim().to_string();
    if same_family && !notes.is_empty() {
        flag(Level::Verify, "notes", "Release notes start from the sibling's (colour lines removed) — edit to describe your copy (inserts, stickers, numbering).".into());
    }

    // ── Hints from MusicBrainz variants not on Discogs
    for v in g.mb_variants.iter().filter(|v| !v.on_discogs && v.formats.iter().any(|f| f.contains(fam_name))) {
        hints.push(format!(
            "MusicBrainz lists a {} not on Discogs: barcode {}, {} {}{} — https://musicbrainz.org/release/{}",
            v.formats.join(" + "),
            v.barcode.as_deref().unwrap_or("?"),
            v.country.as_deref().unwrap_or(""),
            v.date.as_deref().unwrap_or(""),
            v.disambiguation.as_deref().map(|d| format!(", \"{d}\"")).unwrap_or_default(),
            v.mbid
        ));
    }

    // ── Submission notes (required, §1.3.1)
    let mut sub = vec!["Entered from my own copy in hand.".to_string()];
    if let Some(b) = base {
        sub.push(format!("Started from r{} ({}) and changed to match this {}.", release_id(b), formats_summary(b), if same_family { "variant" } else { "format" }));
    }
    if let Some(cs) = credits_src.filter(|cs| base.map(release_id) != Some(release_id(cs))) {
        sub.push(format!("Credits checked against r{} and kept only where printed on this release.", release_id(cs)));
    }
    if let Some(n) = durations_note {
        sub.push(n);
    }
    let submission_notes = sub.join("\n");

    // ── Copy-to-Draft edits
    let mut edits = Vec::new();
    if let Some(b) = base {
        let id = release_id(b);
        edits.push(format!("Open https://www.discogs.com/release/{id} → Edit Release → Copy to Draft → Okay, then open it from https://www.discogs.com/users/drafts (Edit / Submit)."));
        if !same_family {
            edits.push(format!("Format: replace every {} row with the rows below, renumber tracks by side (§1.5.6), and clear the old carrier's companies and identifiers.", release_family(b).unwrap_or_default()));
        } else {
            edits.push(format!("Format: set free text to \"{}\" and adjust descriptions to: {}.", free_text, formats.iter().map(|f| f.descriptions.join(", ")).collect::<Vec<_>>().join(" / ")));
        }
        edits.push("Barcode & Other Identifiers: delete the sibling's barcode and runouts; add yours (see below).".into());
        for l in &labels {
            if !parse::<Label>(b, "labels").iter().any(|x| x.name == l.name && x.catno == l.catno) {
                edits.push(format!("Label: {} catalogue number → {}", l.name, if l.catno.is_empty() { "(as printed)" } else { &l.catno }));
            }
        }
        if !dropped_credits.is_empty() {
            edits.push(format!("Credits: remove {} that only apply to the other carrier.", dropped_credits.len()));
        }
        edits.push("Credits, companies, notes: delete anything not printed on your copy.".into());
        edits.push("Images: replace with your own photos (§13.1.4).".into());
        edits.push("Submission Notes: paste the block below.".into());
    }

    let mut siblings: Vec<SiblingRef> = g.siblings.iter().map(sibling_ref).collect();
    siblings.sort_by_key(|s| s.id);
    flags.sort_by_key(|f| f.level);

    Draft {
        generated_at: chrono::Local::now().to_rfc3339(),
        query: q,
        base: base.map(sibling_ref),
        credits_from: credits_src.map(sibling_ref),
        master_id: g.master_id.clone(),
        artists,
        title,
        labels,
        formats,
        country,
        released,
        genres,
        styles,
        tracklist,
        extraartists,
        companies,
        identifiers,
        notes,
        submission_notes,
        flags,
        copy_to_draft_edits: edits,
        hints,
        siblings,
        references: refs.iter().map(|r| (r.source.to_string(), r.url.clone())).collect(),
    }
}

/// MusicBrainz country codes → Discogs country names (the ones labels release under most).
fn discogs_country(code: &str) -> &str {
    match code {
        "XE" => "Europe",
        "XW" => "Worldwide",
        "GB" => "UK",
        "US" => "US",
        "DE" => "Germany",
        "FR" => "France",
        "NL" => "Netherlands",
        "JP" => "Japan",
        "CA" => "Canada",
        "AU" => "Australia",
        other => other,
    }
}

fn parse_strings(v: &Value, key: &str) -> Vec<String> {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}

/// Side letters used by a tracklist, in order ("A", "B"…). Empty for CD-style positions.
pub fn sides_of(tracks: &[Track]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tracks.iter().filter(|t| t.type_ == "track") {
        let letters: String = t.position.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
        if letters.len() == 1 && !out.contains(&letters) {
            out.push(letters);
        }
    }
    out
}

fn tracklist_side_count(tracks: &[Track]) -> usize {
    sides_of(tracks).len()
}

/// Give copied/reference tracks positions for `family`. Returns true when the side layout is
/// a guess.
fn reposition(tracks: &mut [Track], family: Family, hand: &InHand, g: &Gathered, hints: &mut Vec<String>) -> bool {
    let n = tracks.len();
    if !family.has_sides() {
        let mut discs: Vec<usize> = Vec::new();
        for t in tracks.iter() {
            let disc = t.position.split_once('-').and_then(|(d, _)| digits_suffix(d)).unwrap_or(1).max(1);
            if discs.len() < disc {
                discs.resize(disc, 0);
            }
            discs[disc - 1] += 1;
        }
        for (t, p) in tracks.iter_mut().zip(rules::disc_positions(&discs)) {
            t.position = p;
        }
        return false;
    }

    // 1. Explicit --sides.
    if let Some(counts) = hand.sides.as_ref().filter(|c| c.iter().sum::<usize>() == n) {
        for (t, p) in tracks.iter_mut().zip(rules::side_positions(counts)) {
            t.position = p;
        }
        return false;
    }
    // 2. A MusicBrainz release of this family with side positions for the same tracks.
    if let Some(mb) = g.mb.as_ref().filter(|m| m.is_family(family)) {
        let mapped: Vec<Option<String>> = tracks
            .iter()
            .map(|t| mb.tracks.iter().find(|r| norm_track(&r.title) == norm_track(&t.title)).map(|r| r.position.clone()))
            .collect();
        if mapped.iter().all(|p| p.as_ref().is_some_and(|p| p.chars().next().is_some_and(|c| c.is_ascii_alphabetic()))) {
            for (t, p) in tracks.iter_mut().zip(mapped) {
                t.position = p.unwrap_or_default();
            }
            hints.push(format!("Side layout taken from MusicBrainz ({}).", mb.url));
            return false;
        }
    }
    // 3. Balance by reference running time.
    let durations: Vec<Option<u64>> = tracks
        .iter()
        .map(|t| {
            g.references()
                .iter()
                .find_map(|r| r.tracks.iter().find(|x| norm_track(&x.title) == norm_track(&t.title)).and_then(|x| x.duration_ms))
                .map(|ms| ms / 1000)
                .or_else(|| rules::parse_duration(&t.duration))
        })
        .collect();
    let total: u64 = durations.iter().flatten().sum();
    let sides = match family {
        Family::Vinyl => 2 * hand.lps.unwrap_or_else(|| rules::guess_lp_count(total)),
        _ => 2,
    };
    let counts = rules::split_sides(&durations, sides);
    for (t, p) in tracks.iter_mut().zip(rules::side_positions(&counts)) {
        t.position = p;
    }
    hints.push(format!(
        "Guessed {} sides for {} of music: {} tracks per side.",
        sides,
        rules::duration(total * 1000),
        counts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join("/")
    ));
    true
}

fn digits_suffix(s: &str) -> Option<usize> {
    let d: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    d.parse().ok()
}
