//! Boxsets browser: box-set releases split into Unprocessed (no linked members yet — Enter
//! runs album discovery) and Processed (Enter opens the box's detail) tabs, with the discovery
//! run's progress and log underneath so a run can be watched without leaving the screen.

use ratatui::prelude::*;
use ratatui::widgets::{List, ListItem, Tabs};

use crate::tui::app::{App, BoxsetTab};
use crate::tui::screens::{draw_progress_log, search_box};
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &mut App) {
    let rows = Layout::vertical([
        Constraint::Length(3),
        Constraint::Length(1),
        Constraint::Min(6),
        Constraint::Length(3),
        Constraint::Length(8),
    ])
    .split(area);
    f.render_widget(search_box(&app.query, app.boxsets.len()), rows[0]);

    let (unprocessed, processed) = app.boxset_tab_counts();
    let tabs = Tabs::new(vec![
        format!(" {} ({unprocessed}) ", BoxsetTab::Unprocessed.label()),
        format!(" {} ({processed}) ", BoxsetTab::Processed.label()),
    ])
        .select(match app.boxset_tab {
            BoxsetTab::Unprocessed => 0,
            BoxsetTab::Processed => 1,
        })
        .style(theme::dim())
        .highlight_style(theme::highlight_style())
        .divider("│");
    f.render_widget(tabs, rows[1]);

    let running = app.boxset_running.as_deref();
    let items: Vec<ListItem> = app
        .boxsets
        .iter()
        .map(|b| {
            let mut spans = vec![
                Span::raw("  "),
                theme::badge(b.is_processed() || b.has_headers),
                Span::raw(format!(
                    " [{}] {} — {} ({})",
                    b.discogs_id,
                    b.artist_names.join(", "),
                    b.title,
                    b.year.unwrap_or(0)
                )),
            ];
            match app.boxset_tab {
                BoxsetTab::Unprocessed if !b.has_headers => spans.push(Span::styled(" · no headers", theme::dim())),
                BoxsetTab::Processed => spans.push(Span::styled(
                    format!(" · {} album{}", b.member_count, if b.member_count == 1 { "" } else { "s" }),
                    theme::dim(),
                )),
                _ => {}
            }
            if running == Some(b.discogs_id.as_str()) {
                spans.push(Span::styled(" ▶ running…", theme::title_style()));
            }
            ListItem::new(Line::from(spans))
        })
        .collect();
    let title = match app.boxset_tab {
        BoxsetTab::Unprocessed => {
            let discoverable = app.boxsets.iter().filter(|b| b.has_headers).count();
            format!("Boxsets · Unprocessed — {discoverable} with album headers listed first · Enter runs discovery")
        }
        BoxsetTab::Processed => "Boxsets · Processed — Enter opens detail · ^r re-runs discovery".to_string(),
    };
    let list = List::new(items)
        .block(theme::panel(&title))
        .highlight_style(theme::highlight_style())
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, rows[2], &mut app.list);

    draw_progress_log(
        f,
        rows[3],
        rows[4],
        app.boxset_running.is_some(),
        app.boxset_progress,
        &app.boxset_log,
        "select a box and press Enter",
    );
}
