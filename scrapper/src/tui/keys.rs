//! Keyboard dispatch and the Esc/nav-stack unwinder. Modal overlays and the detail view
//! capture input first; otherwise input falls through to the active screen.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

use super::app::{App, BoxsetTab, Screen, MENU};
use super::modals;

pub(crate) fn handle_key(app: &mut App, key: KeyEvent) {
    let (code, mods) = (key.code, key.modifiers);
    // Overlays capture all input while open (description editor, then match picker).
    if app.describe.is_some() {
        modals::handle_describe_key(app, code);
        return;
    }
    if app.pending.is_some() {
        modals::handle_pick_key(app, code);
        return;
    }
    if app.edit.is_some() {
        modals::handle_edit_key(app, code);
        return;
    }
    if app.list_edit.is_some() {
        modals::handle_list_edit_key(app, code);
        return;
    }
    // The processing page: Esc hides it (the run itself carries on), everything else waits.
    if app.processing.is_some() {
        if code == KeyCode::Esc {
            app.processing = None;
        }
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
        Screen::Boxsets => match code {
            KeyCode::Tab => app.next_boxset_tab(),
            KeyCode::Up => app.move_selection(-1),
            KeyCode::Down => app.move_selection(1),
            KeyCode::Enter => match app.boxset_tab {
                BoxsetTab::Unprocessed => app.start_boxset_discovery(false),
                BoxsetTab::Processed | BoxsetTab::Single => app.open_detail(),
            },
            // Plain letters go to the search box, so the actions take a modifier.
            KeyCode::Char('x') if mods.contains(KeyModifiers::CONTROL) => app.toggle_boxset_single_release(),
            KeyCode::Char('f') if mods.contains(KeyModifiers::CONTROL) && app.boxset_tab != BoxsetTab::Single => {
                app.start_boxset_discovery(true)
            }
            KeyCode::Char('r') if mods.contains(KeyModifiers::CONTROL) && app.boxset_tab != BoxsetTab::Single => {
                app.start_boxset_discovery(false)
            }
            KeyCode::Backspace => {
                app.query.pop();
                app.refresh_search();
            }
            KeyCode::Char(c) if !mods.contains(KeyModifiers::CONTROL) => {
                app.query.push(c);
                app.refresh_search();
            }
            _ => {}
        },
        Screen::Dashboard => {}
    }
}

/// Keys while a release/artist detail editor is open.
fn handle_detail_key(app: &mut App, code: KeyCode) {
    // While a refresh/enrich task runs, interactive picks come through the modal layer; ignore
    // field actions until it finishes.
    if app.detail_busy {
        return;
    }
    match code {
        KeyCode::Up => app.move_detail_selection(-1),
        KeyCode::Down => app.move_detail_selection(1),
        KeyCode::Char('r') => app.refresh_selected_field(),
        KeyCode::Enter | KeyCode::Char('e') => app.edit_selected_field(),
        KeyCode::Char('a') => app.refresh_all_detail(),
        KeyCode::Esc => pop_nav(app),
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
