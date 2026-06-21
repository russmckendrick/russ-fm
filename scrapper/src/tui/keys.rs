//! Keyboard dispatch and the Esc/nav-stack unwinder. Modal overlays and the detail view
//! capture input first; otherwise input falls through to the active screen.

use crossterm::event::KeyCode;

use super::app::{App, Screen, MENU};
use super::modals;

pub(crate) fn handle_key(app: &mut App, code: KeyCode) {
    // Overlays capture all input while open (description editor, then match picker).
    if app.describe.is_some() {
        modals::handle_describe_key(app, code);
        return;
    }
    if app.pending.is_some() {
        modals::handle_pick_key(app, code);
        return;
    }
    // Detail drill-down has its own keys.
    if app.detail.is_some() {
        handle_detail_key(app, code);
        return;
    }

    // Global.
    match code {
        KeyCode::Char('q') if app.screen == Screen::Home => {
            app.should_quit = true;
            return;
        }
        KeyCode::Esc => {
            pop_nav(app);
            return;
        }
        _ => {}
    }

    match app.screen {
        Screen::Home => match code {
            KeyCode::Up => app.move_selection(-1),
            KeyCode::Down => app.move_selection(1),
            KeyCode::Enter => {
                if let Some(i) = app.menu.selected() {
                    app.enter_screen(MENU[i].1);
                }
            }
            _ => {}
        },
        Screen::Releases | Screen::Artists => match code {
            KeyCode::Up => app.move_selection(-1),
            KeyCode::Down => app.move_selection(1),
            KeyCode::Enter => app.open_detail(),
            KeyCode::Backspace => {
                app.query.pop();
                app.refresh_search();
            }
            KeyCode::Char(c) => {
                app.query.push(c);
                app.refresh_search();
            }
            _ => {}
        },
        Screen::Services => {
            if code == KeyCode::Char('r') {
                app.start_probes();
            }
        }
        Screen::Collection => match code {
            KeyCode::Char('r') => app.start_collection(),
            _ if app.running => {}
            KeyCode::Up | KeyCode::Char('+') | KeyCode::Char('=') => app.step_collection_limit(1),
            KeyCode::Down | KeyCode::Char('-') => app.step_collection_limit(-1),
            KeyCode::Char(c) if c.is_ascii_digit() && app.collection_limit.len() < 5 => {
                app.collection_limit.push(c);
            }
            KeyCode::Backspace => {
                app.collection_limit.pop();
            }
            _ => {}
        },
        Screen::ArtistRun => match code {
            KeyCode::Char('r') => app.start_artist_run(),
            _ if app.artist_running => {}
            KeyCode::Up | KeyCode::Char('+') | KeyCode::Char('=') => app.step_artist_limit(1),
            KeyCode::Down | KeyCode::Char('-') => app.step_artist_limit(-1),
            KeyCode::Char(c) if c.is_ascii_digit() && app.artist_limit.len() < 5 => {
                app.artist_limit.push(c);
            }
            KeyCode::Backspace => {
                app.artist_limit.pop();
            }
            _ => {}
        },
        Screen::Dashboard => {}
    }
}

/// Keys while a release/artist detail panel is open.
fn handle_detail_key(app: &mut App, code: KeyCode) {
    match code {
        KeyCode::Esc => pop_nav(app),
        KeyCode::Char('e') => {
            let name = match app.detail.as_ref() {
                Some(super::detail::DetailView::Artist(rec)) if !app.artist_running => Some(rec.name.clone()),
                _ => None,
            };
            if let Some(name) = name {
                app.start_single_artist(name);
            }
        }
        _ => {}
    }
}

/// Unwind one navigation level: detail → list → home → quit.
pub(crate) fn pop_nav(app: &mut App) {
    if app.detail.take().is_some() {
        return;
    }
    match app.nav_stack.pop() {
        Some(prev) => app.screen = prev,
        None if app.screen == Screen::Home => app.should_quit = true,
        None => app.screen = Screen::Home,
    }
}
