//! The processing page: shown full-screen while a background run (collection, artist batch,
//! boxset discovery or a detail-view task) is active, so the user always sees what is being
//! worked on between the pickers it raises. It stays up once the run finishes until Esc.

use ratatui::prelude::*;
use ratatui::widgets::Paragraph;

use crate::tui::app::App;
use crate::tui::screens::draw_progress_log;
use crate::tui::theme;

const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub(crate) fn draw(f: &mut Frame, area: Rect, app: &App) {
    let Some(p) = app.processing.as_ref() else { return };
    let (running, progress, log) = app.processing_state();
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Length(3), Constraint::Min(0)]).split(area);

    let elapsed = p.started.elapsed().as_secs();
    let status = if running {
        let frame = SPINNER[(p.started.elapsed().as_millis() / 100) as usize % SPINNER.len()];
        Line::from(vec![
            Span::styled(format!(" {frame} "), theme::title_style()),
            Span::raw(format!("working — {}m{:02}s elapsed · pickers open here when a choice is needed", elapsed / 60, elapsed % 60)),
        ])
    } else {
        Line::from(vec![
            Span::styled(" ✓ ", Style::default().fg(theme::OK)),
            Span::raw(format!("finished in {}m{:02}s — press Esc to go back", elapsed / 60, elapsed % 60)),
        ])
    };
    f.render_widget(Paragraph::new(status).block(theme::panel(&p.title)), rows[0]);

    draw_progress_log(f, rows[1], rows[2], running, progress, log, "working…");
}
