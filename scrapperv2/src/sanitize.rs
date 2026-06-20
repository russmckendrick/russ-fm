//! Folder-name and filename sanitization.
//!
//! [`sanitize_folder_name`] is a byte-for-byte port of
//! `music_collection_manager/utils/folder_sanitizer.py::sanitize_folder_name`. The output
//! slugs MUST match the existing `public/album/*` and `public/artist/*` folder names, so this
//! is covered by a corpus test (see `tests/sanitizer_corpus.rs`).

/// Transliteration map for common accented Latin characters (applied after lowercasing).
fn accent(c: char) -> Option<&'static str> {
    Some(match c {
        'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' | 'ā' => "a",
        'é' | 'è' | 'ë' | 'ê' | 'ē' => "e",
        'í' | 'ì' | 'ï' | 'î' | 'ī' => "i",
        'ó' | 'ò' | 'ö' | 'ô' | 'õ' | 'ø' | 'ō' => "o",
        'ú' | 'ù' | 'ü' | 'û' | 'ū' => "u",
        'ý' | 'ÿ' | 'ȳ' => "y",
        'ñ' => "n",
        'ə' => "e",
        'ç' => "c",
        'ß' => "ss",
        'æ' => "ae",
        'œ' => "oe",
        'ð' => "d",
        'þ' => "th",
        _ => return None,
    })
}

/// Greek transliteration map.
fn greek(c: char) -> Option<&'static str> {
    Some(match c {
        'Α' | 'α' | 'ά' | 'Ά' => "a",
        'Β' | 'β' => "b",
        'Γ' | 'γ' => "g",
        'Δ' | 'δ' => "d",
        'Ε' | 'ε' | 'έ' | 'Έ' => "e",
        'Ζ' | 'ζ' => "z",
        'Η' | 'η' | 'ή' | 'Ή' => "e",
        'Θ' | 'θ' => "th",
        'Ι' | 'ι' | 'ί' | 'ϊ' | 'ΐ' | 'Ί' | 'Ϊ' => "i",
        'Κ' | 'κ' => "k",
        'Λ' | 'λ' => "l",
        'Μ' | 'μ' => "m",
        'Ν' | 'ν' => "n",
        'Ξ' | 'ξ' => "x",
        'Ο' | 'ο' | 'ό' | 'Ό' => "o",
        'Π' | 'π' => "p",
        'Ρ' | 'ρ' => "r",
        'Σ' | 'σ' | 'ς' => "s",
        'Τ' | 'τ' => "t",
        'Υ' | 'υ' | 'ύ' | 'ϋ' | 'ΰ' | 'Ύ' | 'Ϋ' => "u",
        'Φ' | 'φ' => "f",
        'Χ' | 'χ' => "ch",
        'Ψ' | 'ψ' => "ps",
        'Ω' | 'ω' | 'ώ' | 'Ώ' => "o",
        _ => return None,
    })
}

/// Symbol/fraction transliteration. Fractions get a leading dash, matching the Python logic.
fn symbol(c: char) -> Option<&'static str> {
    Some(match c {
        '½' => "-half",
        '⅓' => "-third",
        '¼' => "-quarter",
        '¾' => "-three-quarters",
        '⅛' => "-eighth",
        '⅜' => "-three-eighths",
        '⅝' => "-five-eighths",
        '⅞' => "-seven-eighths",
        '²' => "2",
        '³' => "3",
        '¹' => "1",
        '–' | '—' | '−' => "-",
        _ => return None,
    })
}

/// Characters deleted outright (backward-compatibility set from the Python `remove_chars`).
const REMOVE_CHARS: &[char] = &[
    '°', '©', '®', '™', '\u{2019}', '\u{2018}', '\u{201D}', '\u{201C}', '«', '»', '‹', '›', '„',
    '‚', '(', ')', '+', '=', '%', '@', '#', '$', '€', '£', '…',
];

/// Characters removed in the early ASCII-punctuation pass.
const EARLY_REMOVE: &[char] = &['&', '\'', '"', '.', '!', '?', ';', ':'];

