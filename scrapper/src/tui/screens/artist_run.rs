//! Artist batch runner: enrich N un-enriched artists with interactive match-picking.

use ratatui::prelude::*;

use crate::tui::app::App;

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &App) {
    super::draw_runner(
        f,
        area,
        "Enrich",
        "un-enriched artist(s) per run",
        &app.artist_limit,
        app.artist_running,
        app.artist_progress,
        &app.artist_log,
    );
}
