//! SQLite access layer over the reused `collection_cache.db`.
//!
//! Schema is unchanged from the Python scrapper (tables `releases`, `artists`,
//! `collection_items`, `processing_log`; JSON stored as TEXT). Methods mirror
//! `utils/database.py`. The pool is opened with WAL; calls are synchronous and intended to be
//! invoked from blocking contexts (`tokio::task::spawn_blocking`) when used from async code.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde_json::Value;

use crate::sanitize::sanitize_folder_name;
use crate::util::now_iso;

pub type SqlitePool = Pool<SqliteConnectionManager>;
type PooledConn = r2d2::PooledConnection<SqliteConnectionManager>;

/// SQL predicate (mirrors [`Db::has_enriched_release`]) for a release with meaningful enrichment.
const RELEASE_ENRICHED: &str = "(enrichment_data IS NOT NULL AND enrichment_data != '' AND enrichment_data != '{}') \
     OR apple_music_id IS NOT NULL OR spotify_id IS NOT NULL OR lastfm_mbid IS NOT NULL";

/// SQL predicate for an artist with meaningful enrichment (service IDs or a biography).
const ARTIST_ENRICHED: &str = "apple_music_id IS NOT NULL OR spotify_id IS NOT NULL OR lastfm_mbid IS NOT NULL \
     OR (biography IS NOT NULL AND biography != '')";

#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
    path: PathBuf,
}

/// Aggregate database statistics (mirrors `get_stats`).
#[derive(Debug, Clone, Serialize, Default)]
pub struct Stats {
    pub total_releases: i64,
    pub total_artists: i64,
    pub total_collection_items: i64,
    pub processed_items: i64,
    pub enriched_items: i64,
}

/// Lightweight release row for listings/search.
#[derive(Debug, Clone, Serialize)]
pub struct ReleaseSummary {
    pub discogs_id: Option<String>,
    pub title: String,
    pub artist_names: Vec<String>,
    pub year: Option<i64>,
    pub date_added: Option<String>,
}

/// Lightweight artist row for listings/search.
#[derive(Debug, Clone, Serialize)]
pub struct ArtistSummary {
    pub id: String,
    pub name: String,
    pub discogs_id: Option<String>,
    pub created_at: Option<String>,
}

/// Full release record (all columns; JSON columns parsed to [`Value`]).
#[derive(Debug, Clone, Serialize)]
pub struct ReleaseRecord {
    pub id: String,
    pub discogs_id: Option<String>,
    pub title: String,
    pub artists: Value,
    pub year: Option<i64>,
    pub released: Option<String>,
    pub country: Option<String>,
    pub formats: Value,
    pub labels: Value,
    pub genres: Value,
    pub styles: Value,
    pub images: Value,
    pub tracklist: Value,
    pub videos: Value,
    pub apple_music_id: Option<String>,
    pub spotify_id: Option<String>,
    pub lastfm_mbid: Option<String>,
    pub discogs_url: Option<String>,
    pub apple_music_url: Option<String>,
    pub spotify_url: Option<String>,
    pub lastfm_url: Option<String>,
    pub release_name_discogs: Option<String>,
    pub release_name_apple_music: Option<String>,
    pub release_name_spotify: Option<String>,
    pub enrichment_data: Value,
    pub local_images: Value,
    pub raw_data: Value,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub date_added: Option<String>,
}

/// Full artist record (all columns; JSON columns parsed to [`Value`]).
#[derive(Debug, Clone, Serialize)]
pub struct ArtistRecord {
    pub id: String,
    pub name: String,
    pub biography: Option<String>,
    pub discogs_id: Option<String>,
    pub apple_music_id: Option<String>,
    pub spotify_id: Option<String>,
    pub lastfm_mbid: Option<String>,
    pub discogs_url: Option<String>,
    pub apple_music_url: Option<String>,
    pub spotify_url: Option<String>,
    pub lastfm_url: Option<String>,
    pub wikipedia_url: Option<String>,
    pub genres: Value,
    pub popularity: Option<i64>,
    pub followers: Option<i64>,
    pub country: Option<String>,
    pub formed_date: Option<String>,
    pub images: Value,
    pub local_images: Value,
    pub enrichment_data: Value,
    pub raw_data: Value,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Minimal release info used by description/video maintenance commands.
#[derive(Debug, Clone, Serialize)]
pub struct ReleaseBrief {
    pub discogs_id: Option<String>,
    pub title: String,
    pub artists: Vec<String>,
    pub year: Option<i64>,
    pub genres: Vec<String>,
    pub labels: Vec<String>,
    pub date_added: Option<String>,
}

/// A box-format release row for the TUI Boxsets screen.
#[derive(Debug, Clone, Serialize)]
pub struct BoxsetSummary {
    pub discogs_id: String,
    pub title: String,
    pub artist_names: Vec<String>,
    pub year: Option<i64>,
    pub date_added: Option<String>,
    /// The tracklist has album section headers, so discovery can find its members.
    pub has_headers: bool,
    /// Releases linked to this box via `raw_data.boxset.parent_discogs_id`.
    pub member_count: usize,
}

impl BoxsetSummary {
    /// At least one member album has been linked to this box.
    pub fn is_processed(&self) -> bool {
        self.member_count > 0
    }

