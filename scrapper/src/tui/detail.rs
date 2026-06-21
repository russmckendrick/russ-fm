//! Release/artist detail drill-down — a per-field editor over the user's database. Each row is
//! either a selectable field (refresh from its source, or edit by hand) or a plain display line.
//! The on-disk image/JSON checks read `../public`; writes go through the `ops` layer.

use ratatui::prelude::*;
use ratatui::widgets::{Paragraph, Wrap};

use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::artist::ArtistField;
use crate::ops::release::ReleaseField;
use crate::sanitize::{release_folder_name, sanitize_folder_name};

use super::app::App;
use super::theme;

/// What the detail view is showing (boxed — the records are large).
pub(crate) enum DetailView {
    Release(Box<ReleaseRecord>),
    Artist(Box<ArtistRecord>),
}

/// The editor action a selectable row maps to.
#[derive(Clone, Copy)]
pub(crate) enum RowAction {
    Artist { field: ArtistField, refreshable: bool, editable: bool },
    Release { field: ReleaseField, refreshable: bool, editable: bool },
}

impl RowAction {
    pub(crate) fn refreshable(self) -> bool {
        match self {
            RowAction::Artist { refreshable, .. } | RowAction::Release { refreshable, .. } => refreshable,
        }
    }
    pub(crate) fn editable(self) -> bool {
        match self {
            RowAction::Artist { editable, .. } | RowAction::Release { editable, .. } => editable,
        }
    }
}

/// A selectable "label ✓ value" field row.
#[derive(Clone)]
pub(crate) struct DetailRow {
    pub(crate) label: String,
    pub(crate) value: String,
    pub(crate) present: bool,
    pub(crate) action: RowAction,
}

/// One rendered line: a selectable field, or a plain (non-selectable) display line.
pub(crate) enum DetailLine {
    Field(DetailRow),
    Plain(Line<'static>),
}

/// The selectable field rows for the active detail record, in display order.
pub(crate) fn selectable(app: &App) -> Vec<DetailRow> {
    lines(app)
        .into_iter()
        .filter_map(|l| match l {
            DetailLine::Field(r) => Some(r),
            DetailLine::Plain(_) => None,
        })
        .collect()
}

/// All rendered lines for the active detail record.
pub(crate) fn lines(app: &App) -> Vec<DetailLine> {
    match app.detail.as_ref().expect("detail active") {
        DetailView::Release(rec) => release_lines(app, rec),
        DetailView::Artist(rec) => artist_lines(app, rec),
    }
}

pub(crate) fn draw_detail(f: &mut Frame, area: Rect, app: &App) {
    let lines = lines(app);
    let title = match app.detail.as_ref().unwrap() {
        DetailView::Release(_) => "Release",
        DetailView::Artist(_) => "Artist",
    };
    let mut field_idx = 0usize;
    let rendered: Vec<Line> = lines
        .iter()
        .map(|l| match l {
            DetailLine::Field(row) => {
                let selected = field_idx == app.detail_sel;
                field_idx += 1;
                render_field(row, selected)
            }
            DetailLine::Plain(line) => line.clone(),
        })
        .collect();
    f.render_widget(Paragraph::new(rendered).wrap(Wrap { trim: false }).block(theme::panel(title)), area);
}

/// Render a selectable field row, highlighting it when it's the cursor row.
fn render_field(row: &DetailRow, selected: bool) -> Line<'static> {
    let marker = if selected { "▶ " } else { "  " };
    let label_style = if selected { theme::title_style() } else { Style::default() };
    let value_style = if selected { theme::border() } else { theme::dim() };
    Line::from(vec![
        Span::styled(format!(" {marker}{:<13} ", row.label), label_style),
        theme::badge(row.present),
        Span::raw("  "),
        Span::styled(row.value.clone(), value_style),
    ])
}

// ── builders ────────────────────────────────────────────────────────────────

fn blank() -> DetailLine {
    DetailLine::Plain(Line::from(""))
}

fn heading(text: String) -> DetailLine {
    DetailLine::Plain(Line::from(Span::styled(format!("   {text}"), theme::title_style())))
}

