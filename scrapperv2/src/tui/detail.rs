//! Read-only detail drill-down for a release or an artist. Renders the DB record plus a check
//! of which image/JSON files exist on disk under `../public`. Never writes.

use ratatui::prelude::*;
use ratatui::widgets::{Paragraph, Wrap};

use crate::db::{ArtistRecord, ReleaseRecord};
use crate::sanitize::{release_folder_name, sanitize_folder_name};

use super::app::App;
use super::theme;

/// What the detail view is showing (boxed — the records are large).
pub(crate) enum DetailView {
    Release(Box<ReleaseRecord>),
    Artist(Box<ArtistRecord>),
}

impl DetailView {
    /// True for an artist (which supports the `e` enrich action).
    pub(crate) fn is_artist(&self) -> bool {
        matches!(self, DetailView::Artist(_))
    }
}

/// A "label ✓ value" row.
fn field(label: &str, present: bool, value: impl Into<String>) -> Line<'static> {
    Line::from(vec![
        Span::raw(format!("   {label:<14} ")),
        theme::badge(present),
        Span::raw("  "),
        Span::styled(value.into(), theme::dim()),
    ])
}

fn heading(text: String) -> Line<'static> {
    Line::from(Span::styled(format!("   {text}"), theme::title_style()))
}

fn opt(s: &Option<String>) -> String {
    s.clone().unwrap_or_default()
}

fn file_exists(dir: &std::path::Path, name: &str) -> bool {
    dir.join(name).exists()
}

pub(crate) fn draw_detail(f: &mut Frame, area: Rect, app: &App) {
    let lines = match app.detail.as_ref().expect("detail active") {
        DetailView::Release(rec) => release_lines(app, rec),
        DetailView::Artist(rec) => artist_lines(app, rec),
    };
    let title = match app.detail.as_ref().unwrap() {
        DetailView::Release(_) => "Release",
        DetailView::Artist(_) => "Artist",
    };
    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }).block(theme::panel(title)), area);
}

fn artist_lines(app: &App, rec: &ArtistRecord) -> Vec<Line<'static>> {
    let folder = sanitize_folder_name(&rec.name);
    let dir = app.cfg.artists_dir().join(&folder);
    let genres = rec
        .genres
        .as_array()
        .map(|a| a.iter().filter_map(|g| g.as_str()).collect::<Vec<_>>().join(", "))
        .unwrap_or_default();

    let mut lines = vec![
        Line::from(""),
        heading(rec.name.clone()),
        Line::from(""),
        field("Discogs", rec.discogs_id.is_some(), opt(&rec.discogs_id)),
        field("Apple Music", rec.apple_music_id.is_some(), opt(&rec.apple_music_url)),
        field("Spotify", rec.spotify_id.is_some(), opt(&rec.spotify_url)),
        field("Last.fm", rec.lastfm_mbid.is_some(), opt(&rec.lastfm_url)),
        field("Wikipedia", rec.wikipedia_url.is_some(), opt(&rec.wikipedia_url)),
        field("Genres", !genres.is_empty(), genres),
        field(
            "Popularity",
            rec.popularity.is_some() || rec.followers.is_some(),
            format!("{} · {} followers", rec.popularity.unwrap_or(0), rec.followers.unwrap_or(0)),
        ),
        Line::from(""),
        field("Image hi-res", file_exists(&dir, &format!("{folder}-hi-res.jpg")), String::new()),
        field("Image medium", file_exists(&dir, &format!("{folder}-medium.jpg")), String::new()),
        field("Image avatar", file_exists(&dir, &format!("{folder}-avatar.jpg")), String::new()),
        field("Public JSON", file_exists(&dir, &format!("{folder}.json")), dir.display().to_string()),
        field("Updated", rec.updated_at.is_some(), opt(&rec.updated_at)),
    ];

    if let Some(bio) = rec.biography.as_deref().filter(|b| !b.is_empty()) {
        lines.push(Line::from(""));
        lines.push(heading("Biography".into()));
        lines.push(Line::from(format!("   {bio}")));
    }

    if app.artist_running {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled("   enriching…", theme::border())));
    }
    for l in app.artist_log.iter().rev().take(4).rev() {
        lines.push(Line::from(Span::styled(format!("   {l}"), theme::dim())));
    }
    lines
}

fn release_lines(app: &App, rec: &ReleaseRecord) -> Vec<Line<'static>> {
    let folder = release_folder_name(&rec.title, rec.discogs_id.as_deref().unwrap_or(&rec.id));
    let dir = app.cfg.releases_dir().join(&folder);

    let artists = rec
        .artists
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
        .unwrap_or_default();
    let tracks = rec.tracklist.as_array().map(|a| a.len()).unwrap_or(0);
    let videos = rec.videos.as_array().map(|a| a.len()).unwrap_or(0);
    let bio_present = rec
        .artists
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.get("biography"))
        .map(|b| !b.is_null())
        .unwrap_or(false);
    let perplexity = rec.raw_data.get("perplexity").is_some()
        || rec.raw_data.get("services").and_then(|s| s.get("perplexity")).is_some();

    vec![
        Line::from(""),
        heading(format!("{}  ({})", rec.title, rec.year.unwrap_or(0))),
        Line::from(Span::styled(format!("   {artists}"), theme::dim())),
        Line::from(""),
        field("Discogs", rec.discogs_id.is_some(), opt(&rec.discogs_id)),
        field("Apple Music", rec.apple_music_id.is_some(), opt(&rec.apple_music_url)),
        field("Spotify", rec.spotify_id.is_some(), opt(&rec.spotify_url)),
        field("Last.fm", rec.lastfm_mbid.is_some(), opt(&rec.lastfm_url)),
        field("Tracks", tracks > 0, tracks.to_string()),
        field("Videos", videos > 0, videos.to_string()),
        field("Artist bio", bio_present, String::new()),
        field("Description", perplexity, if perplexity { "perplexity" } else { "" }),
        Line::from(""),
        field("Image hi-res", file_exists(&dir, &format!("{folder}-hi-res.jpg")), String::new()),
        field("Image medium", file_exists(&dir, &format!("{folder}-medium.jpg")), String::new()),
        field("Public JSON", file_exists(&dir, &format!("{folder}.json")), dir.display().to_string()),
        field("Added", rec.date_added.is_some(), opt(&rec.date_added)),
        field("Updated", rec.updated_at.is_some(), opt(&rec.updated_at)),
    ]
}
