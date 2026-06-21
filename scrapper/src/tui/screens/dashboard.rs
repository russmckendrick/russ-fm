//! Dashboard: collection + artist enrichment stats with progress gauges.

use ratatui::prelude::*;
use ratatui::widgets::{Gauge, Paragraph};

use crate::tui::app::App;
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &App) {
    let s = app.db.stats().unwrap_or_default();
    let (art_enriched, art_total) = app.db.artist_enrichment_counts().unwrap_or((0, 0));
    let rel_pct = if s.total_collection_items > 0 {
        100.0 * s.processed_items as f64 / s.total_collection_items as f64
    } else {
        0.0
    };
    let art_pct = if art_total > 0 { 100.0 * art_enriched as f64 / art_total as f64 } else { 0.0 };

    let rows = Layout::vertical([Constraint::Min(0), Constraint::Length(3), Constraint::Length(3)]).split(area);

    let lines = vec![
        Line::from(""),
        Line::from(format!("   Releases           {}", s.total_releases)),
        Line::from(format!("   Artists            {}", s.total_artists)),
        Line::from(format!("   Collection items   {}", s.total_collection_items)),
        Line::from(format!("   Processed          {} ({rel_pct:.1}%)", s.processed_items)),
        Line::from(format!("   Enriched (items)   {}", s.enriched_items)),
        Line::from(format!("   Artists enriched   {art_enriched} / {art_total} ({art_pct:.1}%)")),
        Line::from(""),
        Line::from(format!("   Database  {}", app.db.path().display())),
        Line::from(format!("   Output    {}", app.cfg.data_dir().display())),
    ];
    f.render_widget(Paragraph::new(lines).block(theme::panel("Status")), rows[0]);

    let rel_gauge = Gauge::default()
        .block(theme::panel("Releases processed"))
        .gauge_style(theme::border())
        .ratio((rel_pct / 100.0).clamp(0.0, 1.0))
        .label(format!("{rel_pct:.0}%"));
    f.render_widget(rel_gauge, rows[1]);

    let art_gauge = Gauge::default()
        .block(theme::panel("Artists enriched"))
        .gauge_style(theme::border())
        .ratio((art_pct / 100.0).clamp(0.0, 1.0))
        .label(format!("{art_pct:.0}%"));
    f.render_widget(art_gauge, rows[2]);
}