/// A plain (non-selectable) "label ✓ value" line — for read-only metadata.
fn plain_field(label: &str, present: bool, value: impl Into<String>) -> DetailLine {
    DetailLine::Plain(Line::from(vec![
        Span::raw(format!("   {label:<13} ")),
        theme::badge(present),
        Span::raw("  "),
        Span::styled(value.into(), theme::dim()),
    ]))
}

fn opt(s: &Option<String>) -> String {
    s.clone().unwrap_or_default()
}

fn file_exists(dir: &std::path::Path, name: &str) -> bool {
    dir.join(name).exists()
}

fn artist_field(label: &str, present: bool, value: impl Into<String>, field: ArtistField, refreshable: bool, editable: bool) -> DetailLine {
    DetailLine::Field(DetailRow {
        label: label.to_string(),
        value: value.into(),
        present,
        action: RowAction::Artist { field, refreshable, editable },
    })
}

fn release_field(label: &str, present: bool, value: impl Into<String>, field: ReleaseField, refreshable: bool, editable: bool) -> DetailLine {
    DetailLine::Field(DetailRow {
        label: label.to_string(),
        value: value.into(),
        present,
        action: RowAction::Release { field, refreshable, editable },
    })
}

fn join_strings(v: &serde_json::Value) -> String {
    v.as_array()
        .map(|a| a.iter().filter_map(|g| g.as_str()).collect::<Vec<_>>().join(", "))
        .unwrap_or_default()
}

fn artist_lines(app: &App, rec: &ArtistRecord) -> Vec<DetailLine> {
    let folder = sanitize_folder_name(&rec.name);
    let dir = app.cfg.artists_dir().join(&folder);
    let genres = join_strings(&rec.genres);
    let lastfm = rec.raw_data.get("lastfm");
    let listeners = lastfm.and_then(|l| l.get("listeners")).and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())));
    let playcount = lastfm.and_then(|l| l.get("playcount")).and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())));

    let mut lines = vec![
        blank(),
        heading(rec.name.clone()),
        blank(),
        artist_field("Discogs", rec.discogs_id.is_some(), opt(&rec.discogs_id), ArtistField::Discogs, true, true),
        artist_field("Apple Music", rec.apple_music_id.is_some() || rec.apple_music_url.is_some(), opt(&rec.apple_music_url), ArtistField::Apple, true, true),
        artist_field("Spotify", rec.spotify_id.is_some() || rec.spotify_url.is_some(), opt(&rec.spotify_url), ArtistField::Spotify, true, true),
        artist_field("Last.fm", rec.lastfm_mbid.is_some() || rec.lastfm_url.is_some(), opt(&rec.lastfm_url), ArtistField::Lastfm, true, true),
        artist_field("Wikipedia", rec.wikipedia_url.is_some(), opt(&rec.wikipedia_url), ArtistField::Wikipedia, true, true),
        artist_field("Genres", !genres.is_empty(), genres, ArtistField::Genres, true, true),
        artist_field(
            "Popularity",
            rec.popularity.is_some() || rec.followers.is_some(),
            format!("{} · {} followers", rec.popularity.unwrap_or(0), rec.followers.unwrap_or(0)),
            ArtistField::Popularity,
            true,
            false,
        ),
        artist_field("Biography", rec.biography.as_deref().map(|b| !b.is_empty()).unwrap_or(false), String::new(), ArtistField::Biography, true, true),
        blank(),
    ];

    if let Some(c) = rec.country.as_deref().filter(|c| !c.is_empty()) {
        lines.push(plain_field("Country", true, c.to_string()));
    }
    if let Some(d) = rec.formed_date.as_deref().filter(|d| !d.is_empty()) {
        lines.push(plain_field("Formed", true, d.to_string()));
    }
    if listeners.is_some() || playcount.is_some() {
        lines.push(plain_field("Last.fm stats", true, format!("{} listeners · {} plays", listeners.unwrap_or_default(), playcount.unwrap_or_default())));
    }

    lines.push(artist_field("Image hi-res", file_exists(&dir, &format!("{folder}-hi-res.jpg")), String::new(), ArtistField::Images, true, false));
    lines.push(plain_field("Image medium", file_exists(&dir, &format!("{folder}-medium.jpg")), String::new()));
    lines.push(plain_field("Image avatar", file_exists(&dir, &format!("{folder}-avatar.jpg")), String::new()));
    lines.push(plain_field("Public JSON", file_exists(&dir, &format!("{folder}.json")), dir.display().to_string()));
    lines.push(plain_field("Updated", rec.updated_at.is_some(), opt(&rec.updated_at)));

    if let Some(bio) = rec.biography.as_deref().filter(|b| !b.is_empty()) {
        lines.push(blank());
        lines.push(heading("Biography".into()));
        lines.push(DetailLine::Plain(Line::from(format!("   {bio}"))));
    }

    push_log(app, &mut lines);
    lines
}