    /// Mirrors `search_releases`: an exact Discogs ID, or a case-insensitive substring of the
    /// title or an artist name. An empty query matches everything.
    pub fn matches_query(&self, query: &str) -> bool {
        let q = query.trim();
        if q.is_empty() || self.discogs_id == q {
            return true;
        }
        let q = q.to_lowercase();
        self.title.to_lowercase().contains(&q) || self.artist_names.iter().any(|a| a.to_lowercase().contains(&q))
    }
}

fn parse_json(s: Option<String>, fallback: &str) -> Value {
    let raw = s.filter(|v| !v.is_empty()).unwrap_or_else(|| fallback.to_string());
    serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::from_str(fallback).unwrap())
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn artist_names(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn string_list(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

/// The album titles inside a boxset: tracklist section headers (rows with a title but no
/// position), as produced by Discogs box set tracklists.
pub fn boxset_section_headers(tracklist: &Value) -> Vec<String> {
    tracklist
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|t| t.get("position").and_then(|p| p.as_str()).unwrap_or("").trim().is_empty())
                .filter_map(|t| t.get("title").and_then(|v| v.as_str()))
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Whether a release's `formats[]` mark it as a box set — the same rule the collection
/// generator uses for `format_primary` ("Box Set"): any format string containing "box".
pub fn is_boxset_format(formats: &Value) -> bool {
    string_list(formats).iter().any(|f| f.to_lowercase().contains("box"))
}

impl Db {
    /// Open (or create) the pool with WAL enabled.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let manager = SqliteConnectionManager::file(&path).with_init(|c| {
            c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        });
        let pool = Pool::builder()
            .max_size(8)
            .build(manager)
            .with_context(|| format!("opening sqlite pool at {}", path.display()))?;
        Ok(Self { pool, path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn conn(&self) -> Result<PooledConn> {
        self.pool.get().context("getting pooled sqlite connection")
    }

    /// Aggregate statistics.
    pub fn stats(&self) -> Result<Stats> {
        let conn = self.conn()?;
        let count = |sql: &str| -> Result<i64> {
            Ok(conn.query_row(sql, [], |r| r.get(0))?)
        };
        Ok(Stats {
            total_releases: count("SELECT COUNT(*) FROM releases")?,
            total_artists: count("SELECT COUNT(*) FROM artists")?,
            total_collection_items: count("SELECT COUNT(*) FROM collection_items")?,
            processed_items: count("SELECT COUNT(*) FROM collection_items WHERE processed = 1")?,
            enriched_items: count("SELECT COUNT(*) FROM collection_items WHERE enriched = 1")?,
        })
    }

    /// True if a release has meaningful enrichment (mirrors `has_enriched_release`).
    pub fn has_enriched_release(&self, discogs_id: &str) -> Result<bool> {
        type EnrichRow = (Option<String>, Option<String>, Option<String>, Option<String>);
        let conn = self.conn()?;
        let row: Option<EnrichRow> = conn
            .query_row(
                "SELECT enrichment_data, apple_music_id, spotify_id, lastfm_mbid FROM releases WHERE discogs_id = ?",
                [discogs_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?;
        let Some((enrichment, am, sp, lf)) = row else { return Ok(false) };
        if let Some(e) = enrichment {
            if !e.is_empty() && e != "{}" {
                return Ok(true);
            }
        }
        Ok(am.is_some() || sp.is_some() || lf.is_some())
    }

    /// True if an artist has any meaningful enrichment (service IDs or a biography).
    pub fn has_enriched_artist(&self, id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let ok: Option<i64> = conn
            .query_row(
                &format!("SELECT 1 FROM artists WHERE id = ? AND ({ARTIST_ENRICHED})"),
                [id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(ok.is_some())
    }

    /// (enriched, total) artist counts for the dashboard.
    pub fn artist_enrichment_counts(&self) -> Result<(i64, i64)> {
        let conn = self.conn()?;
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM artists", [], |r| r.get(0))?;
        let enriched: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM artists WHERE {ARTIST_ENRICHED}"),
            [],
            |r| r.get(0),
        )?;
        Ok((enriched, total))
    }

    /// Un-enriched artist summaries (name order), excluding Various Artists, capped at `limit`.
    pub fn list_unenriched_artists(&self, limit: u32) -> Result<Vec<ArtistSummary>> {
        let conn = self.conn()?;
        let sql = format!(
            "SELECT id, name, discogs_id, created_at FROM artists \
             WHERE NOT ({ARTIST_ENRICHED}) \
               AND LOWER(name) NOT IN ('various', 'various artists') \
             ORDER BY name ASC LIMIT {limit}"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ArtistSummary {
                    id: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    discogs_id: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Set of artist ids that have meaningful enrichment (for list badges).
    pub fn enriched_artist_ids(&self) -> Result<HashSet<String>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&format!("SELECT id FROM artists WHERE {ARTIST_ENRICHED}"))?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        Ok(ids)
    }

    /// Set of release discogs_ids that have meaningful enrichment (for list badges).
    pub fn enriched_release_ids(&self) -> Result<HashSet<String>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&format!("SELECT discogs_id FROM releases WHERE discogs_id IS NOT NULL AND ({RELEASE_ENRICHED})"))?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<HashSet<_>>>()?;
        Ok(ids)
    }

    /// Collection item IDs that haven't been processed yet (resume mechanism).
    pub fn get_unprocessed_items(&self, limit: Option<u32>) -> Result<Vec<String>> {
        let conn = self.conn()?;
        let mut sql = "SELECT id FROM collection_items WHERE processed = 0".to_string();
        if let Some(l) = limit {
            sql.push_str(&format!(" LIMIT {l}"));
        }
        let mut stmt = conn.prepare(&sql)?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(ids)
    }

    /// Mark a collection item processed (and optionally enriched).
    pub fn mark_item_processed(&self, item_id: &str, enriched: bool) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "UPDATE collection_items SET processed = 1, enriched = ?, updated_at = ? WHERE id = ?",
            rusqlite::params![enriched, Utc::now().to_rfc3339(), item_id],
        )?;
        Ok(())
    }

    /// Mark a release's collection item processed/enriched, inserting one if none exists.
    pub fn record_processed(
        &self,
        release_db_id: &str,
        discogs_id: &str,
        instance_id: Option<&str>,
        date_added: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn()?;
        let now = Utc::now().to_rfc3339();
        let n = conn.execute(
            "UPDATE collection_items SET processed = 1, enriched = 1, updated_at = ?1 \
             WHERE release_id IN (SELECT id FROM releases WHERE discogs_id = ?2)",
            rusqlite::params![now, discogs_id],
        )?;
        if n == 0 {
            let id = instance_id.map(str::to_string).unwrap_or_else(|| release_db_id.to_string());
            conn.execute(
                "INSERT OR REPLACE INTO collection_items \
                 (id, release_id, instance_id, date_added, processed, enriched, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, ?5)",
                rusqlite::params![id, release_db_id, instance_id, date_added, now],
            )?;
        }
        Ok(())
    }

    /// Copy the database file to `dest` (mirrors `backup_database`).
    pub fn backup_database(&self, dest: impl AsRef<Path>) -> Result<()> {
        // Ensure WAL contents are flushed into the main file before copying.
        {
            let conn = self.conn()?;
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        std::fs::copy(&self.path, dest.as_ref())
            .with_context(|| format!("copying db to {}", dest.as_ref().display()))?;
        Ok(())
    }

    // ---- Listings & search ----

    pub fn list_releases(&self, limit: u32, sort: &str) -> Result<Vec<ReleaseSummary>> {
        let order = match sort {
            "title" => "title ASC",
            "year" => "year DESC",
            _ => "date_added DESC",
        };
        let conn = self.conn()?;
        let sql = format!(
            "SELECT discogs_id, title, artists, year, date_added FROM releases ORDER BY {order} LIMIT {limit}"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ReleaseSummary {
                    discogs_id: r.get(0)?,
                    title: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    artist_names: artist_names(&parse_json(r.get(2)?, "[]")),
                    year: r.get(3)?,
                    date_added: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn search_releases(&self, query: &str, limit: u32) -> Result<Vec<ReleaseSummary>> {
        let conn = self.conn()?;
        let like = format!("%{query}%");
        let mut stmt = conn.prepare(
            "SELECT discogs_id, title, artists, year, date_added FROM releases \
             WHERE discogs_id = ?1 OR LOWER(title) LIKE LOWER(?2) OR LOWER(artists) LIKE LOWER(?2) \
             ORDER BY date_added DESC LIMIT ?3",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![query, like, limit], |r| {
                Ok(ReleaseSummary {
                    discogs_id: r.get(0)?,
                    title: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    artist_names: artist_names(&parse_json(r.get(2)?, "[]")),
                    year: r.get(3)?,
                    date_added: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    // ---- Boxsets ----

    /// `raw_data.boxset.parent_discogs_id` → number of releases linked to that box.
    pub fn boxset_member_counts(&self) -> Result<HashMap<String, usize>> {
        let conn = self.conn()?;
        // Legacy rows can hold '' or non-JSON text in raw_data, and json_extract errors on
        // malformed input, so invalid documents are treated as empty.
        let mut stmt = conn.prepare(
            "SELECT parent, COUNT(*) FROM ( \
                SELECT json_extract(CASE WHEN json_valid(raw_data) THEN raw_data ELSE '{}' END, \
                                    '$.boxset.parent_discogs_id') AS parent FROM releases \
             ) WHERE parent IS NOT NULL GROUP BY parent",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let parent = match r.get::<_, rusqlite::types::Value>(0)? {
                    rusqlite::types::Value::Text(t) => t,
                    rusqlite::types::Value::Integer(i) => i.to_string(),
                    other => format!("{other:?}"),
                };
                Ok((parent, r.get::<_, i64>(1)?.max(0) as usize))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows.into_iter().collect())
    }

    /// Box-format releases (see [`is_boxset_format`]), newest first, with what the Boxsets
    /// screen needs: whether discovery can run and how many members are already linked.
    pub fn list_boxsets(&self) -> Result<Vec<BoxsetSummary>> {
        let members = self.boxset_member_counts()?;
        let conn = self.conn()?;
        // LIKE is a cheap superset prefilter on the raw JSON text; the exact rule runs in Rust.
        let mut stmt = conn.prepare(
            "SELECT discogs_id, title, artists, year, date_added, formats, tracklist FROM releases \
             WHERE discogs_id IS NOT NULL AND LOWER(formats) LIKE '%box%' ORDER BY date_added DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    parse_json(r.get(2)?, "[]"),
                    r.get::<_, Option<i64>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    parse_json(r.get(5)?, "[]"),
                    parse_json(r.get(6)?, "[]"),
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows
            .into_iter()
            .filter(|(_, _, _, _, _, formats, _)| is_boxset_format(formats))
            .map(|(discogs_id, title, artists, year, date_added, _, tracklist)| BoxsetSummary {
                member_count: members.get(&discogs_id).copied().unwrap_or(0),
                has_headers: !boxset_section_headers(&tracklist).is_empty(),
                artist_names: artist_names(&artists),
                discogs_id,
                title,
                year,
                date_added,
            })
            .collect())
    }

    pub fn list_artists(&self, limit: u32, sort: &str) -> Result<Vec<ArtistSummary>> {
        let order = match sort {
            "created_at" => "created_at DESC",
            _ => "name ASC",
        };
        let conn = self.conn()?;
        let sql = format!("SELECT id, name, discogs_id, created_at FROM artists ORDER BY {order} LIMIT {limit}");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ArtistSummary {
                    id: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    discogs_id: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn search_artists(&self, query: &str, limit: u32) -> Result<Vec<ArtistSummary>> {
        let conn = self.conn()?;
        let like = format!("%{query}%");
        let mut stmt = conn.prepare(
            "SELECT id, name, discogs_id, created_at FROM artists \
             WHERE LOWER(name) LIKE LOWER(?1) OR discogs_id = ?2 OR id = ?2 \
             ORDER BY name ASC LIMIT ?3",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![like, query, limit], |r| {
                Ok(ArtistSummary {
                    id: r.get(0)?,
                    name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    discogs_id: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    // ---- Full-record fetches ----

    pub fn get_release_by_discogs_id(&self, discogs_id: &str) -> Result<Option<ReleaseRecord>> {
        let conn = self.conn()?;
        let rec = conn
            .query_row("SELECT * FROM releases WHERE discogs_id = ?", [discogs_id], row_to_release)
            .optional()?;
        Ok(rec)
    }

    pub fn get_artist_by_name(&self, name: &str) -> Result<Option<ArtistRecord>> {
        let conn = self.conn()?;
        let rec = conn
            .query_row("SELECT * FROM artists WHERE LOWER(name) = LOWER(?)", [name], row_to_artist)
            .optional()?;
        Ok(rec)
    }

    pub fn get_artist_by_id(&self, id: &str) -> Result<Option<ArtistRecord>> {
        let conn = self.conn()?;
        let rec = conn
            .query_row("SELECT * FROM artists WHERE id = ?", [id], row_to_artist)
            .optional()?;
        Ok(rec)
    }

    pub fn get_artist_by_discogs_id(&self, discogs_id: &str) -> Result<Option<ArtistRecord>> {
        let conn = self.conn()?;
        let rec = conn
            .query_row("SELECT * FROM artists WHERE discogs_id = ?", [discogs_id], row_to_artist)
            .optional()?;
        Ok(rec)
    }

    /// All releases as full records (for collection.json generation).
    pub fn get_all_releases(&self) -> Result<Vec<ReleaseRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT * FROM releases")?;
        let rows = stmt
            .query_map([], row_to_release)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Releases whose `artists[]` embeds the given artist. Matches the way
    /// `enriched_release_artist` joins at JSON-write time — entry `discogs_id` (string form)
    /// first, case-insensitive name as the fallback — so a changed artist record fans out to
    /// every release JSON that would render it.
    pub fn releases_embedding_artist(&self, discogs_id: Option<&str>, name: &str) -> Result<Vec<ReleaseRecord>> {
        let name_lower = name.to_lowercase();
        let all = self.get_all_releases()?;
        Ok(all
            .into_iter()
            .filter(|r| {
                r.artists.as_array().is_some_and(|entries| {
                    entries.iter().any(|e| {
                        let by_id = discogs_id.is_some() && e.get("discogs_id").and_then(|d| d.as_str()) == discogs_id;
                        let by_name = e.get("name").and_then(|n| n.as_str()).is_some_and(|n| n.to_lowercase() == name_lower);
                        by_id || by_name
                    })
                })
            })
            .collect())
    }

    /// All release discogs_ids (for batch regeneration/verification).
    pub fn all_release_discogs_ids(&self) -> Result<Vec<String>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT discogs_id FROM releases WHERE discogs_id IS NOT NULL")?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(ids)
    }

    // ---- Maintenance / enrichment helpers ----

    /// Releases lacking any description (Apple editorial, Last.fm wiki, or Perplexity).
    pub fn get_releases_without_description(&self, limit: Option<u32>) -> Result<Vec<ReleaseBrief>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT discogs_id, title, artists, year, genres, labels, raw_data FROM releases WHERE discogs_id IS NOT NULL",
        )?;
        let mut out = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let raw: Value = parse_json(row.get(6)?, "{}");
            // Rust-written rows store services at the top level of raw_data; legacy Python rows
            // nested them under raw_data.services. Check both.
            let svc = |key: &str| raw.get(key).or_else(|| raw.get("services").and_then(|s| s.get(key)));
            let has_apple = svc("apple_music")
                .map(|am| {
                    am.get("raw_attributes").and_then(|a| a.get("editorialNotes")).is_some()
                        || am.get("editorial_notes").is_some()
                })
                .unwrap_or(false);
            let has_lastfm = svc("lastfm")
                .map(|lf| lf.get("wiki_summary").is_some() || lf.get("wiki_content").is_some())
                .unwrap_or(false);
            let has_perplexity = svc("perplexity")
                .and_then(|p| p.get("description"))
                .map(|d| !d.is_null())
                .unwrap_or(false);
            if has_apple || has_lastfm || has_perplexity {
                continue;
            }
            out.push(ReleaseBrief {
                discogs_id: row.get(0)?,
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                artists: artist_names(&parse_json(row.get(2)?, "[]")),
                year: row.get(3)?,
                genres: string_list(&parse_json(row.get(4)?, "[]")),
                labels: string_list(&parse_json(row.get(5)?, "[]")),
                date_added: None,
            });
            if let Some(l) = limit {
                if out.len() >= l as usize {
                    break;
                }
            }
        }
        Ok(out)
    }

    /// Releases with no videos populated (mirrors `get_releases_without_videos`).
    pub fn get_releases_without_videos(
        &self,
        limit: Option<u32>,
        from_id: Option<&str>,
    ) -> Result<Vec<ReleaseBrief>> {
        let conn = self.conn()?;
        let mut sql = String::from(
            "SELECT discogs_id, title, artists, year, genres, date_added FROM releases \
             WHERE discogs_id IS NOT NULL AND (videos IS NULL OR videos = '[]')",
        );
        let mut start_date: Option<String> = None;
        if let Some(fid) = from_id {
            start_date = conn
                .query_row("SELECT date_added FROM releases WHERE discogs_id = ?", [fid], |r| r.get(0))
                .optional()?
                .flatten();
            if start_date.is_some() {
                sql.push_str(" AND date_added <= ?1");
            }
        }
        sql.push_str(" ORDER BY date_added DESC");
        if let Some(l) = limit {
            sql.push_str(&format!(" LIMIT {l}"));
        }
        let mut stmt = conn.prepare(&sql)?;
        let map = |row: &rusqlite::Row| -> rusqlite::Result<ReleaseBrief> {
            Ok(ReleaseBrief {
                discogs_id: row.get(0)?,
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                artists: artist_names(&parse_json(row.get(2)?, "[]")),
                year: row.get(3)?,
                genres: string_list(&parse_json(row.get(4)?, "[]")),
                labels: Vec::new(),
                date_added: row.get(5)?,
            })
        };
        let rows: Vec<ReleaseBrief> = match start_date {
            Some(d) => stmt.query_map([d], map)?.collect::<rusqlite::Result<_>>()?,
            None => stmt.query_map([], map)?.collect::<rusqlite::Result<_>>()?,
        };
        Ok(rows)
    }

    /// Release briefs for the video backfill. When `force`, includes releases that already have
    /// videos; otherwise only those missing them.
    pub fn releases_for_backfill(&self, force: bool, limit: Option<u32>, from_id: Option<&str>) -> Result<Vec<ReleaseBrief>> {
        if !force {
            return self.get_releases_without_videos(limit, from_id);
        }
        let conn = self.conn()?;
        let mut sql = String::from(
            "SELECT discogs_id, title, artists, year, genres, date_added FROM releases WHERE discogs_id IS NOT NULL",
        );
        let mut start_date: Option<String> = None;
        if let Some(fid) = from_id {
            start_date = conn
                .query_row("SELECT date_added FROM releases WHERE discogs_id = ?", [fid], |r| r.get(0))
                .optional()?
                .flatten();
            if start_date.is_some() {
                sql.push_str(" AND date_added <= ?1");
            }
        }
        sql.push_str(" ORDER BY date_added DESC");
        if let Some(l) = limit {
            sql.push_str(&format!(" LIMIT {l}"));
        }
        let mut stmt = conn.prepare(&sql)?;
        let map = |row: &rusqlite::Row| -> rusqlite::Result<ReleaseBrief> {
            Ok(ReleaseBrief {
                discogs_id: row.get(0)?,
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                artists: artist_names(&parse_json(row.get(2)?, "[]")),
                year: row.get(3)?,
                genres: string_list(&parse_json(row.get(4)?, "[]")),
                labels: Vec::new(),
                date_added: row.get(5)?,
            })
        };
        let rows: Vec<ReleaseBrief> = match start_date {
            Some(d) => stmt.query_map([d], map)?.collect::<rusqlite::Result<_>>()?,
            None => stmt.query_map([], map)?.collect::<rusqlite::Result<_>>()?,
        };
        Ok(rows)
    }

    pub fn update_release_videos(&self, discogs_id: &str, videos_json: &str) -> Result<bool> {
        let conn = self.conn()?;
        let n = conn.execute(
            "UPDATE releases SET videos = ?, updated_at = ? WHERE discogs_id = ?",
            rusqlite::params![videos_json, Utc::now().to_rfc3339(), discogs_id],
        )?;
        Ok(n > 0)
    }

    /// Merge a Perplexity description object into the canonical top-level `raw_data.perplexity`
    /// (the location the pipeline, TUI editor and `release_services` use), clearing any legacy
    /// `raw_data.services.perplexity` so a row never carries both.
    pub fn update_release_perplexity_description(&self, discogs_id: &str, data: &Value) -> Result<bool> {
        let conn = self.conn()?;
        let raw: Option<Option<String>> = conn
            .query_row("SELECT raw_data FROM releases WHERE discogs_id = ?", [discogs_id], |r| r.get(0))
            .optional()?;
        let Some(raw) = raw else { return Ok(false) };
        let mut raw_data: Value = parse_json(raw, "{}");
        if !raw_data.is_object() {
            raw_data = serde_json::json!({});
        }
        let obj = raw_data.as_object_mut().unwrap();
        obj.insert("perplexity".to_string(), data.clone());
        if let Some(s) = obj.get_mut("services").and_then(|s| s.as_object_mut()) {
            s.remove("perplexity");
        }
        conn.execute(
            "UPDATE releases SET raw_data = ?, updated_at = ? WHERE discogs_id = ?",
            rusqlite::params![raw_data.to_string(), Utc::now().to_rfc3339(), discogs_id],
        )?;
        Ok(true)
    }

    /// Insert or replace a full release row.
    pub fn save_release(&self, rec: &ReleaseRecord) -> Result<()> {
        let conn = self.conn()?;
        let j = |v: &Value| v.to_string();
        conn.execute(
            "INSERT OR REPLACE INTO releases (\
                id, discogs_id, title, artists, year, released, country, formats, labels, genres, \
                styles, images, tracklist, videos, release_name_discogs, release_name_apple_music, \
                release_name_spotify, apple_music_id, spotify_id, lastfm_mbid, discogs_url, \
                apple_music_url, spotify_url, lastfm_url, enrichment_data, created_at, updated_at, \
                date_added, local_images, raw_data\
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30)",
            rusqlite::params![
                rec.id,
                rec.discogs_id,
                rec.title,
                j(&rec.artists),
                rec.year,
                rec.released,
                rec.country,
                j(&rec.formats),
                j(&rec.labels),
                j(&rec.genres),
                j(&rec.styles),
                j(&rec.images),
                j(&rec.tracklist),
                j(&rec.videos),
                rec.release_name_discogs,
                rec.release_name_apple_music,
                rec.release_name_spotify,
                rec.apple_music_id,
                rec.spotify_id,
                rec.lastfm_mbid,
                rec.discogs_url,
                rec.apple_music_url,
                rec.spotify_url,
                rec.lastfm_url,
                j(&rec.enrichment_data),
                rec.created_at,
                rec.updated_at,
                rec.date_added,
                j(&rec.local_images),
                j(&rec.raw_data),
            ],
        )?;
        self.seed_release_artists(&conn, &rec.artists)?;
        Ok(())
    }

    /// Backfill artist placeholder rows from artists already stored on release rows.
    pub fn seed_missing_artists_from_releases(&self) -> Result<usize> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT artists FROM releases WHERE artists IS NOT NULL AND artists != ''")?;
        let rows = stmt
            .query_map([], |r| r.get::<_, Option<String>>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(stmt);

        let mut seeded = 0usize;
        for raw in rows {
            let artists = parse_json(raw, "[]");
            seeded += self.seed_release_artists(&conn, &artists)?;
        }

        Ok(seeded)
    }

    /// Ensure artists credited on saved releases are discoverable by artist-batch.
    fn seed_release_artists(&self, conn: &PooledConn, artists: &Value) -> Result<usize> {
        let Some(entries) = artists.as_array() else {
            return Ok(0);
        };

        let mut seeded = 0usize;
        for entry in entries {
            let Some(name) = entry
                .get("name")
                .and_then(|n| n.as_str())
                .map(str::trim)
                .filter(|n| !n.is_empty())
            else {
                continue;
            };

            let discogs_id = entry.get("discogs_id").and_then(value_to_string);
            let now = now_iso();
            let id = format!("{}-{}", sanitize_folder_name(name), chrono::Local::now().timestamp());
            seeded += conn.execute(
                "INSERT INTO artists (
                    id, name, discogs_id, genres, images, local_images,
                    enrichment_data, raw_data, created_at, updated_at
                )
                SELECT ?1, ?2, ?3, '[]', '[]', '{}', '{}', '{}', ?4, ?4
                WHERE NOT EXISTS (
                    SELECT 1 FROM artists
                    WHERE LOWER(name) = LOWER(?2)
                    OR (?3 IS NOT NULL AND discogs_id = ?3)
                )",
                rusqlite::params![id, name, discogs_id, now],
            )?;
        }

        Ok(seeded)
    }

    /// Delete a release row (db-manager). Caller is responsible for backing up first.
    pub fn delete_release(&self, discogs_id: &str) -> Result<bool> {
        let conn = self.conn()?;
        let n = conn.execute("DELETE FROM releases WHERE discogs_id = ?", [discogs_id])?;
        Ok(n > 0)
    }

    /// Insert or replace a full artist row.
    pub fn save_artist(&self, rec: &ArtistRecord) -> Result<()> {
        let conn = self.conn()?;
        let j = |v: &Value| v.to_string();
        conn.execute(
            "INSERT OR REPLACE INTO artists (\
                id, name, biography, discogs_id, apple_music_id, spotify_id, lastfm_mbid, \
                discogs_url, apple_music_url, spotify_url, lastfm_url, wikipedia_url, genres, \
                popularity, followers, country, formed_date, images, local_images, \
                enrichment_data, created_at, updated_at, raw_data\
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
            rusqlite::params![
                rec.id,
                rec.name,
                rec.biography,
                rec.discogs_id,
                rec.apple_music_id,
                rec.spotify_id,
                rec.lastfm_mbid,
                rec.discogs_url,
                rec.apple_music_url,
                rec.spotify_url,
                rec.lastfm_url,
                rec.wikipedia_url,
                j(&rec.genres),
                rec.popularity,
                rec.followers,
                rec.country,
                rec.formed_date,
                j(&rec.images),
                j(&rec.local_images),
                j(&rec.enrichment_data),
                rec.created_at,
                rec.updated_at,
                j(&rec.raw_data),
            ],
        )?;
        Ok(())
    }

    /// Delete an artist row by id or name (db-manager). Caller backs up first.
    pub fn delete_artist(&self, identifier: &str) -> Result<bool> {
        let conn = self.conn()?;
        let n = conn.execute(
            "DELETE FROM artists WHERE id = ?1 OR LOWER(name) = LOWER(?1)",
            [identifier],
        )?;
        Ok(n > 0)
    }
}

fn row_to_release(row: &rusqlite::Row) -> rusqlite::Result<ReleaseRecord> {
    let get_s = |name: &str| -> rusqlite::Result<Option<String>> { row.get(name) };
    Ok(ReleaseRecord {
        id: row.get::<_, Option<String>>("id")?.unwrap_or_default(),
        discogs_id: get_s("discogs_id")?,
        title: get_s("title")?.unwrap_or_default(),
        artists: parse_json(get_s("artists")?, "[]"),
        year: row.get("year")?,
        released: get_s("released")?,
        country: get_s("country")?,
        formats: parse_json(get_s("formats")?, "[]"),
        labels: parse_json(get_s("labels")?, "[]"),
        genres: parse_json(get_s("genres")?, "[]"),
        styles: parse_json(get_s("styles")?, "[]"),
        images: parse_json(get_s("images")?, "[]"),
        tracklist: parse_json(get_s("tracklist")?, "[]"),
        videos: parse_json(get_s("videos")?, "[]"),
        apple_music_id: get_s("apple_music_id")?,
        spotify_id: get_s("spotify_id")?,
        lastfm_mbid: get_s("lastfm_mbid")?,
        discogs_url: get_s("discogs_url")?,
        apple_music_url: get_s("apple_music_url")?,
        spotify_url: get_s("spotify_url")?,
        lastfm_url: get_s("lastfm_url")?,
        release_name_discogs: get_s("release_name_discogs")?,
        release_name_apple_music: get_s("release_name_apple_music")?,
        release_name_spotify: get_s("release_name_spotify")?,
        enrichment_data: parse_json(get_s("enrichment_data")?, "{}"),
        local_images: parse_json(get_s("local_images")?, "{}"),
        raw_data: parse_json(get_s("raw_data")?, "{}"),
        created_at: get_s("created_at")?,
        updated_at: get_s("updated_at")?,
        date_added: get_s("date_added")?,
    })
}

fn row_to_artist(row: &rusqlite::Row) -> rusqlite::Result<ArtistRecord> {
    let get_s = |name: &str| -> rusqlite::Result<Option<String>> { row.get(name) };
    Ok(ArtistRecord {
        id: row.get::<_, Option<String>>("id")?.unwrap_or_default(),
        name: get_s("name")?.unwrap_or_default(),
        biography: get_s("biography")?,
        discogs_id: get_s("discogs_id")?,
        apple_music_id: get_s("apple_music_id")?,
        spotify_id: get_s("spotify_id")?,
        lastfm_mbid: get_s("lastfm_mbid")?,
        discogs_url: get_s("discogs_url")?,
        apple_music_url: get_s("apple_music_url")?,
        spotify_url: get_s("spotify_url")?,
        lastfm_url: get_s("lastfm_url")?,
        wikipedia_url: get_s("wikipedia_url")?,
        genres: parse_json(get_s("genres")?, "[]"),
        popularity: row.get("popularity")?,
        followers: row.get("followers")?,
        country: get_s("country")?,
        formed_date: get_s("formed_date")?,
        images: parse_json(get_s("images")?, "[]"),
        local_images: parse_json(get_s("local_images")?, "{}"),
        enrichment_data: parse_json(get_s("enrichment_data")?, "{}"),
        raw_data: parse_json(get_s("raw_data")?, "{}"),
        created_at: get_s("created_at")?,
        updated_at: get_s("updated_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn boxset_section_headers_are_position_less_titles() {
        let tracklist = json!([
            {"position": "", "title": "Life In A Day", "duration": ""},
            {"position": "A1", "title": "Someone", "duration": "3:39"},
            {"position": "", "title": "Real To Real Cacophony.", "duration": ""},
            {"position": "B1", "title": "Real To Real", "duration": "3:23"},
            {"position": "  ", "title": "  ", "duration": ""}
        ]);
        assert_eq!(boxset_section_headers(&tracklist), vec!["Life In A Day".to_string(), "Real To Real Cacophony.".to_string()]);
    }

    #[test]
    fn boxset_section_headers_empty_for_flat_tracklists() {
        let tracklist = json!([{"position": "A1", "title": "Airbag"}, {"position": "A2", "title": "Paranoid Android"}]);
        assert!(boxset_section_headers(&tracklist).is_empty());
        assert!(boxset_section_headers(&json!(null)).is_empty());
    }

    #[test]
    fn boxset_format_matches_any_box_entry_case_insensitively() {
        assert!(is_boxset_format(&json!(["Box Set", "CD"])));
        assert!(is_boxset_format(&json!(["Vinyl", "LP", "BOX"])));
        assert!(!is_boxset_format(&json!(["Vinyl", "LP", "Album"])));
        assert!(!is_boxset_format(&json!([])));
        assert!(!is_boxset_format(&json!("Box Set")));
    }

    #[test]
    fn boxset_summary_query_matches_id_title_or_artist() {
        let s = BoxsetSummary {
            discogs_id: "7709507".into(),
            title: "The Vinyl Collection 79-84".into(),
            artist_names: vec!["Simple Minds".into()],
            year: Some(2015),
            date_added: None,
            has_headers: true,
            member_count: 7,
        };
        assert!(s.matches_query(""));
        assert!(s.matches_query("7709507"));
        assert!(!s.matches_query("770950"));
        assert!(s.matches_query("vinyl collection"));
        assert!(s.matches_query("SIMPLE"));
        assert!(!s.matches_query("Bowie"));
        assert!(s.is_processed());
    }
}
