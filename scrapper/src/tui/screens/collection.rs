//! Collection picker: the newest releases in the Discogs collection that aren't enriched yet.
//! Space ticks releases and Enter processes them on the processing page, with the last run's
//! progress and log underneath.

use ratatui::prelude::*;
use ratatui::widgets::{List, ListItem, Paragraph, Wrap};

use crate::tui::app::App;
use crate::tui::screens::draw_progress_log;
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &mut App) {
    let rows = Layout::vertical([Constraint::Min(6), Constraint::Length(3), Constraint::Length(8)]).split(area);

    let n = app.collection_candidates.len();
    let ticked = app.collection_selected.len();
    let title = if app.collection_loading {
        "New in your Discogs collection · loading…".to_string()
    } else if ticked > 0 {
        format!("New in your Discogs collection ({n}) · {ticked} selected")
    } else {
        format!("New in your Discogs collection ({n})")
    };

    if app.collection_candidates.is_empty() {
        let msg = match (&app.collection_error, app.collection_loading) {
            (_, true) => Line::styled(" Fetching the newest releases from Discogs…", theme::dim()),
            (Some(e), false) => Line::from(format!(" ✗ {e} — press l to retry")),
            (None, false) => Line::styled(" Nothing new — every recent release is already processed. Press l to reload.", theme::dim()),
        };
        f.render_widget(Paragraph::new(msg).wrap(Wrap { trim: true }).block(theme::panel(&title)), rows[0]);
    } else {
        let items: Vec<ListItem> = app
            .collection_candidates
            .iter()
            .map(|c| {
                let on = app.collection_selected.contains(&c.release_id);
                let added = c.date_added.as_deref().and_then(|d| d.get(..10)).unwrap_or("          ");
                let mut spans = vec![
                    Span::styled(if on { " [x] " } else { " [ ] " }, if on { theme::title_style() } else { theme::dim() }),
                    Span::styled(format!("{added}  "), theme::dim()),
                    Span::raw(format!("{} — {}", c.artist, c.title)),
                ];
                if let Some(y) = c.year {
                    spans.push(Span::raw(format!(" ({y})")));
                }
                if !c.format.is_empty() {
                    spans.push(Span::styled(format!(" · {}", c.format), theme::dim()));
                }
                spans.push(Span::styled(format!(" · {}", c.release_id), theme::dim()));
                ListItem::new(Line::from(spans))
            })
            .collect();
        let list = List::new(items)
            .block(theme::panel(&title))
            .highlight_style(theme::highlight_style())
            .highlight_symbol("▶");
        f.render_stateful_widget(list, rows[0], &mut app.list);
    }

    draw_progress_log(
        f,
        rows[1],
        rows[2],
        app.running,
        app.progress,
        &app.log,
        "select release(s) and press Enter",
    );
}
