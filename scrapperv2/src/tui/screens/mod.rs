//! Per-screen renderers plus the helpers they share (search box, runner layout).

pub(crate) mod artist_run;
pub(crate) mod artists;
pub(crate) mod collection;
pub(crate) mod dashboard;
pub(crate) mod home;
pub(crate) mod releases;
pub(crate) mod services;

use ratatui::prelude::*;
use ratatui::widgets::{Gauge, Paragraph, Wrap};

use crate::tui::theme;

/// Search input box with a result count in the title.
pub(crate) fn search_box(query: &str, count: usize) -> Paragraph<'static> {
    Paragraph::new(format!(" {query}")).block(theme::panel(&format!("Search ({count} results)")))
}

/// Shared layout for the Collection / Enrich-artists runner screens: an editable count,
/// a progress gauge and a scrolling log.
#[allow(clippy::too_many_arguments)]
pub(crate) fn draw_runner(
    f: &mut Frame,
    area: Rect,
    prefix: &str,
    suffix: &str,
    value: &str,
    running: bool,
    progress: Option<(usize, usize)>,
    log: &[String],
) {
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Length(3), Constraint::Min(0)]).split(area);

    let count_style = if running { theme::dim() } else { theme::border() };
    let shown = if value.is_empty() { "1" } else { value };
    let count = Paragraph::new(Line::from(vec![
        Span::raw(format!(" {prefix} ")),
        Span::styled(shown.to_string(), count_style.add_modifier(Modifier::BOLD)),
        Span::raw(format!(" {suffix}")),
    ]))
    .block(theme::panel("Count").border_style(count_style));
    f.render_widget(count, rows[0]);

    let (done, total) = progress.unwrap_or((0, 0));
    let ratio = if total > 0 { done as f64 / total as f64 } else { 0.0 };
    let label = if running {
        format!("{done}/{total}")
    } else if total > 0 {
        format!("done {done}/{total}")
    } else {
        "press r to run".to_string()
    };
    let gauge = Gauge::default()
        .block(theme::panel("Progress"))
        .gauge_style(theme::border())
        .ratio(ratio.clamp(0.0, 1.0))
        .label(label);
    f.render_widget(gauge, rows[1]);

    let visible = rows[2].height.saturating_sub(2) as usize;
    let start = log.len().saturating_sub(visible);
    let text: Vec<Line> = log[start..].iter().map(|l| Line::from(l.clone())).collect();
    f.render_widget(Paragraph::new(text).wrap(Wrap { trim: true }).block(theme::panel("Log")), rows[2]);
}
