//! Interactive ratatui TUI — the bare-invocation experience. Wraps the same ops the CLI uses:
//! browse releases/artists, probe services, and run a live, resume-aware collection pass.

use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Gauge, List, ListItem, ListState, Paragraph, Wrap};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::db::{ArtistSummary, ReleaseSummary};
use crate::services::Services;
use crate::{Config, Db};

mod theme {
    use ratatui::style::Color;
    pub const ACCENT: Color = Color::Cyan;
    pub const OK: Color = Color::Green;
    pub const BAD: Color = Color::Red;
    pub const DIM: Color = Color::DarkGray;
}

#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Home,
    Dashboard,
    Releases,
    Artists,
    Services,
    Collection,
}

const MENU: &[(&str, Screen)] = &[
    ("Dashboard", Screen::Dashboard),
    ("Releases", Screen::Releases),
    ("Artists", Screen::Artists),
    ("Test services", Screen::Services),
    ("Collection", Screen::Collection),
];

/// Messages from background tasks to the UI.
enum Msg {
    Probe(String, bool, String),
    Log(String),
    Progress(usize, usize),
    Done(String),
}

struct App {
    cfg: Config,
    db: Db,
    screen: Screen,
    menu: ListState,
    should_quit: bool,

    // search browsers
    query: String,
    releases: Vec<ReleaseSummary>,
    artists: Vec<ArtistSummary>,
    list: ListState,

    // services
    probes: Vec<(String, bool, String)>,
    probing: bool,

    // collection
    log: Vec<String>,
    progress: Option<(usize, usize)>,
    running: bool,
    collection_limit: String,

    tx: UnboundedSender<Msg>,
    rx: UnboundedReceiver<Msg>,
    status: String,
}

impl App {
    fn new(cfg: Config, db: Db) -> Self {
        let (tx, rx) = unbounded_channel();
        let mut menu = ListState::default();
        menu.select(Some(0));
        Self {
            cfg,
            db,
            screen: Screen::Home,
            menu,
            should_quit: false,
            query: String::new(),
            releases: Vec::new(),
            artists: Vec::new(),
            list: ListState::default(),
            probes: Vec::new(),
            probing: false,
            log: Vec::new(),
            progress: None,
            running: false,
            collection_limit: "1".into(),
            tx,
            rx,
            status: "↑/↓ select · Enter open · q quit".into(),
        }
    }

    fn enter_screen(&mut self, s: Screen) {
        self.screen = s;
        self.query.clear();
        self.list.select(None);
        match s {
            Screen::Releases => self.run_release_search(),
            Screen::Artists => self.run_artist_search(),
            Screen::Services => self.start_probes(),
            _ => {}
        }
    }

    fn run_release_search(&mut self) {
        let q = self.query.trim();
        self.releases = if q.is_empty() {
            self.db.list_releases(200, "date_added").unwrap_or_default()
        } else {
            self.db.search_releases(q, 200).unwrap_or_default()
        };
        self.list.select((!self.releases.is_empty()).then_some(0));
    }

    fn run_artist_search(&mut self) {
        let q = self.query.trim();
        self.artists = if q.is_empty() {
            self.db.list_artists(200, "name").unwrap_or_default()
        } else {
            self.db.search_artists(q, 200).unwrap_or_default()
        };
        self.list.select((!self.artists.is_empty()).then_some(0));
    }

