//! Release artist credits: headliners versus band members.
//!
//! Discogs credits some releases as a band followed by its line-up — "James Taylor Trio",
//! "James Taylor", "Orlando Le Fleming", "Theodore Carasco". The line-up credits are stored with
//! `role: "member"` so `collection.json` headlines the band alone and lists the line-up as
//! secondary `members`. The role is set by [`mark_band_members`] at ingest (or by the
//! `maintenance band-members` backfill) and can be edited by hand in the TUI credit editor.
//!
//! It also maps Discogs `extraartists` (producers, engineers, session players, sleeve
//! designers…) into the `credits` stored at `raw_data.discogs.credits` and the per-track
//! `extraartists` on tracklist rows; see [`release_credits`] and [`track_credits`].

use serde_json::{json, Value};

/// Role marking a credit as a band member rather than a headline artist.
pub const MEMBER_ROLE: &str = "member";

/// Trailing words that make a credit name an ensemble ("X Trio", "The X Quartet", …).
const ENSEMBLE_SUFFIXES: &[&str] =
    &["trio", "quartet", "quintet", "sextet", "septet", "octet", "band", "group", "ensemble", "orchestra", "combo"];

fn name(entry: &Value) -> &str {
    entry.get("name").and_then(|n| n.as_str()).unwrap_or("").trim()
}

fn role(entry: &Value) -> &str {
    entry.get("role").and_then(|r| r.as_str()).unwrap_or("").trim()
}

/// True when the credit is a band member (not a headline artist).
pub fn is_member(entry: &Value) -> bool {
    role(entry).eq_ignore_ascii_case(MEMBER_ROLE)
}

/// Headline credits: everything that isn't a member. A list where every credit is a member (a
/// bad hand edit) falls back to all of them so the release never loses its artist.
pub fn headliners(artists: &[Value]) -> Vec<&Value> {
    let head: Vec<&Value> = artists.iter().filter(|a| !is_member(a)).collect();
    if head.is_empty() {
        artists.iter().collect()
    } else {
        head
    }
}

/// Member credits, in credit order. Empty when [`headliners`] had to fall back to every credit.
pub fn members(artists: &[Value]) -> Vec<&Value> {
    if artists.iter().all(is_member) {
        return Vec::new();
    }
    artists.iter().filter(|a| is_member(a)).collect()
}

/// The leader's name inside an ensemble credit: "James Taylor Trio" → "James Taylor",
/// "The Steve White Quartet" → "Steve White". None when the name has no ensemble suffix.
fn ensemble_leader(name: &str) -> Option<&str> {
    let (stem, last) = name.trim().rsplit_once(' ')?;
    if !ENSEMBLE_SUFFIXES.iter().any(|s| last.eq_ignore_ascii_case(s)) {
        return None;
    }
    let stem = stem.trim();
    let stem = stem.strip_prefix("The ").or_else(|| stem.strip_prefix("the ")).unwrap_or(stem).trim();
    (!stem.is_empty()).then_some(stem)
}

/// Auto-detect a band-plus-line-up credit list and mark the line-up as members.
///
/// Fires only when the first credit is an ensemble ("X Trio", "The X Quartet", …) and X itself
/// is credited later — the shape Discogs uses for a band followed by its players. Every credit
/// after the ensemble becomes a member. A list that already carries any role is treated as
/// curated and left alone, so a hand edit (including an explicit non-member role such as
/// `main`) always wins. Returns true when anything changed.
pub fn mark_band_members(artists: &mut [Value]) -> bool {
    if artists.len() < 2 || artists.iter().any(|a| !role(a).is_empty()) {
        return false;
    }
    let Some(leader) = ensemble_leader(name(&artists[0])) else {
        return false;
    };
    if !artists[1..].iter().any(|a| name(a).eq_ignore_ascii_case(leader)) {
        return false;
    }
    for a in &mut artists[1..] {
        if let Some(obj) = a.as_object_mut() {
            obj.insert("role".into(), json!(MEMBER_ROLE));
        }
    }
    true
}

