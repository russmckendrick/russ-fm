//! Boxsets browser: box-set releases with album section headers, split into Unprocessed (no
//! linked members yet — Enter runs album discovery on the processing page), Processed (Enter
//! opens the box's detail) and Single release (user-flagged single albums in a box edition;
//! ^x moves one back) tabs, with the last run's progress and log underneath.

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

    let counts = app.boxset_tab_counts();
    let titles: Vec<String> =
        BoxsetTab::ALL.iter().zip(counts).map(|(t, n)| format!(" {} ({n}) ", t.label())).collect();
    let tabs = Tabs::new(titles)
        .select(BoxsetTab::ALL.iter().position(|t| *t == app.boxset_tab).unwrap_or(0))
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
                theme::badge(b.is_processed()),
                Span::raw(format!(
                    " [{}] {} — {} ({})",
                    b.discogs_id,
                    b.artist_names.join(", "),
                    b.title,
                    b.year.unwrap_or(0)
                )),
            ];
            if app.boxset_tab == BoxsetTab::Processed {
                spans.push(Span::styled(
                    format!(" · {} album{}", b.member_count, if b.member_count == 1 { "" } else { "s" }),
                    theme::dim(),
                ));
            }
            if running == Some(b.discogs_id.as_str()) {
                spans.push(Span::styled(" ▶ running…", theme::title_style()));
            }
            ListItem::new(Line::from(spans))
        })
        .collect();
    let title = match app.boxset_tab {
        BoxsetTab::Unprocessed => "Boxsets · Unprocessed — Enter runs discovery · ^x flag as a single release",
        BoxsetTab::Processed => "Boxsets · Processed — Enter opens detail · ^r re-runs discovery",
        BoxsetTab::Single => "Boxsets · Single release — Enter opens detail · ^x move back to Unprocessed",
    };
    let list = List::new(items)
        .block(theme::panel(title))
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
