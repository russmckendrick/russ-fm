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
    /// Validation message from the last save attempt; the overlay stays open until it passes.
    pub(crate) error: Option<String>,
}

impl PendingEdit {
    pub(crate) fn new(label: String, action: RowAction, initial: String) -> Self {
        Self { label, action, buffer: initial, error: None }
    }
}

/// Handle a key while the manual-edit overlay is open.
pub(crate) fn handle_edit_key(app: &mut App, code: KeyCode) {
    let Some(e) = app.edit.as_mut() else { return };
    match code {
        KeyCode::Enter => {
            let (action, text) = (e.action, e.buffer.clone());
            match app.apply_edit(action, &text) {
                Ok(()) => app.edit = None,
                Err(msg) => {
                    if let Some(e) = app.edit.as_mut() {
                        e.error = Some(msg);
                    }
                }
            }
        }
        KeyCode::Esc => app.edit = None,
        KeyCode::Backspace => {
            e.buffer.pop();
            e.error = None;
        }
        KeyCode::Char(c) => {
            e.buffer.push(c);
            e.error = None;
        }
        _ => {}
    }
}

pub(crate) fn draw_edit(f: &mut Frame, area: Rect, app: &App) {
    let e = app.edit.as_ref().expect("edit active");
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Length(2), Constraint::Min(0)]).split(area);
    let input = Paragraph::new(format!(" {}", e.buffer)).block(theme::panel(&format!("Edit {}", e.label)));
    f.render_widget(input, rows[0]);
    if let Some(err) = &e.error {
        let msg = Paragraph::new(format!(" ✗ {err}")).style(Style::default().fg(Color::Red)).wrap(Wrap { trim: true });
        f.render_widget(msg, rows[1]);
    }
    let help = Paragraph::new("Type to edit · Enter save · Esc cancel · an empty value clears the field")
        .style(theme::dim())
        .block(theme::panel("Help"));
    f.render_widget(help, rows[2]);
}

/// A structured list edit (tracklist/videos): a small spreadsheet over the field's rows.
pub(crate) struct PendingListEdit {
    pub(crate) title: String,
    pub(crate) action: RowAction,
    pub(crate) headers: Vec<&'static str>,
    pub(crate) rows: Vec<Vec<String>>,
    pub(crate) row: usize,
    pub(crate) col: usize,
    /// Some(buffer) while a single cell is being typed into.
    pub(crate) cell: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) state: TableState,
}

impl PendingListEdit {
    pub(crate) fn new(title: String, action: RowAction, headers: Vec<&'static str>, rows: Vec<Vec<String>>) -> Self {
        let mut state = TableState::default();
        state.select(Some(0));
        Self { title, action, headers, rows, row: 0, col: 0, cell: None, error: None, state }
    }

    fn clamp(&mut self) {
        if self.rows.is_empty() {
            self.row = 0;
        } else if self.row >= self.rows.len() {
            self.row = self.rows.len() - 1;
        }
        self.col = self.col.min(self.headers.len().saturating_sub(1));
        self.state.select(Some(self.row));
    }
}

/// Handle a key while the structured list editor is open.
pub(crate) fn handle_list_edit_key(app: &mut App, code: KeyCode) {
    let Some(le) = app.list_edit.as_mut() else { return };

    // Cell-editing sub-mode: type into one cell, Enter commits, Esc cancels the cell.
    if let Some(buf) = le.cell.as_mut() {
        match code {
            KeyCode::Enter => {
                if let Some(cell) = le.rows.get_mut(le.row).and_then(|r| r.get_mut(le.col)) {
                    *cell = le.cell.take().unwrap_or_default();
                } else {
                    le.cell = None;
                }
            }
            KeyCode::Esc => le.cell = None,
            KeyCode::Backspace => {
                buf.pop();
            }
            KeyCode::Char(c) => buf.push(c),
            _ => {}
        }
        return;
    }

    match code {
        KeyCode::Up => {
            le.row = le.row.saturating_sub(1);
            le.clamp();
        }
        KeyCode::Down => {
            le.row += 1;
            le.clamp();
        }
        KeyCode::Left => {
            le.col = le.col.saturating_sub(1);
        }
        KeyCode::Right => {
            le.col = (le.col + 1).min(le.headers.len().saturating_sub(1));
        }
        KeyCode::Enter => {
            if let Some(cur) = le.rows.get(le.row).and_then(|r| r.get(le.col)) {
                le.cell = Some(cur.clone());
                le.error = None;
            }
        }
        KeyCode::Char('a') => {
            le.rows.push(vec![String::new(); le.headers.len()]);
            le.row = le.rows.len() - 1;
            le.col = 0;
            le.clamp();
            le.cell = Some(String::new());
            le.error = None;
        }
        KeyCode::Char('d') if le.row < le.rows.len() => {
            le.rows.remove(le.row);
            le.clamp();
            le.error = None;
        }
        KeyCode::Char('s') => {
            let (action, rows) = (le.action, le.rows.clone());
            match app.apply_list_edit(action, &rows) {
                Ok(()) => app.list_edit = None,
                Err(msg) => {
                    if let Some(le) = app.list_edit.as_mut() {
                        le.error = Some(msg);
                    }
                }
            }
        }
        KeyCode::Esc => app.list_edit = None,
        _ => {}
    }
}

pub(crate) fn draw_list_edit(f: &mut Frame, area: Rect, app: &mut App) {
    let le = app.list_edit.as_mut().expect("list edit active");
    let rows_area = Layout::vertical([Constraint::Min(0), Constraint::Length(2)]).split(area);

    let header = Row::new(le.headers.iter().map(|h| Cell::from(*h))).style(theme::title_style());
    let cursor = (le.row, le.col);
    let editing = le.cell.clone();
    let table_rows: Vec<Row> = le
        .rows
        .iter()
        .enumerate()
        .map(|(ri, r)| {
            Row::new(
                r.iter()
                    .enumerate()
                    .map(|(ci, c)| {
                        if (ri, ci) == cursor {
                            match &editing {
                                Some(buf) => Cell::from(format!("{buf}▏")).style(theme::title_style()),
                                None => Cell::from(c.clone()).style(theme::row_highlight()),
                            }
                        } else {
                            Cell::from(c.clone())
                        }
                    })
                    .collect::<Vec<_>>(),
            )
        })
        .collect();

    let n = le.headers.len().max(1);
    let widths: Vec<Constraint> = if n == 1 {
        vec![Constraint::Percentage(100)]
    } else {
        (0..n).map(|c| if c == 1 { Constraint::Percentage(60) } else { Constraint::Percentage((40 / (n - 1).max(1)) as u16) }).collect()
    };
    let table = Table::new(table_rows, widths)
        .header(header)
        .column_spacing(2)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Edit {} ({} row(s)) ", le.title, le.rows.len()))
                .border_style(theme::border()),
        );
    f.render_stateful_widget(table, rows_area[0], &mut le.state);

    let msg = match &le.error {
        Some(err) => format!(" ✗ {err}"),
        None if le.cell.is_some() => " typing cell · Enter commit · Esc cancel cell".to_string(),
        None => String::new(),
    };
    if !msg.is_empty() {
        let style = if le.error.is_some() { Style::default().fg(Color::Red) } else { theme::dim() };
        f.render_widget(Paragraph::new(msg).style(style).wrap(Wrap { trim: true }), rows_area[1]);
    }
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
