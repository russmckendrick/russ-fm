//! Interactive ratatui TUI — the bare-invocation experience. Wraps the same ops the CLI uses:
//! browse releases/artists (with drill-down detail), probe services, run a live resume-aware
//! collection pass, and enrich artists (batch or one at a time) with interactive match-picking.
//!
//! Module map:
//! - [`app`] — central [`App`] state, [`Screen`] menu, background-task message channel.
//! - [`theme`] — colours, styles and frame chrome (header/footer/panel/badge).
//! - [`screens`] — per-screen renderers.
//! - [`detail`] — read-only release/artist drill-down.
//! - [`modals`] — the match-picker and Perplexity description overlays.
//! - [`keys`] — keyboard dispatch + the Esc/nav-stack unwinder.
//! - [`runners`] — the spawned background enrichment tasks.

mod app;
mod detail;
mod keys;
mod modals;
mod runners;
mod screens;
mod theme;

use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, Event, KeyEventKind};
use ratatui::prelude::*;

use crate::{Config, Db};
use app::{App, Screen};

pub use app::Launch;

/// Launch the TUI.
pub async fn run(cfg: Config, launch: Launch) -> Result<()> {
    use std::io::IsTerminal;
    if !std::io::stdout().is_terminal() {
        anyhow::bail!(
            "the TUI needs an interactive terminal. Run `scrapper` in a real terminal, or use a \
             subcommand (e.g. `scrapper status`, `scrapper --help`)."
        );
    }
    let db = Db::open(cfg.db_path())?;
    let mut app = App::new(cfg, db);
    if let Launch::Collection { count } = launch {
        app.screen = Screen::Collection;
        app.collection_limit = count.max(1).to_string();
        app.autostart = true;
    }
    let mut terminal = ratatui::init();
    let result = run_loop(&mut terminal, &mut app).await;
    ratatui::restore();
    result
}

async fn run_loop(terminal: &mut ratatui::DefaultTerminal, app: &mut App) -> Result<()> {
    while !app.should_quit {
        if app.autostart {
            app.autostart = false;
            app.start_collection();
        }
        app.drain_messages();
        terminal.draw(|f| draw(f, app))?;
        if event::poll(Duration::from_millis(80))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    keys::handle_key(app, key.code);
                }
            }
        }
    }
    Ok(())
}

/// Render the current frame: persistent header + footer, with modal → detail → screen precedence
/// in the body.
fn draw(f: &mut Frame, app: &mut App) {
    let chunks = Layout::vertical([Constraint::Length(3), Constraint::Min(0), Constraint::Length(1)]).split(f.area());
    theme::header(f, chunks[0], app.screen.title());
    let body = chunks[1];
    let foot = chunks[2];

    if app.describe.is_some() {
        modals::draw_describe(f, body, app);
        theme::footer(f, foot, "type context · Enter (re)generate · Tab accept · Esc skip");
        return;
    }
    if app.pending.is_some() {
        modals::draw_picker(f, body, app);
        theme::footer(f, foot, "↑/↓ select · Enter choose · Esc skip this service");
        return;
    }
    if app.edit.is_some() {
        modals::draw_edit(f, body, app);
        theme::footer(f, foot, "type to edit · Enter save · Esc cancel");
        return;
    }
    if app.list_edit.is_some() {
        modals::draw_list_edit(f, body, app);
        theme::footer(f, foot, "↑/↓/←/→ move · Enter edit cell · a add row · d delete row · s save · Esc discard");
        return;
    }
    if app.detail.is_some() {
        detail::draw_detail(f, body, app);
        theme::footer(f, foot, "↑/↓ select · r refresh line · e edit · a refresh all · Esc back");
        return;
    }

    match app.screen {
        Screen::Home => screens::home::draw(f, body, app),
        Screen::Dashboard => screens::dashboard::draw(f, body, app),
        Screen::Releases => screens::releases::draw(f, body, app),
        Screen::Artists => screens::artists::draw(f, body, app),
        Screen::Services => screens::services::draw(f, body, app),
        Screen::Collection => screens::collection::draw(f, body, app),
        Screen::ArtistRun => screens::artist_run::draw(f, body, app),
    }
    theme::footer(f, foot, app.screen.hint());
}