    fn start_probes(&mut self) {
        if self.probing {
            return;
        }
        self.probes.clear();
        self.probing = true;
        let cfg = self.cfg.clone();
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let services = Services::new(&cfg);
            for (name, probe) in services.test_all().await {
                use crate::services::Probe::*;
                let (ok, detail) = match probe {
                    Ok(d) => (true, d),
                    Skipped(r) => (false, r),
                    Failed(e) => (false, e),
                };
                let _ = tx.send(Msg::Probe(name.to_string(), ok, detail));
            }
            let _ = tx.send(Msg::Done("probes".into()));
        });
    }

    /// The parsed run count (defaults to 1, minimum 1).
    fn collection_count(&self) -> usize {
        self.collection_limit.parse::<usize>().unwrap_or(0).max(1)
    }

    /// Step the collection count up or down (keeps the displayed string in sync).
    fn step_collection_limit(&mut self, delta: isize) {
        let next = (self.collection_count() as isize + delta).max(1) as usize;
        self.collection_limit = next.to_string();
    }

    fn start_collection(&mut self) {
        if self.running {
            return;
        }
        self.running = true;
        self.log.clear();
        self.progress = Some((0, 0));
        let cfg = self.cfg.clone();
        let db = self.db.clone();
        let tx = self.tx.clone();
        let limit = self.collection_count();
        tokio::spawn(async move {
            run_collection_task(cfg, db, tx, limit).await;
        });
    }

    fn list_len(&self) -> usize {
        match self.screen {
            Screen::Releases => self.releases.len(),
            Screen::Artists => self.artists.len(),
            _ => 0,
        }
    }

    fn move_selection(&mut self, delta: isize) {
        let len = match self.screen {
            Screen::Home => MENU.len(),
            Screen::Releases | Screen::Artists => self.list_len(),
            _ => return,
        };
        if len == 0 {
            return;
        }
        let state = if self.screen == Screen::Home { &mut self.menu } else { &mut self.list };
        let cur = state.selected().unwrap_or(0) as isize;
        let next = (cur + delta).rem_euclid(len as isize) as usize;
        state.select(Some(next));
    }

    fn drain_messages(&mut self) {
        while let Ok(msg) = self.rx.try_recv() {
            match msg {
                Msg::Probe(name, ok, detail) => self.probes.push((name, ok, detail)),
                Msg::Log(line) => {
                    self.log.push(line);
                    if self.log.len() > 500 {
                        self.log.drain(0..self.log.len() - 500);
                    }
                }
                Msg::Progress(done, total) => self.progress = Some((done, total)),
                Msg::Done(what) => {
                    if what == "probes" {
                        self.probing = false;
                    } else {
                        self.running = false;
                        self.log.push("— run complete —".into());
                    }
                }
            }
        }
    }
}

/// Background collection pass: process the unprocessed resume queue, streaming progress.
async fn run_collection_task(cfg: Config, db: Db, tx: UnboundedSender<Msg>, limit: usize) {
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        let _ = tx.send(Msg::Log("Discogs not configured".into()));
        let _ = tx.send(Msg::Done("collection".into()));
        return;
    }
    let username = cfg.discogs.username.clone();
    let entries = match services.discogs.get_user_collection(&username).await {
        Ok(e) => e,
        Err(e) => {
            let _ = tx.send(Msg::Log(format!("collection fetch failed: {e}")));
            let _ = tx.send(Msg::Done("collection".into()));
            return;
        }
    };
    // Only the unprocessed (not-yet-enriched) releases, capped at the requested count.
    let mut ids: Vec<String> = entries
        .iter()
        .filter_map(|v| v.get("id").map(|i| match i {
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        }))
        .filter(|id| !db.has_enriched_release(id).unwrap_or(false))
        .collect();
    let available = ids.len();
    ids.truncate(limit);

    let total = ids.len();
    let _ = tx.send(Msg::Log(format!("processing {total} of {available} unprocessed release(s)")));
    let client = crate::ops::release::image_client();

    for (i, id) in ids.iter().enumerate() {
        match crate::ops::release::process_release(&cfg, &services, &db, &client, id, true, None).await {
            Ok((rec, _)) => {
                let _ = db.record_processed(&rec.id, id, None, None);
                let _ = tx.send(Msg::Log(format!("✓ {} — {}", first_artist(&rec.artists), rec.title)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Log(format!("✗ {id} — {e}")));
            }
        }
        let _ = tx.send(Msg::Progress(i + 1, total));
    }
    let _ = tx.send(Msg::Done("collection".into()));
}

fn first_artist(artists: &serde_json::Value) -> String {
    artists.as_array().and_then(|a| a.first()).and_then(|a| a.get("name")).and_then(|n| n.as_str()).unwrap_or("?").to_string()
}

/// Launch the TUI.
pub async fn run(cfg: Config) -> Result<()> {
    use std::io::IsTerminal;
    if !std::io::stdout().is_terminal() {
        anyhow::bail!(
            "the TUI needs an interactive terminal. Run `scrapper` in a real terminal, or use a \
             subcommand (e.g. `scrapper status`, `scrapper --help`)."
        );
    }
    let db = Db::open(cfg.db_path())?;
    let mut terminal = ratatui::init();
    let mut app = App::new(cfg, db);
    let result = run_loop(&mut terminal, &mut app).await;
    ratatui::restore();
    result
}

