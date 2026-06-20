//! `report` — album-matching report comparing the Discogs / Apple Music / Spotify release names
//! after normalization via `album_matching_filters.json`.

use anyhow::Result;
use serde::Deserialize;
use serde_json::json;

use crate::cli::ReportArgs;
use crate::{Config, Db};

#[derive(Deserialize, Default)]
struct FiltersFile {
    #[serde(default)]
    filters: Filters,
    #[serde(default)]
    reporting: Reporting,
}

#[derive(Deserialize)]
struct Filters {
    #[serde(default)]
    common_variations: Vec<String>,
    #[serde(default)]
    punctuation_ignore: Vec<String>,
    #[serde(default = "yes")]
    parentheses_content: bool,
    #[serde(default = "yes")]
    brackets_content: bool,
    #[serde(default)]
    case_sensitive: bool,
    #[serde(default)]
    remove_leading_articles: Vec<String>,
}

impl Default for Filters {
    fn default() -> Self {
        Self {
            common_variations: Vec::new(),
            punctuation_ignore: Vec::new(),
            parentheses_content: true,
            brackets_content: true,
            case_sensitive: false,
            remove_leading_articles: vec!["the".into(), "a".into(), "an".into()],
        }
    }
}

#[derive(Deserialize)]
struct Reporting {
    #[serde(default = "default_threshold")]
    similarity_threshold: f64,
}

impl Default for Reporting {
    fn default() -> Self {
        Self { similarity_threshold: default_threshold() }
    }
}

fn yes() -> bool {
    true
}
fn default_threshold() -> f64 {
    0.95
}

fn strip_paired(s: &str, open: char, close: char) -> String {
    let mut out = String::new();
    let mut depth = 0;
    for c in s.chars() {
        if c == open {
            depth += 1;
        } else if c == close && depth > 0 {
            depth -= 1;
        } else if depth == 0 {
            out.push(c);
        }
    }
    out
}

fn normalize(name: &str, f: &Filters) -> String {
    let mut s = if f.case_sensitive { name.to_string() } else { name.to_lowercase() };
    if f.parentheses_content {
        s = strip_paired(&s, '(', ')');
    }
    if f.brackets_content {
        s = strip_paired(&s, '[', ']');
    }
    for v in &f.common_variations {
        let v = if f.case_sensitive { v.clone() } else { v.to_lowercase() };
        s = s.replace(&v, " ");
    }
    for p in &f.punctuation_ignore {
        s = s.replace(p.as_str(), " ");
    }
    // Collapse whitespace.
    let mut words: Vec<&str> = s.split_whitespace().collect();
    // Drop a leading article.
    if let Some(first) = words.first() {
        if f.remove_leading_articles.iter().any(|a| a == first) {
            words.remove(0);
        }
    }
    words.join(" ")
}

/// Sørensen-Dice bigram similarity over normalized strings.
fn similarity(a: &str, b: &str) -> f64 {
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

pub async fn run(cfg: &Config, args: ReportArgs) -> Result<()> {
    let filters_path = args.filter_config.clone().unwrap_or_else(|| cfg.base_dir.join("album_matching_filters.json"));
    let filters: FiltersFile = std::fs::read_to_string(&filters_path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let threshold = filters.reporting.similarity_threshold;

    let db = Db::open(cfg.db_path())?;
    let releases = db.get_all_releases()?;

    let mut mismatches = Vec::new();
    let mut compared = 0usize;
    for r in &releases {
        let discogs = r.release_name_discogs.clone().unwrap_or_else(|| r.title.clone());
        let apple = r.release_name_apple_music.clone();
        let spotify = r.release_name_spotify.clone();
        if apple.is_none() && spotify.is_none() && !args.include_unprocessed {
            continue;
        }
        compared += 1;

        let nd = normalize(&discogs, &filters.filters);
        let mut worst = 1.0f64;
        for other in [apple.as_ref(), spotify.as_ref()].into_iter().flatten() {
            let no = normalize(other, &filters.filters);
            worst = worst.min(similarity(&nd, &no));
        }
        if worst < threshold {
            mismatches.push(json!({
                "discogs_id": r.discogs_id,
                "release_name_discogs": discogs,
                "release_name_apple_music": apple,
                "release_name_spotify": spotify,
                "similarity": (worst * 1000.0).round() / 1000.0,
            }));
        }
    }

    if let Some(limit) = args.limit {
        mismatches.truncate(limit as usize);
    }

    if args.format == "json" {
        let out = serde_json::to_string_pretty(&json!({ "compared": compared, "mismatches": mismatches }))?;
        match &args.output_file {
            Some(p) => {
                std::fs::write(p, &out)?;
                println!("Wrote report to {}", p.display());
            }
            None => println!("{out}"),
        }
        return Ok(());
    }

    // Text format.
    let mut text = format!("Album matching report — {} compared, {} mismatches (threshold {threshold})\n\n", compared, mismatches.len());
    for m in &mismatches {
        text.push_str(&format!(
            "  [{}] sim {:.2}\n    discogs: {}\n    apple:   {}\n    spotify: {}\n",
            m["discogs_id"].as_str().unwrap_or("?"),
            m["similarity"].as_f64().unwrap_or(0.0),
            m["release_name_discogs"].as_str().unwrap_or(""),
            m["release_name_apple_music"].as_str().unwrap_or("—"),
            m["release_name_spotify"].as_str().unwrap_or("—"),
        ));
    }
    match &args.output_file {
        Some(p) => {
            std::fs::write(p, &text)?;
            println!("Wrote report to {}", p.display());
        }
        None => print!("{text}"),
    }
    Ok(())
}
