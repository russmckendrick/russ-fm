//! Data-health checks for the web UI: what's missing or mismatched across the database and
//! `public/`, each with the commands that fix it (one item, or all of them at once).

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

use super::AppState;
use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::release::{release_folder, ReleaseField};
use crate::sanitize::sanitize_folder_name;

/// A record a check flagged.
#[derive(Debug, Serialize)]
pub struct Item {
    /// `release` or `artist`.
    pub kind: &'static str,
    pub slug: String,
    pub title: String,
    pub subtitle: String,
    /// Words after `scrapper` that fix this one item, when there's a direct fix.
    pub fix: Option<Vec<String>>,
    /// A web UI action instead of a command (`remove-folder`).
    pub action: Option<&'static str>,
}

#[derive(Debug, Serialize)]
pub struct Check {
    pub id: &'static str,
    pub group: &'static str,
    pub label: &'static str,
    pub help: &'static str,
    pub count: usize,
    /// Words after `scrapper` that fix every item, when a batch command does.
    pub fix_all: Option<Vec<String>>,
    pub fix_all_label: Option<&'static str>,
    /// Up to [`MAX_ITEMS`] of the flagged records, newest first.
    pub items: Vec<Item>,
}

const MAX_ITEMS: usize = 300;

fn words(w: &[&str]) -> Vec<String> {
    w.iter().map(|s| s.to_string()).collect()
}

fn first_artist(rec: &ReleaseRecord) -> String {
    rec.artists
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.get("name").and_then(Value::as_str)).collect::<Vec<_>>().join(", "))
        .unwrap_or_default()
}

