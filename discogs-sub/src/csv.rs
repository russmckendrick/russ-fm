//! CSV for Discogs' CSV_To_Draft beta (https://www.discogs.com/release/csv_to_draft), which
//! creates drafts in your account from up to 100 rows. Documented at
//! https://support.discogs.com/hc/en-us/articles/360007539354-CSV-To-Draft (2026-03-31):
//! one label / catno / format / genre, several styles, tracks one per line (positions become
//! 1, 2, 3…), A and B runouts only, no track artists, times or credits.

use serde_json::Value;

pub const HEADER: [&str; 14] =
    ["artist", "title", "label", "catno", "format", "genre", "style", "tracks", "a runout", "b runout", "notes", "date", "barcode", "images"];

/// Discogs allows 100 drafts per upload.
pub const MAX_ROWS: usize = 100;

fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn list<'a>(v: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    v.get(key).and_then(|x| x.as_array()).into_iter().flatten()
}

/// The runout recorded for one side ("Side A runout").
fn runout(d: &Value, side: char) -> String {
    let want = format!("Side {side} runout");
    list(d, "identifiers")
        .find(|i| s(i, "type") == "Matrix / Runout" && s(i, "description") == want)
        .map(|i| s(i, "value").to_string())
        .unwrap_or_default()
}

/// The one genre the CSV allows: the genre the styles belong to ("Prog Rock" → Rock), else
/// the first listed. The rest go on the "add in the form" list.
fn main_genre(d: &Value) -> String {
    let genres: Vec<&str> = list(d, "genres").filter_map(|g| g.as_str()).collect();
    let styles: Vec<&str> = list(d, "styles").filter_map(|x| x.as_str()).collect();
    genres
        .iter()
        .max_by_key(|g| (styles.iter().filter(|s| s.contains(**g)).count(), std::cmp::Reverse(genres.iter().position(|x| x == *g))))
        .unwrap_or(&"")
        .to_string()
}

/// One CSV_To_Draft row from a `draft.json` value.
pub fn row(d: &Value) -> [String; 14] {
    // Discogs names keep their "(4)" disambiguators, which helps the form match the right
    // artist entity when you press ↓ on each name.
    let artist = list(d, "artists").map(|a| s(a, "name")).collect::<Vec<_>>().join(", ");
    let label = list(d, "labels").next();
    let barcode = list(d, "identifiers")
        .filter(|i| s(i, "type") == "Barcode")
        .min_by_key(|i| s(i, "description") != "Printed")
        .map(|i| s(i, "value").to_string())
        .unwrap_or_default();
    let tracks = list(d, "tracklist")
        .filter(|t| s(t, "type_") == "track")
        .map(|t| s(t, "title"))
        .collect::<Vec<_>>()
        .join("\n");
    [
        artist,
        s(d, "title").to_string(),
        label.map(|l| s(l, "name").to_string()).unwrap_or_default(),
        label.map(|l| s(l, "catno").to_string()).unwrap_or_default(),
        list(d, "formats").next().map(|f| s(f, "name").to_string()).unwrap_or_default(),
        main_genre(d),
        list(d, "styles").filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", "),
        tracks,
        runout(d, 'A'),
        runout(d, 'B'),
        s(d, "notes").to_string(),
        s(d, "released").to_string(),
        barcode,
        String::new(), // images must be public URLs; photograph your copy and add them in the form
    ]
}