/// Copy roles from a previously stored credit list onto a freshly fetched one, matching on
/// `discogs_id` then case-insensitive name, so a re-scrape keeps hand-set roles. Only non-empty
/// stored roles are carried; Discogs itself leaves release-level roles blank.
pub fn carry_over_roles(fresh: &mut [Value], previous: &Value) {
    let Some(prev) = previous.as_array() else { return };
    for entry in fresh.iter_mut() {
        let id = entry.get("discogs_id").and_then(|d| d.as_str()).map(String::from);
        let entry_name = name(entry).to_string();
        let matched = prev
            .iter()
            .find(|p| id.is_some() && p.get("discogs_id").and_then(|d| d.as_str()) == id.as_deref())
            .or_else(|| prev.iter().find(|p| name(p).eq_ignore_ascii_case(&entry_name)));
        let Some(stored) = matched.map(role).filter(|r| !r.is_empty()) else { continue };
        let stored = stored.to_string();
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("role".into(), json!(stored));
        }
    }
}

// ── Discogs release credits (`extraartists`) ─────────────────────────────────

/// One Discogs `extraartists` entry as `{name, discogs_id, role}`, plus Discogs's `tracks`
/// scope ("A1 to A3, B2"; empty = the whole release) when `with_tracks`. The name loses its
/// Discogs disambiguation suffix ("(2)") like release artists do; nameless entries are dropped.
fn discogs_credit(entry: &Value, with_tracks: bool) -> Option<Value> {
    let name = crate::ops::release::clean_artist_name(entry.get("name").and_then(|n| n.as_str()).unwrap_or(""));
    if name.is_empty() {
        return None;
    }
    let discogs_id = match entry.get("id") {
        Some(Value::Number(n)) => n.as_i64().filter(|i| *i > 0).map(|i| json!(i.to_string())),
        Some(Value::String(s)) => Some(s.trim()).filter(|s| !s.is_empty() && *s != "0").map(|s| json!(s)),
        _ => None,
    };
    let text = |key: &str| entry.get(key).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let mut out = json!({ "name": name, "discogs_id": discogs_id.unwrap_or(Value::Null), "role": text("role") });
    if with_tracks {
        out["tracks"] = json!(text("tracks"));
    }
    Some(out)
}

fn discogs_credits(list: Option<&Value>, with_tracks: bool) -> Vec<Value> {
    list.and_then(|l| l.as_array())
        .into_iter()
        .flatten()
        .filter_map(|e| discogs_credit(e, with_tracks))
        .collect()
}

/// Release-level credits from a Discogs release payload's `extraartists`, in Discogs order:
/// `[{name, discogs_id, role, tracks}]`. Empty when Discogs lists none.
pub fn release_credits(release: &Value) -> Vec<Value> {
    discogs_credits(release.get("extraartists"), true)
}

/// Credits of one Discogs tracklist row (its own `extraartists`): `[{name, discogs_id, role}]`.
pub fn track_credits(track: &Value) -> Vec<Value> {
    discogs_credits(track.get("extraartists"), false)
}

/// The release credits stored at `raw_data.discogs.credits`; `None` until fetched (an empty
/// array means Discogs lists none).
pub fn stored_credits(raw_data: &Value) -> Option<&Value> {
    raw_data.pointer("/discogs/credits").filter(|c| c.is_array())
}

