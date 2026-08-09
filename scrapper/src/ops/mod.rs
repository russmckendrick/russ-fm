//! Command implementations (the "operations" layer) shared by the CLI and TUI.
//!
//! Network-dependent operations live in their own submodules and build on [`crate::services`]
//! and [`crate::orchestrator`]. Pure-local operations (maintenance) are implemented directly.

pub mod artist;
pub mod collection;
pub mod descriptions;
pub mod generate;
pub mod maintenance;
pub mod release;
pub mod rename;
pub mod report;
pub mod service_input;
pub mod services;
pub mod videos;

use anyhow::{bail, Result};
use serde_json::Value;

/// How a detail-editor field is edited and validated.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FieldKind {
    /// Free text (blank clears when the column is nullable).
    Text,
    /// Whole number.
    Int,
    /// `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (some fields also accept a full ISO datetime).
    DateYmd,
    /// Comma-separated list of strings.
    CsvList,
    /// A service identity — edited as an ID or URL, then re-fetched from the API.
    Service,
    /// Edited in the structured list overlay (tracklist, videos).
    Structured,
    /// Derived from sources; `r` re-fetches it, there is no hand-edit.
    RefreshOnly,
}

/// Set (or clear, when `value` is None) one key nested under `raw_data.<service>`, creating the
/// service object when needed — this is what the public `services{}` block is derived from.
pub(crate) fn set_raw_service_key(raw_data: &mut Value, service: &str, key: &str, value: Option<Value>) {
    if !raw_data.is_object() {
        *raw_data = serde_json::json!({});
    }
    let obj = raw_data.as_object_mut().expect("raw_data is an object");
    let svc = obj.entry(service.to_string()).or_insert_with(|| serde_json::json!({}));
    if let Some(svc) = svc.as_object_mut() {
        match value {
            Some(v) => svc.insert(key.to_string(), v),
            None => svc.remove(key),
        };
    }
}

/// Parse a CSV field into a JSON string array: split on commas, trim, drop empties.
pub(crate) fn csv_list(text: &str) -> Value {
    Value::Array(
        text.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| Value::String(s.to_string()))
            .collect(),
    )
}

/// Parse an optional year (blank clears). Bounds are sanity limits, not era policing.
pub(crate) fn parse_year(text: &str) -> Result<Option<i64>> {
    let t = text.trim();
    if t.is_empty() {
        return Ok(None);
    }
    match t.parse::<i64>() {
        Ok(y) if (0..=3000).contains(&y) => Ok(Some(y)),
        _ => bail!("year must be a whole number between 0 and 3000"),
    }
}

/// Validate an optional `YYYY[-MM[-DD]]` date (blank clears).
pub(crate) fn parse_date_ymd(text: &str) -> Result<Option<String>> {
    let t = text.trim();
    if t.is_empty() {
        return Ok(None);
    }
    if date_ymd_valid(t) {
        Ok(Some(t.to_string()))
    } else {
        bail!("expected YYYY, YYYY-MM or YYYY-MM-DD")
    }
}

/// Validate an optional date that may also carry a time (`date_added` sorts collection.json,
/// so full ISO datetimes like `2026-06-01T00:00:00-08:00` must round-trip). Blank clears.
pub(crate) fn parse_date_or_datetime(text: &str) -> Result<Option<String>> {
    let t = text.trim();
    if t.is_empty() {
        return Ok(None);
    }
    let (date, rest) = t.split_at(t.find(['T', ' ']).unwrap_or(t.len()));
    let time_ok = rest.is_empty() || datetime_rest_valid(&rest[1..]);
    if date_ymd_valid(date) && time_ok {
        Ok(Some(t.to_string()))
    } else {
        bail!("expected YYYY-MM-DD, optionally followed by a time like T12:30:00+00:00")
    }
}

