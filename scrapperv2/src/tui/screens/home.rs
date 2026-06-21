//! Home menu.

use ratatui::prelude::*;
use ratatui::widgets::{List, ListItem};

use crate::tui::app::{App, MENU};
use crate::tui::theme;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &mut App) {
    let items: Vec<ListItem> = MENU.iter().map(|(label, _)| ListItem::new(format!("  {label}"))).collect();
    let list = List::new(items)
        .block(theme::panel("Menu"))
        .highlight_style(theme::highlight_style())
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, area, &mut app.menu);
}
