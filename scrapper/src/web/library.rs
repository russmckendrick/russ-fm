//! The web UI's view of the published collection: a slim, browsable index built from
//! `public/collection.json` (plus `album-colors.json` for cover placeholders), reloaded
//! whenever either file changes on disk.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::Value;

/// One release in the library grid.
#[derive(Clone, Debug, Serialize)]
pub struct LibraryItem {
    /// Album folder name under `public/album/`, e.g. `fudge-38794683`.
    pub slug: String,
    pub discogs_id: Option<String>,
    pub title: String,
    pub artist: String,
    pub artists: Vec<ArtistRef>,
    /// Original release year when known, else the pressing's year.
    pub year: Option<i64>,
    pub released: Option<String>,
    pub date_added: Option<String>,
    pub genres: Vec<String>,
    pub styles: Vec<String>,
    pub format: Option<String>,
    pub vinyl_colours: Vec<String>,
    pub labels: Vec<String>,
    pub country: Option<String>,
    pub listeners: Option<i64>,
    /// Dominant artwork colour (`album-colors.json` "flood"), for placeholders.
    pub color: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ArtistRef {
    pub name: String,
    pub slug: Option<String>,
}

/// One artist in the artists grid, aggregated from the releases that credit them.
#[derive(Clone, Debug, Serialize)]
pub struct LibraryArtist {
    pub slug: String,
    pub name: String,
    pub release_count: usize,
    pub genres: Vec<String>,
    pub latest_added: Option<String>,
}

#[derive(Debug, Default)]
pub struct Library {
    pub items: Vec<LibraryItem>,
    pub artists: Vec<LibraryArtist>,
}

impl Library {
    pub fn item(&self, slug: &str) -> Option<&LibraryItem> {
        self.items.iter().find(|i| i.slug == slug)
    }

    /// Releases crediting the artist `slug`, newest first.
    pub fn releases_by(&self, slug: &str) -> Vec<LibraryItem> {
        self.items
            .iter()
            .filter(|i| i.artists.iter().any(|a| a.slug.as_deref() == Some(slug)))
            .cloned()
            .collect()
    }
}

/// `/album/fudge-38794683/` → `fudge-38794683`.
pub fn slug_of(uri: &str) -> Option<String> {
    let s = uri.trim_matches('/').rsplit('/').next()?;
    (!s.is_empty()).then(|| s.to_string())
}

/// The Discogs release ID is the album slug's numeric suffix.
fn discogs_id_of(slug: &str) -> Option<String> {
    let (_, id) = slug.rsplit_once('-')?;
    (!id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())).then(|| id.to_string())
}

fn strings(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
        .unwrap_or_default()
}

fn year_of(entry: &Value) -> Option<i64> {
    entry.get("year_original").and_then(Value::as_i64).filter(|y| *y > 0).or_else(|| {
        entry
            .get("date_release_year")
            .and_then(Value::as_str)
            .and_then(|d| d.get(..4))
            .and_then(|y| y.parse().ok())
            .filter(|y: &i64| *y > 0)
    })
}