async fn run_loop(terminal: &mut ratatui::DefaultTerminal, app: &mut App) -> Result<()> {
    while !app.should_quit {
        app.drain_messages();
        terminal.draw(|f| draw(f, app))?;
        if event::poll(Duration::from_millis(80))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    handle_key(app, key.code);
                }
            }
        }
    }
    Ok(())
}

fn handle_key(app: &mut App, code: KeyCode) {
    // Global.
    match code {
        KeyCode::Char('q') if app.screen == Screen::Home => {
            app.should_quit = true;
            return;
        }
        KeyCode::Esc => {
            if app.screen == Screen::Home {
                app.should_quit = true;
            } else {
                app.screen = Screen::Home;
            }
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
            KeyCode::Enter => {
                if app.screen == Screen::Releases {
                    app.run_release_search();
                } else {
                    app.run_artist_search();
                }
            }
            KeyCode::Backspace => {
                app.query.pop();
            }
            KeyCode::Char(c) => app.query.push(c),
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
        Screen::Dashboard => {}
    }
}

fn draw(f: &mut Frame, app: &mut App) {
    let chunks = Layout::vertical([Constraint::Length(3), Constraint::Min(0), Constraint::Length(1)]).split(f.area());
    draw_header(f, chunks[0], app);
    match app.screen {
        Screen::Home => draw_home(f, chunks[1], app),
        Screen::Dashboard => draw_dashboard(f, chunks[1], app),
        Screen::Releases => draw_releases(f, chunks[1], app),
        Screen::Artists => draw_artists(f, chunks[1], app),
        Screen::Services => draw_services(f, chunks[1], app),
        Screen::Collection => draw_collection(f, chunks[1], app),
    }
    let hint = match app.screen {
        Screen::Home => "↑/↓ select · Enter open · q quit",
        Screen::Releases | Screen::Artists => "type to search · Enter refresh · ↑/↓ scroll · Esc back",
        Screen::Services => "r re-probe · Esc back",
        Screen::Collection => "type/↑/↓ set count · r run · Esc back",
        Screen::Dashboard => "Esc back",
    };
    f.render_widget(Paragraph::new(hint).style(Style::default().fg(theme::DIM)), chunks[2]);
    let _ = &app.status;
}

fn draw_header(f: &mut Frame, area: Rect, app: &App) {
    let title = match app.screen {
        Screen::Home => "scrapper",
        Screen::Dashboard => "scrapper · Dashboard",
        Screen::Releases => "scrapper · Releases",
        Screen::Artists => "scrapper · Artists",
        Screen::Services => "scrapper · Services",
        Screen::Collection => "scrapper · Collection",
    };
    let block = Block::default().borders(Borders::ALL).border_style(Style::default().fg(theme::ACCENT));
    f.render_widget(
        Paragraph::new(Line::from(vec![Span::styled(title, Style::default().fg(theme::ACCENT).add_modifier(Modifier::BOLD))])).block(block),
        area,
    );
}

fn draw_home(f: &mut Frame, area: Rect, app: &mut App) {
    let items: Vec<ListItem> = MENU.iter().map(|(label, _)| ListItem::new(format!("  {label}"))).collect();
    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(" Menu "))
        .highlight_style(Style::default().fg(theme::ACCENT).add_modifier(Modifier::BOLD))
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, area, &mut app.menu);
}

fn draw_dashboard(f: &mut Frame, area: Rect, app: &App) {
    let s = app.db.stats().unwrap_or_default();
    let pct = if s.total_collection_items > 0 { 100.0 * s.processed_items as f64 / s.total_collection_items as f64 } else { 0.0 };
    let lines = vec![
        Line::from(""),
        Line::from(format!("   Releases           {}", s.total_releases)),
        Line::from(format!("   Artists            {}", s.total_artists)),
        Line::from(format!("   Collection items   {}", s.total_collection_items)),
        Line::from(format!("   Processed          {} ({pct:.1}%)", s.processed_items)),
        Line::from(format!("   Enriched           {}", s.enriched_items)),
        Line::from(""),
        Line::from(format!("   Database  {}", app.db.path().display())),
        Line::from(format!("   Output    {}", app.cfg.data_dir().display())),
    ];
    f.render_widget(Paragraph::new(lines).block(Block::default().borders(Borders::ALL).title(" Status ")), area);
}

