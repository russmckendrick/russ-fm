//! Releases browser: live search + a badged list. Enter opens the detail view.

use ratatui::prelude::*;
use ratatui::widgets::{List, ListItem};

use crate::tui::app::App;
use crate::tui::screens::search_box;
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &mut App) {
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(0)]).split(area);
    f.render_widget(search_box(&app.query, app.releases.len()), rows[0]);

    let items: Vec<ListItem> = app
        .releases
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let enriched = app.release_enriched.get(i).copied().unwrap_or(false);
            ListItem::new(Line::from(vec![
                Span::raw("  "),
                theme::badge(enriched),
                Span::raw(format!(
                    " [{}] {} — {} ({})",
                    r.discogs_id.as_deref().unwrap_or("?"),
                    r.artist_names.join(", "),
                    r.title,
                    r.year.unwrap_or(0)
                )),
            ]))
        })
        .collect();

    let list = List::new(items)
        .block(theme::panel("Releases"))
        .highlight_style(theme::highlight_style())
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, rows[1], &mut app.list);
}