/// What the CSV can't carry for this draft — to finish in the form after the upload.
pub fn left_for_form(d: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let tracks: Vec<&Value> = list(d, "tracklist").filter(|t| s(t, "type_") == "track").collect();
    if tracks.iter().any(|t| !s(t, "position").chars().all(|c| c.is_ascii_digit())) {
        out.push(format!(
            "Track positions ({}) — the upload numbers them 1, 2, 3…",
            tracks.iter().map(|t| s(t, "position")).collect::<Vec<_>>().join(" ")
        ));
    }
    if list(d, "tracklist").any(|t| s(t, "type_") == "heading") {
        out.push("Tracklist headings".into());
    }
    let with_artists = tracks.iter().filter(|t| t.get("artists").and_then(|a| a.as_array()).is_some_and(|a| !a.is_empty())).count();
    if with_artists > 0 {
        out.push(format!("Track artists on {with_artists} tracks"));
    }
    let timed = tracks.iter().filter(|t| !s(t, "duration").is_empty()).count();
    if timed > 0 {
        out.push(format!("Durations on {timed} tracks"));
    }
    let track_credits: usize = tracks.iter().map(|t| t.get("extraartists").and_then(|a| a.as_array()).map_or(0, |a| a.len())).sum();
    let credits = list(d, "extraartists").count();
    if credits + track_credits > 0 {
        out.push(format!("Credits ({credits} release-wide, {track_credits} on tracks)"));
    }
    let labels = list(d, "labels").count();
    if labels > 1 {
        out.push(format!("{} more label/catno rows", labels - 1));
    }
    let formats: Vec<&Value> = list(d, "formats").collect();
    let format_bits: Vec<String> = formats
        .iter()
        .map(|f| {
            let mut bits = vec![format!("qty {}", s(f, "qty"))];
            bits.extend(f.get("descriptions").and_then(|x| x.as_array()).into_iter().flatten().filter_map(|x| x.as_str()).map(String::from));
            if !s(f, "text").is_empty() {
                bits.push(format!("\"{}\"", s(f, "text")));
            }
            bits.join(", ")
        })
        .collect();
    out.push(format!("Format details: {}{}", format_bits.join(" / "), if formats.len() > 1 { " (extra format rows too)" } else { "" }));
    if list(d, "genres").count() > 1 {
        out.push("Additional genres".into());
    }
    if !s(d, "country").is_empty() {
        out.push(format!("Country: {}", s(d, "country")));
    }
    if list(d, "companies").count() > 0 {
        out.push(format!("{} companies", list(d, "companies").count()));
    }
    let extra_ids: Vec<String> = list(d, "identifiers")
        .filter(|i| {
            let desc = s(i, "description");
            !(s(i, "type") == "Barcode" && desc == "Printed") && desc != "Side A runout" && desc != "Side B runout"
        })
        .map(|i| format!("{} {}", s(i, "type"), s(i, "description")).trim().to_string())
        .collect();
    if !extra_ids.is_empty() {
        out.push(format!("Identifiers: {}", extra_ids.join(", ")));
    }
    out.push("Submission Notes (paste from draft.md)".into());
    out.push("Artist and label links — on each name press ↓ and pick the right Discogs entity".into());
    out.push("Images (your own photos)".into());
    out
}

fn quote(field: &str) -> String {
    format!("\"{}\"", field.replace('"', "\"\""))
}

/// The whole file: header plus rows. Records end with CRLF; newlines inside a quoted field
/// (the tracklist) stay LF, as spreadsheets write them.
pub fn render(rows: &[[String; 14]]) -> String {
    let mut out = HEADER.join(",");
    out.push_str("\r\n");
    for r in rows {
        out.push_str(&r.iter().map(|f| quote(f)).collect::<Vec<_>>().join(","));
        out.push_str("\r\n");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_a_draft_to_one_row() {
        let d = json!({
            "artists": [{"name": "Held By Trees"}],
            "title": "The Call Of Home",
            "labels": [{"name": "Talk Talk Music", "catno": "TJMLP06"}],
            "formats": [{"name": "Vinyl", "qty": "2", "descriptions": ["LP", "Album"], "text": ""}],
            "genres": ["Rock"], "styles": ["Art Rock", "Prog Rock"],
            "tracklist": [
                {"position": "A1", "type_": "track", "title": "In This Moment"},
                {"position": "A2", "type_": "track", "title": "Not \"Home\" Yet"}
            ],
            "identifiers": [
                {"type": "Barcode", "value": "5060966702511", "description": "Scanned"},
                {"type": "Barcode", "value": "5 060966 702511", "description": "Printed"},
                {"type": "Matrix / Runout", "value": "TJMLP06-A", "description": "Side A runout"}
            ],
            "notes": "", "released": "2026-10-02"
        });
        let r = row(&d);
        assert_eq!(r[7], "In This Moment\nNot \"Home\" Yet");
        assert_eq!(r[8], "TJMLP06-A");
        assert_eq!(r[12], "5 060966 702511");
        let csv = render(&[r]);
        assert!(csv.starts_with("artist,title,label,catno,format,genre,style,tracks,a runout,b runout,notes,date,barcode,images\r\n"));
        assert!(csv.contains("\"In This Moment\nNot \"\"Home\"\" Yet\""));
        assert!(left_for_form(&d).iter().any(|l| l.starts_with("Track positions (A1 A2)")));
        let comp = json!({"genres": ["Jazz", "Rock", "Pop"], "styles": ["Psychedelic Rock", "Prog Rock"]});
        assert_eq!(main_genre(&comp), "Rock");
        assert_eq!(main_genre(&json!({"genres": ["Jazz", "Pop"], "styles": []})), "Jazz");
    }
}