/// Build the index from parsed `collection.json` entries and the `album-colors.json` map.
pub fn build(entries: &[Value], colors: &HashMap<String, Value>) -> Library {
    let mut items = Vec::with_capacity(entries.len());
    for e in entries {
        let Some(uri) = e.get("uri_release").and_then(Value::as_str) else { continue };
        let Some(slug) = slug_of(uri) else { continue };
        let str_of = |k: &str| e.get(k).and_then(Value::as_str).map(String::from);
        let artists = e
            .get("artists")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| {
                        Some(ArtistRef {
                            name: x.get("name")?.as_str()?.to_string(),
                            slug: x.get("uri_artist").and_then(Value::as_str).and_then(slug_of),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        items.push(LibraryItem {
            discogs_id: discogs_id_of(&slug),
            title: str_of("release_name").unwrap_or_default(),
            artist: str_of("release_artist").unwrap_or_default(),
            artists,
            year: year_of(e),
            released: str_of("date_release_year"),
            date_added: str_of("date_added"),
            genres: strings(e.get("genre_names")),
            styles: strings(e.get("styles")),
            format: str_of("format_primary"),
            vinyl_colours: strings(e.get("vinyl_colours")),
            labels: strings(e.get("labels")),
            country: str_of("country"),
            listeners: e.get("lastfm_listeners").and_then(Value::as_i64),
            color: colors.get(uri).and_then(|c| c.get("flood")).and_then(Value::as_str).map(String::from),
            slug,
        });
    }

    // Artists: one row per artist slug, counting the releases that credit them.
    let mut by_slug: HashMap<String, (LibraryArtist, HashMap<String, usize>)> = HashMap::new();
    for item in &items {
        for a in &item.artists {
            let Some(slug) = &a.slug else { continue };
            let (artist, genres) = by_slug.entry(slug.clone()).or_insert_with(|| {
                (
                    LibraryArtist {
                        slug: slug.clone(),
                        name: a.name.clone(),
                        release_count: 0,
                        genres: Vec::new(),
                        latest_added: None,
                    },
                    HashMap::new(),
                )
            });
            artist.release_count += 1;
            if item.date_added > artist.latest_added {
                artist.latest_added = item.date_added.clone();
            }
            for g in &item.genres {
                *genres.entry(g.clone()).or_default() += 1;
            }
        }
    }
    let mut artists: Vec<LibraryArtist> = by_slug
        .into_values()
        .map(|(mut a, genres)| {
            let mut g: Vec<(String, usize)> = genres.into_iter().collect();
            g.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(&y.0)));
            a.genres = g.into_iter().take(3).map(|(name, _)| name).collect();
            a
        })
        .collect();
    artists.sort_by_key(|a| a.name.to_lowercase());

    Library { items, artists }
}

/// Loads [`Library`] from the data directory and caches it until the source files change.
pub struct LibraryCache {
    data_dir: PathBuf,
    cached: Mutex<Option<(Stamp, Arc<Library>)>>,
}

type Stamp = (Option<SystemTime>, Option<SystemTime>);

fn mtime(p: &Path) -> Option<SystemTime> {
    std::fs::metadata(p).and_then(|m| m.modified()).ok()
}

impl LibraryCache {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir, cached: Mutex::new(None) }
    }

    fn collection_path(&self) -> PathBuf {
        self.data_dir.join("collection.json")
    }

    fn colors_path(&self) -> PathBuf {
        self.data_dir.join("album-colors.json")
    }

    /// The current library, rebuilding it if `collection.json` or `album-colors.json` changed.
    pub fn get(&self) -> Result<Arc<Library>> {
        let stamp = (mtime(&self.collection_path()), mtime(&self.colors_path()));
        if let Some((s, lib)) = self.cached.lock().expect("library cache").as_ref() {
            if *s == stamp {
                return Ok(lib.clone());
            }
        }
        let lib = Arc::new(self.load()?);
        *self.cached.lock().expect("library cache") = Some((stamp, lib.clone()));
        Ok(lib)
    }

    fn load(&self) -> Result<Library> {
        let path = self.collection_path();
        let entries: Vec<Value> = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).with_context(|| format!("parsing {}", path.display()))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e).with_context(|| format!("reading {}", path.display())),
        };
        // Colours are cosmetic: a missing or unreadable file just means no placeholders.
        let colors: HashMap<String, Value> = std::fs::read(self.colors_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Ok(build(&entries, &colors))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_items_and_artists() {
        let entries = vec![
            json!({
                "release_name": "Fudge", "release_artist": "Michael Kiwanuka",
                "artists": [{"name": "Michael Kiwanuka", "uri_artist": "/artist/michael-kiwanuka/"}],
                "genre_names": ["Soul", "Rock"], "uri_release": "/album/fudge-38794683/",
                "date_added": "2026-10-22", "date_release_year": "2026-10-23", "year_original": 2026,
                "vinyl_colours": ["Green Mint"], "format_primary": "Vinyl"
            }),
            json!({
                "release_name": "Love & Hate", "release_artist": "Michael Kiwanuka",
                "artists": [{"name": "Michael Kiwanuka", "uri_artist": "/artist/michael-kiwanuka/"}],
                "genre_names": ["Soul"], "uri_release": "/album/love-hate-9000/",
                "date_added": "2020-01-01", "date_release_year": "2016-07-15"
            }),
            json!({"release_name": "no uri"}),
        ];
        let colors = HashMap::from([("/album/fudge-38794683/".to_string(), json!({"flood": "#d5678d"}))]);
        let lib = build(&entries, &colors);
        assert_eq!(lib.items.len(), 2);
        let fudge = lib.item("fudge-38794683").unwrap();
        assert_eq!(fudge.discogs_id.as_deref(), Some("38794683"));
        assert_eq!(fudge.year, Some(2026));
        assert_eq!(fudge.color.as_deref(), Some("#d5678d"));
        assert_eq!(lib.item("love-hate-9000").unwrap().year, Some(2016), "falls back to the release date");

        assert_eq!(lib.artists.len(), 1);
        let a = &lib.artists[0];
        assert_eq!((a.slug.as_str(), a.release_count), ("michael-kiwanuka", 2));
        assert_eq!(a.genres.first().map(String::as_str), Some("Soul"));
        assert_eq!(a.latest_added.as_deref(), Some("2026-10-22"));
        assert_eq!(lib.releases_by("michael-kiwanuka").len(), 2);
    }

    #[test]
    fn slug_and_id_parsing() {
        assert_eq!(slug_of("/album/fudge-38794683/").as_deref(), Some("fudge-38794683"));
        assert_eq!(slug_of("/").as_deref(), None);
        assert_eq!(discogs_id_of("fudge-38794683").as_deref(), Some("38794683"));
        assert_eq!(discogs_id_of("no-id-here"), None);
    }
}