/// True if `c` falls in the Hiragana/Katakana/Kanji/fullwidth ranges that are stripped.
fn is_japanese(c: char) -> bool {
    let n = c as u32;
    (0x3040..=0x309F).contains(&n)
        || (0x30A0..=0x30FF).contains(&n)
        || (0x4E00..=0x9FAF).contains(&n)
        || (0x3400..=0x4DBF).contains(&n)
        || (0xFF00..=0xFFEF).contains(&n)
}

fn is_ascii_lower(c: char) -> bool {
    c.is_ascii_lowercase()
}

/// Replicates Python `re.sub(r'([a-z])_([a-z])(?![a-z])', r'\1\2', s)` — removes an underscore
/// between two single ASCII letters when the second letter is not followed by another letter.
/// Non-overlapping, left-to-right (matching `re.sub`).
fn collapse_single_letter_underscores(chars: &[char]) -> Vec<char> {
    let mut out = Vec::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if i + 2 < chars.len()
            && is_ascii_lower(chars[i])
            && chars[i + 1] == '_'
            && is_ascii_lower(chars[i + 2])
            && !(i + 3 < chars.len() && is_ascii_lower(chars[i + 3]))
        {
            out.push(chars[i]);
            out.push(chars[i + 2]);
            i += 3;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Sanitize a name for use as a filesystem folder name. See module docs.
pub fn sanitize_folder_name(name: &str) -> String {
    // 1. Empty / whitespace-only.
    if name.trim().is_empty() {
        return "unknown".to_string();
    }
    // 2. Empty bracket pairs.
    match name.trim() {
        "( )" | "()" | "[ ]" | "[]" | "{ }" | "{}" => return "unknown".to_string(),
        _ => {}
    }

    // 3. Lowercase. 4. All Unicode whitespace -> '-'.
    let lowered: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_whitespace() { '-' } else { c })
        .collect();

    // 5. Remove underscore between single letters. 6. Remaining '_' -> '-'.
    let chars: Vec<char> = lowered.chars().collect();
    let collapsed = collapse_single_letter_underscores(&chars);

    let mut s = String::with_capacity(collapsed.len());
    for &c in &collapsed {
        match c {
            '_' => s.push('-'),
            // 7. Strip brackets, preserving content.
            '[' | ']' | '{' | '}' => {}
            // 8. Early punctuation removal.
            c if EARLY_REMOVE.contains(&c) => {}
            c => s.push(c),
        }
    }

    // 9-13. Per-character transliteration / removal passes.
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if let Some(rep) = accent(c) {
            out.push_str(rep);
        } else if let Some(rep) = symbol(c) {
            out.push_str(rep);
        } else if REMOVE_CHARS.contains(&c) {
            // deleted
        } else if let Some(rep) = greek(c) {
            out.push_str(rep);
        } else if is_japanese(c) {
            // deleted
        } else {
            out.push(c);
        }
    }

    // 14. Keep only alphanumeric or '-'.
    let mut filtered: String = out.chars().filter(|c| c.is_alphanumeric() || *c == '-').collect();

    // 15. Collapse consecutive dashes.
    while filtered.contains("--") {
        filtered = filtered.replace("--", "-");
    }
    // 16. Trim edge dashes.
    let trimmed = filtered.trim_matches('-').to_string();

    // 17. Fallback.
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed
    }
}

/// Build the folder name for a release: `{sanitized-title}-{discogs_id}`.
pub fn release_folder_name(title: &str, discogs_id: &str) -> String {
    format!("{}-{}", sanitize_folder_name(title), discogs_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_examples() {
        assert_eq!(sanitize_folder_name("Björk"), "bjork");
        assert_eq!(sanitize_folder_name("Children of the Sün"), "children-of-the-sun");
        assert_eq!(sanitize_folder_name("Sigur Rós"), "sigur-ros");
        assert_eq!(sanitize_folder_name("( )"), "unknown");
        assert_eq!(sanitize_folder_name("4½"), "4-half");
        assert_eq!(sanitize_folder_name("Batman™"), "batman");
        assert_eq!(sanitize_folder_name(""), "unknown");
        assert_eq!(sanitize_folder_name("The_Puzzle"), "the-puzzle");
    }
}