fn release_lines(app: &App, rec: &ReleaseRecord) -> Vec<DetailLine> {
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

    let mut lines = vec![
        blank(),
        heading(format!("{}  ({})", rec.title, rec.year.unwrap_or(0))),
        DetailLine::Plain(Line::from(Span::styled(format!("   {artists}"), theme::dim()))),
        blank(),
        release_field("Discogs", rec.discogs_id.is_some(), opt(&rec.discogs_id), ReleaseField::Discogs, true, false),
        release_field("Apple Music", rec.apple_music_id.is_some() || rec.apple_music_url.is_some(), opt(&rec.apple_music_url), ReleaseField::Apple, true, true),
        release_field("Spotify", rec.spotify_id.is_some() || rec.spotify_url.is_some(), opt(&rec.spotify_url), ReleaseField::Spotify, true, true),
        release_field("Last.fm", rec.lastfm_mbid.is_some() || rec.lastfm_url.is_some(), opt(&rec.lastfm_url), ReleaseField::Lastfm, true, true),
        release_field("Tracks", tracks > 0, tracks.to_string(), ReleaseField::Tracks, true, false),
        release_field("Videos", videos > 0, videos.to_string(), ReleaseField::Videos, true, false),
        release_field("Artist bio", bio_present, String::new(), ReleaseField::ArtistBio, true, false),
        release_field("Description", perplexity, if perplexity { "perplexity" } else { "" }, ReleaseField::Description, true, true),
        blank(),
    ];

    if let Some(r) = rec.released.as_deref().filter(|s| !s.is_empty()) {
        lines.push(plain_field("Released", true, r.to_string()));
    }
    if let Some(c) = rec.country.as_deref().filter(|s| !s.is_empty()) {
        lines.push(plain_field("Country", true, c.to_string()));
    }
    let labels = join_strings(&rec.labels);
    if !labels.is_empty() {
        lines.push(plain_field("Labels", true, labels));
    }
    let formats = join_strings(&rec.formats);
    if !formats.is_empty() {
        lines.push(plain_field("Formats", true, formats));
    }
    let genres = join_strings(&rec.genres);
    if !genres.is_empty() {
        lines.push(plain_field("Genres", true, genres));
    }
    let styles = join_strings(&rec.styles);
    if !styles.is_empty() {
        lines.push(plain_field("Styles", true, styles));
    }

    lines.push(blank());
    lines.push(release_field("Image hi-res", file_exists(&dir, &format!("{folder}-hi-res.jpg")), String::new(), ReleaseField::Images, true, false));
    lines.push(plain_field("Image medium", file_exists(&dir, &format!("{folder}-medium.jpg")), String::new()));
    lines.push(plain_field("Public JSON", file_exists(&dir, &format!("{folder}.json")), dir.display().to_string()));
    lines.push(plain_field("Added", rec.date_added.is_some(), opt(&rec.date_added)));
    lines.push(plain_field("Updated", rec.updated_at.is_some(), opt(&rec.updated_at)));

    push_log(app, &mut lines);
    lines
}

/// Append the live enrichment status + recent log tail while a detail task is running.
fn push_log(app: &App, lines: &mut Vec<DetailLine>) {
    if app.detail_busy {
        lines.push(blank());
        lines.push(DetailLine::Plain(Line::from(Span::styled("   working…", theme::border()))));
    }
    if app.detail_busy {
        for l in app.artist_log.iter().rev().take(4).rev() {
            lines.push(DetailLine::Plain(Line::from(Span::styled(format!("   {l}"), theme::dim()))));
        }
    }
}
