//! Service health probes.

use ratatui::prelude::*;
use ratatui::widgets::Paragraph;

use crate::tui::app::App;
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &App) {
    let mut lines = vec![Line::from("")];
    if app.probes.is_empty() && app.probing {
        lines.push(Line::from("   probing…"));
    }
    for (name, ok, detail) in &app.probes {
        let (sym, col) = if *ok { ("✓", theme::OK) } else { ("✗", theme::BAD) };
        lines.push(Line::from(vec![
            Span::raw("   "),
            Span::styled(sym, Style::default().fg(col)),
            Span::raw(format!(" {name:<12} ")),
            Span::styled(detail.clone(), theme::dim()),
        ]));
    }
    f.render_widget(Paragraph::new(lines).block(theme::panel("Service health")), area);
}
