//! Central TUI state: the [`App`] struct, the [`Screen`] enum + menu, the background-task
//! message channel, and the helpers screens/keys call into.

use ratatui::widgets::ListState;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::db::{ArtistSummary, ReleaseSummary};
use crate::ops::release::UiRequest;
use crate::services::Services;
use crate::{Config, Db};

use super::detail::DetailView;
use super::modals::{PendingDescribe, PendingPick};
use super::runners;

/// How the TUI starts.
pub enum Launch {
    /// Normal: the home menu.
    Home,
    /// Jump straight to the Collection screen and process `count` releases.
    Collection { count: usize },
}

#[derive(Clone, Copy, PartialEq)]
pub(crate) enum Screen {
    Home,
    Dashboard,
    Releases,
    Artists,
    Services,
    Collection,
    ArtistRun,
}

impl Screen {
    /// Header subtitle (empty → bare "scrapper").
    pub(crate) fn title(self) -> &'static str {
        match self {
            Screen::Home => "",
            Screen::Dashboard => "Dashboard",
            Screen::Releases => "Releases",
            Screen::Artists => "Artists",
            Screen::Services => "Services",
            Screen::Collection => "Collection",
            Screen::ArtistRun => "Enrich artists",
        }
    }

    /// Footer key hints for this screen.
    pub(crate) fn hint(self) -> &'static str {
        match self {
            Screen::Home => "↑/↓ select · Enter open · q quit",
            Screen::Releases | Screen::Artists => "type to search · ↑/↓ move · Enter details · Esc back",
            Screen::Services => "r re-probe · Esc back",
            Screen::Collection | Screen::ArtistRun => "type/↑/↓ set count · r run · Esc back",
            Screen::Dashboard => "Esc back",
        }
    }
}

pub(crate) const MENU: &[(&str, Screen)] = &[
    ("Dashboard", Screen::Dashboard),
    ("Releases", Screen::Releases),
    ("Artists", Screen::Artists),
    ("Test services", Screen::Services),
    ("Collection", Screen::Collection),
    ("Enrich artists", Screen::ArtistRun),
];

/// Messages from background tasks to the UI.
pub(crate) enum Msg {
    Probe(String, bool, String),
    Log(String),
    Progress(usize, usize),
    /// Artist runner log line (separate buffer from the collection log).
    ArtistLog(String),
    ArtistProgress(usize, usize),
    /// A background task finished: "probes" | "collection" | "artist_run" | "artist_one".
    Done(String),
}

pub(crate) struct App {
    pub(crate) cfg: Config,
    pub(crate) db: Db,
    pub(crate) screen: Screen,
    pub(crate) menu: ListState,
    pub(crate) should_quit: bool,

    // navigation
    pub(crate) nav_stack: Vec<Screen>,
    pub(crate) detail: Option<DetailView>,

    // search browsers
    pub(crate) query: String,
    pub(crate) releases: Vec<ReleaseSummary>,
    pub(crate) artists: Vec<ArtistSummary>,
    pub(crate) release_enriched: Vec<bool>,
    pub(crate) artist_enriched: Vec<bool>,
    pub(crate) list: ListState,

    // services
    pub(crate) probes: Vec<(String, bool, String)>,
    pub(crate) probing: bool,

    // collection runner
    pub(crate) log: Vec<String>,
    pub(crate) progress: Option<(usize, usize)>,
    pub(crate) running: bool,
    pub(crate) collection_limit: String,

    // artist runner (batch + single)
    pub(crate) artist_log: Vec<String>,
    pub(crate) artist_progress: Option<(usize, usize)>,
    pub(crate) artist_running: bool,
    pub(crate) artist_limit: String,

    // interactive modals
    pub(crate) pending: Option<PendingPick>,
    pub(crate) describe: Option<PendingDescribe>,

    pub(crate) autostart: bool,

