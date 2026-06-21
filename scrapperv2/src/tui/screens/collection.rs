//! Collection runner: process N releases from the Discogs collection (newest first).

use ratatui::prelude::*;

use crate::tui::app::App;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &App) {
    super::draw_runner(
        f,
        area,
        "Process",
        "release(s) per run",
        &app.collection_limit,
        app.running,
        app.progress,
        &app.log,
    );
}