/// A full Discogs release payload kept in `raw_data.discogs` (releases first scraped by the
/// Python tool), whose `extraartists` and `tracklist` give the credits without a request.
pub fn stored_payload(raw_data: &Value) -> Option<&Value> {
    raw_data.get("discogs").filter(|d| d.get("extraartists").is_some_and(Value::is_array))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credits(names: &[&str]) -> Vec<Value> {
        names.iter().map(|n| json!({ "name": n, "role": "", "discogs_id": null })).collect()
    }

    fn roles(artists: &[Value]) -> Vec<&str> {
        artists.iter().map(role).collect()
    }

    #[test]
    fn marks_line_up_after_an_ensemble_whose_leader_is_credited() {
        let mut a = credits(&["James Taylor Trio", "James Taylor", "Orlando Le Fleming", "Theodore Carasco"]);
        assert!(mark_band_members(&mut a));
        assert_eq!(roles(&a), vec!["", "member", "member", "member"]);
        let head: Vec<&str> = headliners(&a).into_iter().map(name).collect();
        assert_eq!(head, vec!["James Taylor Trio"]);
        assert_eq!(members(&a).len(), 3);
    }

    #[test]
    fn handles_leading_the_and_other_ensemble_words() {
        let mut a = credits(&["The Steve White Quartet", "Steve White", "Chris Hague"]);
        assert!(mark_band_members(&mut a));
        assert_eq!(roles(&a), vec!["", "member", "member"]);
    }

    #[test]
    fn leaves_collaborations_alone() {
        for names in [
            vec!["Prince", "The New Power Generation"],
            vec!["Charles Bradley", "Menahan Street Band"],
            vec!["Paul Weller", "Jules Buckley", "BBC Symphony Orchestra"],
            vec!["Kronos Quartet", "Clint Mansell"],
        ] {
            let mut a = credits(&names);
            assert!(!mark_band_members(&mut a), "{names:?}");
            assert!(roles(&a).iter().all(|r| r.is_empty()));
        }
    }

    #[test]
    fn curated_roles_block_detection() {
        let mut a = credits(&["Matt Berry Trio", "Matt Berry", "Phil Scragg"]);
        a[0]["role"] = json!("main");
        assert!(!mark_band_members(&mut a));
        assert_eq!(roles(&a), vec!["main", "", ""]);
        assert_eq!(headliners(&a).len(), 3);
    }

    #[test]
    fn all_member_list_falls_back_to_every_credit() {
        let a = vec![json!({ "name": "Solo", "role": "member" })];
        assert_eq!(headliners(&a).len(), 1);
        assert!(members(&a).is_empty());
    }

    #[test]
    fn carries_stored_roles_by_discogs_id_then_name() {
        let prev = json!([
            { "name": "Old Name", "discogs_id": "1", "role": "main" },
            { "name": "Sideman", "discogs_id": null, "role": "member" },
            { "name": "Blank", "discogs_id": "3", "role": "" },
        ]);
        let mut fresh = vec![
            json!({ "name": "New Name", "discogs_id": "1", "role": "" }),
            json!({ "name": "sideman", "discogs_id": "2", "role": "" }),
            json!({ "name": "Blank", "discogs_id": "3", "role": "" }),
        ];
        carry_over_roles(&mut fresh, &prev);
        assert_eq!(roles(&fresh), vec!["main", "member", ""]);
    }

    #[test]
    fn maps_discogs_extraartists() {
        let release = json!({ "extraartists": [
            { "name": "Tony Visconti", "anv": "", "role": "Producer ", "tracks": "", "id": 115089 },
            { "name": "Robert Fripp (2)", "role": "Lead Guitar", "tracks": "A1 to A3, B2", "id": "20662" },
            { "name": "Unlinked", "role": "Photography By", "id": 0 },
            { "name": " ", "role": "Liner Notes", "id": 7 },
        ]});
        assert_eq!(
            release_credits(&release),
            vec![
                json!({ "name": "Tony Visconti", "discogs_id": "115089", "role": "Producer", "tracks": "" }),
                json!({ "name": "Robert Fripp", "discogs_id": "20662", "role": "Lead Guitar", "tracks": "A1 to A3, B2" }),
                json!({ "name": "Unlinked", "discogs_id": null, "role": "Photography By", "tracks": "" }),
            ]
        );
        let track = json!({ "position": "A1", "extraartists": [{ "name": "Brian Eno", "role": "Synthesizer", "tracks": "", "id": 3014 }] });
        assert_eq!(track_credits(&track), vec![json!({ "name": "Brian Eno", "discogs_id": "3014", "role": "Synthesizer" })]);
        assert!(release_credits(&json!({})).is_empty());
    }

    #[test]
    fn stored_credits_and_payload() {
        assert!(stored_credits(&json!({ "discogs": { "formats": [] } })).is_none());
        assert_eq!(stored_credits(&json!({ "discogs": { "credits": [] } })), Some(&json!([])));
        assert!(stored_payload(&json!({ "discogs": { "images": [] } })).is_none());
        assert!(stored_payload(&json!({ "discogs": { "extraartists": [], "tracklist": [] } })).is_some());
    }
}