/// Run every check. Reads the whole releases and artists tables plus a stat per artwork file,
/// so it takes a second or two on a large collection.
pub fn run(st: &AppState) -> Result<Vec<Check>> {
    let mut releases = st.db.get_all_releases()?;
    releases.sort_by(|a, b| b.date_added.cmp(&a.date_added));
    let mut artists = st.db.get_all_artists()?;
    artists.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let releases_dir = st.cfg.releases_dir();
    let artists_dir = st.cfg.artists_dir();
    let original_years: std::collections::HashSet<String> =
        st.db.releases_for_original_years(false, None)?.into_iter().map(|c| c.discogs_id).collect();

    let release_item = |r: &ReleaseRecord, fix: Option<Vec<String>>| {
        let slug = release_folder(r);
        Item { kind: "release", title: r.title.clone(), subtitle: first_artist(r), slug, fix, action: None }
    };
    let id_of = |r: &ReleaseRecord| r.discogs_id.clone().unwrap_or_else(|| r.id.clone());
    let release_check = |id: &'static str,
                         label: &'static str,
                         help: &'static str,
                         flagged: &dyn Fn(&ReleaseRecord) -> bool,
                         fix_one: &dyn Fn(&str) -> Option<Vec<String>>,
                         fix_all: Option<(&'static str, Vec<String>)>| {
        let hits: Vec<&ReleaseRecord> = releases.iter().filter(|r| flagged(r)).collect();
        Check {
            id,
            group: "Releases",
            label,
            help,
            count: hits.len(),
            fix_all_label: fix_all.as_ref().map(|f| f.0),
            fix_all: fix_all.map(|f| f.1),
            items: hits.iter().take(MAX_ITEMS).map(|r| release_item(r, fix_one(&id_of(r)))).collect(),
        }
    };
    let field_fix = |field: &'static str| move |id: &str| Some(words(&["release", id, "--field", field, "--interactive"]));

    let mut checks = vec![
        release_check(
            "release-apple",
            "No Apple Music match",
            "Without one there's no Apple Music link or editorial notes, and artwork falls back to other sources.",
            &|r| !ReleaseField::Apple.present(r),
            &field_fix("apple"),
            None,
        ),
        release_check(
            "release-spotify",
            "No Spotify match",
            "No Spotify link on the album page.",
            &|r| !ReleaseField::Spotify.present(r),
            &field_fix("spotify"),
            None,
        ),
        release_check(
            "release-lastfm",
            "No Last.fm match",
            "No listener counts or tags; these releases can't be scrobbled reliably.",
            &|r| !ReleaseField::Lastfm.present(r),
            &field_fix("lastfm"),
            None,
        ),
        release_check(
            "release-description",
            "No description",
            "The album page has no write-up.",
            &|r| !ReleaseField::Description.present(r),
            &|id| Some(words(&["enrich-description", id, "--force"])),
            Some(("Write 25 with Perplexity", words(&["enrich-description", "--limit", "25"]))),
        ),
        release_check(
            "release-tracks",
            "No tracklist",
            "Nothing to show or scrobble.",
            &|r| !ReleaseField::Tracks.present(r),
            &field_fix("tracks"),
            None,
        ),
        release_check(
            "release-videos",
            "No videos",
            "Not on /tv, and no videos on the album page.",
            &|r| !ReleaseField::Videos.present(r),
            &field_fix("videos"),
            Some(("Backfill videos", words(&["backfill-videos"]))),
        ),
        release_check(
            "release-artwork",
            "Artwork file missing",
            "No hi-res sleeve in public/album/<slug>/, so the site shows a placeholder.",
            &|r| {
                let slug = release_folder(r);
                !releases_dir.join(&slug).join(format!("{slug}-hi-res.jpg")).is_file()
            },
            &field_fix("images"),
            None,
        ),
        release_check(
            "release-original-year",
            "Original year not looked up",
            "Sorting by year uses the pressing's year until the Discogs master is checked.",
            &|r| r.discogs_id.as_ref().is_some_and(|id| original_years.contains(id)),
            &|_| None,
            Some(("Look up original years", words(&["backfill-original-years"]))),
        ),
    ];

    // Album folders whose release is gone from the database (`db delete` keeps the folder).
    let known: std::collections::HashSet<&str> = releases.iter().filter_map(|r| r.discogs_id.as_deref()).collect();
    let mut orphans: Vec<(std::time::SystemTime, String)> = std::fs::read_dir(&releases_dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| Some((e.metadata().and_then(|m| m.modified()).ok()?, e.file_name().to_string_lossy().into_owned())))
                .filter(|(_, slug)| orphan_id(slug).is_some_and(|id| !known.contains(id)))
                .collect()
        })
        .unwrap_or_default();
    orphans.sort_by_key(|o| std::cmp::Reverse(o.0));
    checks.push(Check {
        id: "release-orphan-folder",
        group: "Releases",
        label: "Album folders without a database record",
        help: "Left behind when a release is deleted from the database. Check it's not wanted, then remove it.",
        count: orphans.len(),
        fix_all: None,
        fix_all_label: None,
        items: orphans
            .into_iter()
            .take(MAX_ITEMS)
            .map(|(_, slug)| Item {
                kind: "release",
                title: slug.clone(),
                subtitle: "No database record".into(),
                slug,
                fix: None,
                action: Some("remove-folder"),
            })
            .collect(),
    });

    let artist_item = |a: &ArtistRecord, fix: Option<Vec<String>>| Item {
        kind: "artist",
        slug: sanitize_folder_name(&a.name),
        title: a.name.clone(),
        subtitle: a.discogs_id.as_deref().map(|d| format!("Discogs {d}")).unwrap_or_default(),
        fix,
        action: None,
    };
    let is_various = |a: &ArtistRecord| a.name.eq_ignore_ascii_case("various") || a.name.eq_ignore_ascii_case("various artists");
    let enrich = |a: &ArtistRecord| Some(words(&["artist", &a.name, "--save", "--interactive"]));
    let artist_check = |id: &'static str,
                        label: &'static str,
                        help: &'static str,
                        flagged: &dyn Fn(&ArtistRecord) -> bool,
                        fix_one: &dyn Fn(&ArtistRecord) -> Option<Vec<String>>,
                        fix_all: Option<(&'static str, Vec<String>)>| {
        let hits: Vec<&ArtistRecord> = artists.iter().filter(|a| !is_various(a) && flagged(a)).collect();
        Check {
            id,
            group: "Artists",
            label,
            help,
            count: hits.len(),
            fix_all_label: fix_all.as_ref().map(|f| f.0),
            fix_all: fix_all.map(|f| f.1),
            items: hits.iter().take(MAX_ITEMS).map(|a| artist_item(a, fix_one(a))).collect(),
        }
    };

    checks.extend([
        artist_check(
            "artist-unenriched",
            "Not enriched",
            "No Apple Music, Spotify or Last.fm match and no biography.",
            &|a| a.apple_music_id.is_none() && a.spotify_id.is_none() && a.lastfm_mbid.is_none() && a.biography.as_deref().unwrap_or("").is_empty(),
            &enrich,
            None,
        ),
        artist_check(
            "artist-photo",
            "Photo missing",
            "No hi-res photo in public/artist/<slug>/.",
            &|a| {
                let slug = sanitize_folder_name(&a.name);
                !artists_dir.join(&slug).join(format!("{slug}-hi-res.jpg")).is_file()
            },
            &enrich,
            None,
        ),
        artist_check(
            "artist-bio",
            "No biography",
            "The artist page has no text.",
            &|a| a.biography.as_deref().unwrap_or("").trim().is_empty(),
            &|a| Some(words(&["artist", &a.name, "--save", "--interactive", "--perplexity"])),
            None,
        ),
        artist_check(
            "artist-identity",
            "No Wikidata identity",
            "Wikipedia, TheAudioDB and Last.fm are matched by name until the Discogs ID is resolved.",
            &|a| a.discogs_id.is_some() && a.raw_data.get(crate::ops::identity::RAW_KEY).is_none(),
            &|a| Some(words(&["backfill-identities", "--artist", &a.name])),
            Some(("Resolve identities", words(&["backfill-identities"]))),
        ),
        artist_check(
            "artist-discogs",
            "No Discogs artist detail",
            "Only a placeholder where the Discogs artist belongs, so /explore has no members, groups or aliases for it.",
            &|a| !crate::ops::artist_discogs::has_discogs_detail(&a.raw_data),
            &|a| Some(words(&["backfill-artist-discogs", "--artist", &a.name])),
            Some(("Fetch from Discogs", words(&["backfill-artist-discogs"]))),
        ),
        artist_check(
            "artist-wikipedia",
            "No Wikipedia link",
            "No Wikipedia link on the artist page.",
            &|a| a.wikipedia_url.is_none(),
            &|a| Some(words(&["backfill-identities", "--artist", &a.name, "--force"])),
            None,
        ),
    ]);

    Ok(checks)
}

/// The Discogs ID at the end of an album folder name (`fudge-38794683` → `38794683`).
pub fn orphan_id(slug: &str) -> Option<&str> {
    let (_, id) = slug.rsplit_once('-')?;
    (!id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())).then_some(id)
}

/// Remove an album folder, but only when no database record has its Discogs ID.
pub fn remove_orphan_folder(st: &AppState, slug: &str) -> Result<()> {
    let id = orphan_id(slug).ok_or_else(|| anyhow::anyhow!("{slug} doesn't end in a Discogs ID"))?;
    if st.db.get_release_by_discogs_id(id)?.is_some() {
        anyhow::bail!("release {id} is in the database — delete it there first");
    }
    let dir = st.cfg.releases_dir().join(slug);
    if !dir.is_dir() {
        anyhow::bail!(super::api::NotFound(format!("no folder public/album/{slug}/")));
    }
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}