fn date_ymd_valid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    let all_digits = |p: &str| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit());
    match parts.as_slice() {
        [y] => y.len() == 4 && all_digits(y),
        [y, m] => y.len() == 4 && m.len() == 2 && all_digits(y) && all_digits(m),
        [y, m, d] => y.len() == 4 && m.len() == 2 && d.len() == 2 && [y, m, d].iter().all(|p| all_digits(p)),
        _ => false,
    }
}

/// Loose check of the time-and-offset part after `T`/space: `HH:MM[:SS[.frac]][Z|±HH[:]MM]`.
fn datetime_rest_valid(rest: &str) -> bool {
    !rest.is_empty()
        && rest
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b':' | b'.' | b'+' | b'-' | b'Z' | b'z'))
}

/// Sørensen-Dice bigram similarity (same algorithm as the report/maintenance matchers), used
/// to rank an artist's Discogs masters against a boxset's album section headers.
pub(crate) fn dice_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    let bigrams = |s: &str| -> Vec<[char; 2]> {
        let c: Vec<char> = s.chars().collect();
        c.windows(2).map(|w| [w[0], w[1]]).collect()
    };
    let (ba, bb) = (bigrams(a), bigrams(b));
    if ba.is_empty() || bb.is_empty() {
        return 0.0;
    }
    let mut used = vec![false; bb.len()];
    let mut m = 0;
    for x in &ba {
        for (j, y) in bb.iter().enumerate() {
            if !used[j] && x == y {
                used[j] = true;
                m += 1;
                break;
            }
        }
    }
    2.0 * m as f64 / (ba.len() + bb.len()) as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn csv_list_trims_and_drops_empties() {
        assert_eq!(csv_list(" Rock , , Pop ,Jazz,"), json!(["Rock", "Pop", "Jazz"]));
        assert_eq!(csv_list(""), json!([]));
        assert_eq!(csv_list(" , ,"), json!([]));
    }

    #[test]
    fn parse_year_accepts_blank_and_bounds() {
        assert_eq!(parse_year("").unwrap(), None);
        assert_eq!(parse_year("1994").unwrap(), Some(1994));
        assert!(parse_year("banana").is_err());
        assert!(parse_year("-5").is_err());
        assert!(parse_year("9999").is_err());
    }

    #[test]
    fn parse_date_ymd_validates_shapes() {
        assert_eq!(parse_date_ymd("").unwrap(), None);
        assert_eq!(parse_date_ymd("1994").unwrap(), Some("1994".into()));
        assert_eq!(parse_date_ymd("1994-06").unwrap(), Some("1994-06".into()));
        assert_eq!(parse_date_ymd("1994-06-01").unwrap(), Some("1994-06-01".into()));
        assert!(parse_date_ymd("06/01/1994").is_err());
        assert!(parse_date_ymd("1994-6-1").is_err());
    }

    #[test]
    fn dice_similarity_ranks_boxset_title_variants() {
        // Punctuation variants of the same album must clear the 0.4 candidate threshold…
        assert!(dice_similarity("new gold dream (81-82-83-84)", "new gold dream (81/82/83/84)") > 0.4);
        assert!(dice_similarity("real to real cacophony", "real to real cacophony.") > 0.4);
        // …while unrelated albums by the same artist must not.
        assert!(dice_similarity("wild planet", "cosmic thing") < 0.4);
    }

    #[test]
    fn parse_date_or_datetime_accepts_iso_datetimes() {
        assert_eq!(parse_date_or_datetime("").unwrap(), None);
        assert_eq!(parse_date_or_datetime("2026-06-01").unwrap(), Some("2026-06-01".into()));
        assert_eq!(
            parse_date_or_datetime("2026-06-01T00:00:00-08:00").unwrap(),
            Some("2026-06-01T00:00:00-08:00".into())
        );
        assert!(parse_date_or_datetime("2026-06-01Tnoon").is_err());
        assert!(parse_date_or_datetime("yesterday").is_err());
    }
}
