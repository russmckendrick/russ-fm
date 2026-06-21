//! Interactive overlays: the match-picker table and the Perplexity description editor.
//! Both block their background task on a oneshot reply channel until the user answers.

use crossterm::event::KeyCode;
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Cell, Paragraph, Row, Table, TableState, Wrap};

use crate::ops::release::{DescribeAction, DescribeRequest, PickRequest};

use super::app::App;
use super::detail::RowAction;
use super::theme;

/// A manual single-field edit awaiting the user's text.
pub(crate) struct PendingEdit {
    pub(crate) label: String,
    pub(crate) action: RowAction,
    pub(crate) buffer: String,
}

impl PendingEdit {
    pub(crate) fn new(label: String, action: RowAction, initial: String) -> Self {
        Self { label, action, buffer: initial }
    }
}

/// Handle a key while the manual-edit overlay is open.
pub(crate) fn handle_edit_key(app: &mut App, code: KeyCode) {
    let Some(e) = app.edit.as_mut() else { return };
    match code {
        KeyCode::Enter => {
            let (action, text) = (e.action, e.buffer.clone());
            app.edit = None;
            app.apply_edit(action, &text);
        }
        KeyCode::Esc => app.edit = None,
        KeyCode::Backspace => {
            e.buffer.pop();
        }
        KeyCode::Char(c) => e.buffer.push(c),
        _ => {}
    }
}

pub(crate) fn draw_edit(f: &mut Frame, area: Rect, app: &App) {
    let e = app.edit.as_ref().expect("edit active");
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(0)]).split(area);
    let input = Paragraph::new(format!(" {}", e.buffer)).block(theme::panel(&format!("Edit {}", e.label)));
    f.render_widget(input, rows[0]);
    let help = Paragraph::new("Type to edit · Enter save · Esc cancel · an empty value clears the field")
        .style(theme::dim())
        .block(theme::panel("Help"));
    f.render_widget(help, rows[1]);
}

/// A match-picker awaiting the user's choice.
pub(crate) struct PendingPick {
    prompt: String,
    header: Vec<&'static str>,
    rows: Vec<Vec<String>>,
    reply: Option<tokio::sync::oneshot::Sender<Option<usize>>>,
    state: TableState,
}

impl PendingPick {
    pub(crate) fn new(p: PickRequest) -> Self {
        let mut state = TableState::default();
        state.select(Some(0));
        Self { prompt: p.prompt, header: p.header, rows: p.rows, reply: Some(p.reply), state }
    }

    /// Number of selectable entries (candidates + the trailing "skip" row).
    fn len(&self) -> usize {
        self.rows.len() + 1
    }
}

/// An interactive Perplexity description prompt: edit context, (re)generate, accept or skip.
pub(crate) struct PendingDescribe {
    artist: String,
    album: String,
    preview: String,
    context: String,
    reply: Option<tokio::sync::oneshot::Sender<DescribeAction>>,
    generating: bool,
}

impl PendingDescribe {
    pub(crate) fn new(d: DescribeRequest) -> Self {
        Self {
            artist: d.artist,
            album: d.album,
            preview: d.preview,
            context: d.context,
            reply: Some(d.reply),
            generating: false,
        }
    }
}

/// Handle a key while the description editor is open.
pub(crate) fn handle_describe_key(app: &mut App, code: KeyCode) {
    let Some(d) = app.describe.as_mut() else { return };
    if d.generating {
        return; // wait for generation to finish
    }
    match code {
        KeyCode::Enter => {
            let ctx = d.context.clone();
            if let Some(reply) = d.reply.take() {
                let _ = reply.send(DescribeAction::Generate(ctx));
                d.generating = true;
                d.preview = "generating…".into();
            }
        }
        KeyCode::Tab if !d.preview.is_empty() => {
            if let Some(reply) = d.reply.take() {
                let _ = reply.send(DescribeAction::Accept);
            }
            app.describe = None;
        }
        KeyCode::Esc => {
            if let Some(reply) = d.reply.take() {
                let _ = reply.send(DescribeAction::Skip);
            }
            app.describe = None;
        }
        KeyCode::Backspace => {
            d.context.pop();
        }
        KeyCode::Char(c) => d.context.push(c),
        _ => {}
    }
}

/// Handle a key while the match picker is open.
pub(crate) fn handle_pick_key(app: &mut App, code: KeyCode) {
    let Some(pick) = app.pending.as_mut() else { return };
    let len = pick.len();
    let n_rows = pick.rows.len();
    match code {
        KeyCode::Up => {
            let cur = pick.state.selected().unwrap_or(0) as isize;
            pick.state.select(Some(((cur - 1).rem_euclid(len as isize)) as usize));
        }
        KeyCode::Down => {
            let cur = pick.state.selected().unwrap_or(0) as isize;
            pick.state.select(Some(((cur + 1).rem_euclid(len as isize)) as usize));
        }
        KeyCode::Enter => {
            let sel = pick.state.selected().unwrap_or(0);
            let choice = if sel < n_rows { Some(sel) } else { None }; // last row = skip
            if let Some(reply) = pick.reply.take() {
                let _ = reply.send(choice);
            }
            app.pending = None;
        }
        KeyCode::Esc => {
            if let Some(reply) = pick.reply.take() {
                let _ = reply.send(None);
            }
            app.pending = None;
        }
        _ => {}
    }
}

pub(crate) fn draw_describe(f: &mut Frame, area: Rect, app: &App) {
    let d = app.describe.as_ref().expect("describe active");
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(0)]).split(area);

    let ctx = Paragraph::new(format!(" {}", d.context)).block(theme::panel("Additional context (optional)"));
    f.render_widget(ctx, rows[0]);

    let body = if d.preview.is_empty() {
        "Press Enter to generate a description.".to_string()
    } else {
        d.preview.clone()
    };
    let preview = Paragraph::new(body)
        .wrap(Wrap { trim: true })
        .block(theme::panel(&format!("Perplexity description — {} — {}", d.artist, d.album)));
    f.render_widget(preview, rows[1]);
}

pub(crate) fn draw_picker(f: &mut Frame, area: Rect, app: &mut App) {
    let pick = app.pending.as_mut().expect("picker active");

    let header = Row::new(pick.header.iter().map(|h| Cell::from(*h))).style(theme::title_style());

    let mut rows: Vec<Row> = pick
        .rows
        .iter()
        .map(|r| Row::new(r.iter().map(|c| Cell::from(c.clone())).collect::<Vec<_>>()))
        .collect();
    rows.push(Row::new(vec![Cell::from("✗ Skip this service")]).style(theme::dim()));

    // Derive column widths from the header: first column flexes, the rest size to content.
    let n = pick.header.len().max(1);
    let widths: Vec<Constraint> = (0..n)
        .map(|c| if c == 0 { Constraint::Percentage(45) } else { Constraint::Percentage((55 / n.max(1)) as u16) })
        .collect();

    let table = Table::new(rows, widths)
        .header(header)
        .column_spacing(2)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Choose match — {} ", pick.prompt))
                .border_style(theme::border()),
        )
        .row_highlight_style(theme::row_highlight())
        .highlight_symbol("▶ ");
    f.render_stateful_widget(table, area, &mut pick.state);
}