fn draw_releases(f: &mut Frame, area: Rect, app: &mut App) {
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(0)]).split(area);
    f.render_widget(search_box(&app.query, app.releases.len()), rows[0]);
    let items: Vec<ListItem> = app
        .releases
        .iter()
        .map(|r| ListItem::new(format!("  [{}] {} — {} ({})", r.discogs_id.as_deref().unwrap_or("?"), r.artist_names.join(", "), r.title, r.year.unwrap_or(0))))
        .collect();
    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(" Releases "))
        .highlight_style(Style::default().fg(theme::ACCENT).add_modifier(Modifier::BOLD))
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, rows[1], &mut app.list);
}

fn draw_artists(f: &mut Frame, area: Rect, app: &mut App) {
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Min(0)]).split(area);
    f.render_widget(search_box(&app.query, app.artists.len()), rows[0]);
    let items: Vec<ListItem> = app
        .artists
        .iter()
        .map(|a| ListItem::new(format!("  [{}] {}", a.discogs_id.as_deref().unwrap_or("?"), a.name)))
        .collect();
    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(" Artists "))
        .highlight_style(Style::default().fg(theme::ACCENT).add_modifier(Modifier::BOLD))
        .highlight_symbol("▶ ");
    f.render_stateful_widget(list, rows[1], &mut app.list);
}

fn search_box(query: &str, count: usize) -> Paragraph<'static> {
    Paragraph::new(format!(" {query}")).block(
        Block::default()
            .borders(Borders::ALL)
            .title(format!(" Search ({count} results) "))
            .border_style(Style::default().fg(theme::ACCENT)),
    )
}

fn draw_services(f: &mut Frame, area: Rect, app: &App) {
    let mut lines = vec![Line::from("")];
    if app.probes.is_empty() && app.probing {
        lines.push(Line::from("   probing…"));
    }
    for (name, ok, detail) in &app.probes {
        let (sym, col) = if *ok { ("✓", theme::OK) } else { ("✗", theme::BAD) };
        lines.push(Line::from(vec![
            Span::raw("   "),
            Span::styled(sym, Style::default().fg(col)),
            Span::raw(format!(" {name:<12} ")),
            Span::styled(detail.clone(), Style::default().fg(theme::DIM)),
        ]));
    }
    f.render_widget(Paragraph::new(lines).block(Block::default().borders(Borders::ALL).title(" Service health ")), area);
}

fn draw_collection(f: &mut Frame, area: Rect, app: &App) {
    let rows = Layout::vertical([Constraint::Length(3), Constraint::Length(3), Constraint::Min(0)]).split(area);

    // Editable run count.
    let count_style = if app.running { Style::default().fg(theme::DIM) } else { Style::default().fg(theme::ACCENT) };
    let count = Paragraph::new(Line::from(vec![
        Span::raw(" Process "),
        Span::styled(
            if app.collection_limit.is_empty() { "1".to_string() } else { app.collection_limit.clone() },
            count_style.add_modifier(Modifier::BOLD),
        ),
        Span::raw(" release(s) per run"),
    ]))
    .block(Block::default().borders(Borders::ALL).title(" Count ").border_style(count_style));
    f.render_widget(count, rows[0]);

    let (done, total) = app.progress.unwrap_or((0, 0));
    let ratio = if total > 0 { done as f64 / total as f64 } else { 0.0 };
    let label = if app.running { format!("{done}/{total}") } else if total > 0 { format!("done {done}/{total}") } else { "press r to run".into() };
    let gauge = Gauge::default()
        .block(Block::default().borders(Borders::ALL).title(" Progress "))
        .gauge_style(Style::default().fg(theme::ACCENT))
        .ratio(ratio.clamp(0.0, 1.0))
        .label(label);
    f.render_widget(gauge, rows[1]);

    let visible = rows[2].height.saturating_sub(2) as usize;
    let start = app.log.len().saturating_sub(visible);
    let text: Vec<Line> = app.log[start..].iter().map(|l| Line::from(l.clone())).collect();
    f.render_widget(
        Paragraph::new(text).wrap(Wrap { trim: true }).block(Block::default().borders(Borders::ALL).title(" Log ")),
        rows[2],
    );
}