    pub(crate) tx: UnboundedSender<Msg>,
    pub(crate) rx: UnboundedReceiver<Msg>,
    pub(crate) pick_tx: UnboundedSender<UiRequest>,
    pub(crate) pick_rx: UnboundedReceiver<UiRequest>,
}

impl App {
    pub(crate) fn new(cfg: Config, db: Db) -> Self {
        let (tx, rx) = unbounded_channel();
        let (pick_tx, pick_rx) = unbounded_channel();
        let mut menu = ListState::default();
        menu.select(Some(0));
        Self {
            cfg,
            db,
            screen: Screen::Home,
            menu,
            should_quit: false,
            nav_stack: Vec::new(),
            detail: None,
            query: String::new(),
            releases: Vec::new(),
            artists: Vec::new(),
            release_enriched: Vec::new(),
            artist_enriched: Vec::new(),
            list: ListState::default(),
            probes: Vec::new(),
            probing: false,
            log: Vec::new(),
            progress: None,
            running: false,
            collection_limit: "1".into(),
            artist_log: Vec::new(),
            artist_progress: None,
            artist_running: false,
            artist_limit: "10".into(),
            pending: None,
            describe: None,
            autostart: false,
            tx,
            rx,
            pick_tx,
            pick_rx,
        }
    }

