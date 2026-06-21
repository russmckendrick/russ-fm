//! Shared colours, styles and frame chrome (header / footer / panel) for the TUI.

use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Paragraph};

pub const ACCENT: Color = Color::Cyan;
pub const OK: Color = Color::Green;
pub const BAD: Color = Color::Red;
pub const DIM: Color = Color::DarkGray;

/// Bold accent — section titles and selected list rows.
pub fn title_style() -> Style {
    Style::default().fg(ACCENT).add_modifier(Modifier::BOLD)
}

/// Highlight style for a selected list item.
pub fn highlight_style() -> Style {
    Style::default().fg(ACCENT).add_modifier(Modifier::BOLD)
}

/// Highlight style for a selected table/picker row (inverse accent).
pub fn row_highlight() -> Style {
    Style::default().fg(Color::Black).bg(ACCENT).add_modifier(Modifier::BOLD)
}

/// Accent border colour.
pub fn border() -> Style {
    Style::default().fg(ACCENT)
}

/// Dim foreground — hints and secondary detail.
pub fn dim() -> Style {
    Style::default().fg(DIM)
}

/// A ✓ / · status badge cell for list rows.
pub fn badge(enriched: bool) -> Span<'static> {
    if enriched {
        Span::styled("✓", Style::default().fg(OK))
    } else {
        Span::styled("·", Style::default().fg(DIM))
    }
}

/// The standard bordered panel: accent border with a titled label.
pub fn panel(title: &str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .title(format!(" {title} "))
        .border_style(border())
}

/// Top title bar — `scrapper · <subtitle>` (or just `scrapper` when empty).
pub fn header(f: &mut Frame, area: Rect, subtitle: &str) {
    let title = if subtitle.is_empty() {
        "scrapper".to_string()
    } else {
        format!("scrapper · {subtitle}")
    };
    let block = Block::default().borders(Borders::ALL).border_style(border());
    f.render_widget(Paragraph::new(Line::from(Span::styled(title, title_style()))).block(block), area);
}

/// Bottom single-line key hints.
pub fn footer(f: &mut Frame, area: Rect, hint: &str) {
    f.render_widget(Paragraph::new(hint.to_string()).style(dim()), area);
}