    pub(crate) fn enter_screen(&mut self, s: Screen) {
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

    /// Re-run the active browser's search (called live as the query changes).
    pub(crate) fn refresh_search(&mut self) {
        match self.screen {
            Screen::Releases => self.run_release_search(),
            Screen::Artists => self.run_artist_search(),
            _ => {}
        }
    }

    pub(crate) fn run_release_search(&mut self) {
        let q = self.query.trim();
        self.releases = if q.is_empty() {
            self.db.list_releases(200, "date_added").unwrap_or_default()
        } else {
            self.db.search_releases(q, 200).unwrap_or_default()
        };
        let set = self.db.enriched_release_ids().unwrap_or_default();
        self.release_enriched = self
            .releases
            .iter()
            .map(|r| r.discogs_id.as_deref().map(|d| set.contains(d)).unwrap_or(false))
            .collect();
        self.list.select((!self.releases.is_empty()).then_some(0));
    }

    pub(crate) fn run_artist_search(&mut self) {
        let q = self.query.trim();
        self.artists = if q.is_empty() {
            self.db.list_artists(200, "name").unwrap_or_default()
        } else {
            self.db.search_artists(q, 200).unwrap_or_default()
        };
        let set = self.db.enriched_artist_ids().unwrap_or_default();
        self.artist_enriched = self.artists.iter().map(|a| set.contains(&a.id)).collect();
        self.list.select((!self.artists.is_empty()).then_some(0));
    }

    pub(crate) fn start_probes(&mut self) {
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

    /// The parsed collection run count (defaults to 1, minimum 1).
    pub(crate) fn collection_count(&self) -> usize {
        self.collection_limit.parse::<usize>().unwrap_or(0).max(1)
    }

    pub(crate) fn step_collection_limit(&mut self, delta: isize) {
        let next = (self.collection_count() as isize + delta).max(1) as usize;
        self.collection_limit = next.to_string();
    }

    /// The parsed artist run count (defaults to 1, minimum 1).
    pub(crate) fn artist_count(&self) -> usize {
        self.artist_limit.parse::<usize>().unwrap_or(0).max(1)
    }

    pub(crate) fn step_artist_limit(&mut self, delta: isize) {
        let next = (self.artist_count() as isize + delta).max(1) as usize;
        self.artist_limit = next.to_string();
    }

    pub(crate) fn start_collection(&mut self) {
        if self.running {
            return;
        }
        self.running = true;
        self.log.clear();
        self.progress = Some((0, 0));
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        let limit = self.collection_count();
        tokio::spawn(async move {
            runners::run_collection_task(cfg, db, tx, pick_tx, limit).await;
        });
    }

    pub(crate) fn start_artist_run(&mut self) {
        if self.artist_running {
            return;
        }
        self.artist_running = true;
        self.artist_log.clear();
        self.artist_progress = Some((0, 0));
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        let limit = self.artist_count();
        tokio::spawn(async move {
            runners::run_artist_task(cfg, db, tx, pick_tx, limit).await;
        });
    }

    /// Enrich one artist on demand (from the artist detail view).
    pub(crate) fn start_single_artist(&mut self, name: String) {
        if self.artist_running {
            return;
        }
        self.artist_running = true;
        self.artist_log.clear();
        self.artist_progress = Some((0, 1));
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        tokio::spawn(async move {
            runners::run_single_artist_task(cfg, db, tx, pick_tx, name).await;
        });
    }

    fn list_len(&self) -> usize {
        match self.screen {
            Screen::Releases => self.releases.len(),
            Screen::Artists => self.artists.len(),
            _ => 0,
        }
    }

    pub(crate) fn move_selection(&mut self, delta: isize) {
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

    /// Open the detail drill-down for the selected release/artist (pushes onto the nav stack).
    pub(crate) fn open_detail(&mut self) {
        match self.screen {
            Screen::Releases => {
                let did = self.list.selected().and_then(|i| self.releases.get(i)).and_then(|s| s.discogs_id.clone());
                let Some(did) = did else { return };
                if let Ok(Some(rec)) = self.db.get_release_by_discogs_id(&did) {
                    self.nav_stack.push(self.screen);
                    self.detail = Some(DetailView::Release(Box::new(rec)));
                }
            }
            Screen::Artists => {
                let id = self.list.selected().and_then(|i| self.artists.get(i)).map(|s| s.id.clone());
                let Some(id) = id else { return };
                if let Ok(Some(rec)) = self.db.get_artist_by_id(&id) {
                    self.nav_stack.push(self.screen);
                    self.detail = Some(DetailView::Artist(Box::new(rec)));
                }
            }
            _ => {}
        }
    }

    /// Re-read the artist currently shown in the detail view (after an enrich completes).
    fn refresh_detail_artist(&mut self) {
        if let Some(DetailView::Artist(rec)) = &self.detail {
            if let Ok(Some(fresh)) = self.db.get_artist_by_id(&rec.id) {
                self.detail = Some(DetailView::Artist(Box::new(fresh)));
            }
        }
    }

    pub(crate) fn drain_messages(&mut self) {
        // Surface interactive requests (one active at a time; the task blocks until answered).
        while let Ok(req) = self.pick_rx.try_recv() {
            match req {
                UiRequest::Pick(p) => self.pending = Some(PendingPick::new(p)),
                UiRequest::Describe(d) => self.describe = Some(PendingDescribe::new(d)),
            }
        }
        while let Ok(msg) = self.rx.try_recv() {
            match msg {
                Msg::Probe(name, ok, detail) => self.probes.push((name, ok, detail)),
                Msg::Log(line) => push_capped(&mut self.log, line),
                Msg::Progress(done, total) => self.progress = Some((done, total)),
                Msg::ArtistLog(line) => push_capped(&mut self.artist_log, line),
                Msg::ArtistProgress(done, total) => self.artist_progress = Some((done, total)),
                Msg::Done(what) => match what.as_str() {
                    "probes" => self.probing = false,
                    "collection" => {
                        self.running = false;
                        self.log.push("— run complete —".into());
                    }
                    _ => {
                        // artist_run | artist_one
                        self.artist_running = false;
                        self.artist_log.push("— run complete —".into());
                        self.refresh_detail_artist();
                    }
                },
            }
        }
    }
}

/// Append to a log buffer, keeping the last 500 lines.
fn push_capped(buf: &mut Vec<String>, line: String) {
    buf.push(line);
    if buf.len() > 500 {
        buf.drain(0..buf.len() - 500);
    }
}
