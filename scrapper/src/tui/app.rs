//! Central TUI state: the [`App`] struct, the [`Screen`] enum + menu, the background-task
//! message channel, and the helpers screens/keys call into.

use std::time::Instant;

use ratatui::widgets::ListState;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::db::{ArtistSummary, BoxsetSummary, ReleaseSummary};
use crate::ops::release::UiRequest;
use crate::services::Services;
use crate::{Config, Db};

use super::detail::{DetailView, RowAction};
use super::modals::{PendingDescribe, PendingEdit, PendingListEdit, PendingPick};
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
    Boxsets,
}

/// Which half of the Boxsets screen is shown.
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum BoxsetTab {
    /// Boxes with no linked member albums yet — Enter runs discovery.
    Unprocessed,
    /// Boxes with at least one linked member — Enter opens the box's detail.
    Processed,
    /// Flagged as a single album in a box edition — hidden from Unprocessed; ^x moves it back.
    Single,
}

impl BoxsetTab {
    pub(crate) const ALL: [BoxsetTab; 3] = [BoxsetTab::Unprocessed, BoxsetTab::Processed, BoxsetTab::Single];

    /// The next tab in display order, wrapping.
    pub(crate) fn next(self) -> Self {
        match self {
            BoxsetTab::Unprocessed => BoxsetTab::Processed,
            BoxsetTab::Processed => BoxsetTab::Single,
            BoxsetTab::Single => BoxsetTab::Unprocessed,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            BoxsetTab::Unprocessed => "Unprocessed",
            BoxsetTab::Processed => "Processed",
            BoxsetTab::Single => "Single release",
        }
    }

    /// Which tab a box belongs on.
    pub(crate) fn of(b: &BoxsetSummary) -> Self {
        if b.is_processed() {
            BoxsetTab::Processed
        } else if b.single_release {
            BoxsetTab::Single
        } else {
            BoxsetTab::Unprocessed
        }
    }
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
            Screen::Boxsets => "Boxsets",
        }
    }

    /// Footer key hints for this screen.
    pub(crate) fn hint(self) -> &'static str {
        match self {
            Screen::Home => "↑/↓ select · Enter open · q quit",
            Screen::Releases | Screen::Artists => "type to search · ↑/↓ move · Enter details · Esc back",
            Screen::Services => "r re-probe · Esc back",
            Screen::Collection | Screen::ArtistRun => "type/↑/↓ set count · r run · Esc back",
            Screen::Boxsets => "Tab switch view · type to search · ↑/↓ move · Enter run/open · ^x single release ⇄ unprocessed · ^f force-refetch · ^r re-run · Esc back",
            Screen::Dashboard => "Esc back",
        }
    }
}

pub(crate) const MENU: &[(&str, Screen)] = &[
    ("Dashboard", Screen::Dashboard),
    ("Releases", Screen::Releases),
    ("Artists", Screen::Artists),
    ("Boxsets", Screen::Boxsets),
    ("Test services", Screen::Services),
    ("Collection", Screen::Collection),
    ("Enrich artists", Screen::ArtistRun),
];

/// Which background run a [`Processing`] page is following (selects its log/progress buffers).
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum RunKind {
    Collection,
    ArtistRun,
    Boxset,
    /// A single-record task started from the detail view (enrich, field refresh, service set).
    Detail,
}

/// The full-screen processing page shown while a background run is active. It stays up when
/// the run finishes (so the summary can be read) until Esc; Esc during the run only hides the
/// page — the task keeps going and its pickers still surface.
pub(crate) struct Processing {
    pub(crate) kind: RunKind,
    /// What is being processed, e.g. "Boxset discovery · [7709507] Simple Minds — …".
    pub(crate) title: String,
    pub(crate) started: Instant,
}

/// Messages from background tasks to the UI.
pub(crate) enum Msg {
    Probe(String, bool, String),
    Log(String),
    Progress(usize, usize),
    /// Artist runner log line (separate buffer from the collection log).
    ArtistLog(String),
    ArtistProgress(usize, usize),
    /// Boxset discovery log line / progress (own buffer on the Boxsets screen).
    BoxsetLog(String),
    BoxsetProgress(usize, usize),
    /// A background task finished: "probes" | "collection" | "artist_run" | "boxset" | "artist_one".
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
    /// Cursor over the selectable rows of the active detail view.
    pub(crate) detail_sel: usize,
    /// A per-field / single-record detail task is running.
    pub(crate) detail_busy: bool,
    /// Active manual-edit overlay.
    pub(crate) edit: Option<PendingEdit>,
    /// Active structured list-edit overlay (tracklist/videos).
    pub(crate) list_edit: Option<PendingListEdit>,

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

    // boxsets browser + discovery runner
    pub(crate) boxset_tab: BoxsetTab,
    /// Every box-format release in the DB.
    pub(crate) boxsets_all: Vec<BoxsetSummary>,
    /// The rows shown: `boxsets_all` narrowed to the active tab and the search query.
    pub(crate) boxsets: Vec<BoxsetSummary>,
    pub(crate) boxset_log: Vec<String>,
    pub(crate) boxset_progress: Option<(usize, usize)>,
    /// Discogs ID of the box whose discovery run is in progress.
    pub(crate) boxset_running: Option<String>,

    // collection.json regeneration (debounced: one run at a time, dirty re-runs)
    pub(crate) regen_running: bool,
    pub(crate) regen_dirty: bool,

    /// Full-screen page for the run in progress (see [`Processing`]).
    pub(crate) processing: Option<Processing>,

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
            detail_sel: 0,
            detail_busy: false,
            edit: None,
            list_edit: None,
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
            boxset_tab: BoxsetTab::Unprocessed,
            boxsets_all: Vec::new(),
            boxsets: Vec::new(),
            boxset_log: Vec::new(),
            boxset_progress: None,
            boxset_running: None,
            regen_running: false,
            regen_dirty: false,
            processing: None,
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
            Screen::Boxsets => {
                self.boxset_tab = BoxsetTab::Unprocessed;
                self.load_boxsets();
            }
            _ => {}
        }
    }

    /// Re-run the active browser's search (called live as the query changes).
    pub(crate) fn refresh_search(&mut self) {
        match self.screen {
            Screen::Releases => self.run_release_search(),
            Screen::Artists => self.run_artist_search(),
            Screen::Boxsets => self.apply_boxset_filter(),
            _ => {}
        }
    }

    /// Reload every box from the DB and re-apply the tab/query filter.
    pub(crate) fn load_boxsets(&mut self) {
        // A Discogs "Box Set" whose tracklist has no album section headers is almost always a
        // single album in a box edition, so it is not offered for discovery. Boxes linked by
        // hand (CLI `--boxset`) still show under Processed, and ones the user flagged as a
        // single release under that tab.
        self.boxsets_all = self
            .db
            .list_boxsets()
            .unwrap_or_default()
            .into_iter()
            .filter(|b| b.has_headers || b.is_processed() || b.single_release)
            .collect();
        self.apply_boxset_filter();
    }

    /// Narrow `boxsets_all` to the active tab and query. The cursor is only reset while the
    /// Boxsets list is actually on screen, so a run completing in the background never moves
    /// another screen's selection.
    pub(crate) fn apply_boxset_filter(&mut self) {
        let tab = self.boxset_tab;
        let q = self.query.clone();
        self.boxsets = self
            .boxsets_all
            .iter()
            .filter(|b| BoxsetTab::of(b) == tab && b.matches_query(&q))
            .cloned()
            .collect();
        if self.screen == Screen::Boxsets && self.detail.is_none() {
            self.list.select((!self.boxsets.is_empty()).then_some(0));
        }
    }

    pub(crate) fn next_boxset_tab(&mut self) {
        self.boxset_tab = self.boxset_tab.next();
        self.apply_boxset_filter();
    }

    /// Per-tab counts (in `BoxsetTab::ALL` order) for the tab bar, respecting the search query.
    pub(crate) fn boxset_tab_counts(&self) -> [usize; 3] {
        let mut counts = [0; 3];
        for b in self.boxsets_all.iter().filter(|b| b.matches_query(&self.query)) {
            let i = BoxsetTab::ALL.iter().position(|t| *t == BoxsetTab::of(b)).unwrap_or(0);
            counts[i] += 1;
        }
        counts
    }

    /// Flag the selected unprocessed box as a single release (hiding it from Unprocessed), or
    /// clear the flag on a box in the Single tab so it is offered for discovery again.
    pub(crate) fn toggle_boxset_single_release(&mut self) {
        let Some(b) = self.list.selected().and_then(|i| self.boxsets.get(i)) else { return };
        let single = match self.boxset_tab {
            BoxsetTab::Unprocessed => true,
            BoxsetTab::Single => false,
            BoxsetTab::Processed => return,
        };
        let (id, title) = (b.discogs_id.clone(), b.title.clone());
        let line = match self.db.set_boxset_single_release(&id, single) {
            Ok(true) if single => format!("[{id}] {title} flagged as a single release — moved to the Single release tab"),
            Ok(true) => format!("[{id}] {title} is a box set again — moved to Unprocessed"),
            Ok(false) => format!("[{id}] {title} is no longer in the database"),
            Err(e) => format!("✗ could not update [{id}] {title}: {e}"),
        };
        push_capped(&mut self.boxset_log, line);
        let sel = self.list.selected();
        self.load_boxsets();
        // Keep the cursor near where it was rather than jumping back to the top.
        if let Some(i) = sel.filter(|_| !self.boxsets.is_empty()) {
            self.list.select(Some(i.min(self.boxsets.len() - 1)));
        }
    }

    /// Run boxset discovery for the selected box in the background. Refused while any other
    /// interactive task runs: two tasks would race on the single modal picker slot.
    pub(crate) fn start_boxset_discovery(&mut self, force_refresh: bool) {
        if self.boxset_running.is_some() {
            return;
        }
        if self.running || self.artist_running || self.detail_busy {
            push_capped(&mut self.boxset_log, "another interactive run is in progress — wait for it to finish".into());
            return;
        }
        let Some(b) = self.list.selected().and_then(|i| self.boxsets.get(i)) else {
            return;
        };
        let id = b.discogs_id.clone();
        self.begin_processing(
            RunKind::Boxset,
            format!("Boxset discovery · [{id}] {} — {} ({})", b.artist_names.join(", "), b.title, b.year.unwrap_or(0)),
        );
        self.boxset_log.clear();
        self.boxset_progress = Some((0, 0));
        self.boxset_running = Some(id.clone());
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        tokio::spawn(async move {
            runners::run_boxset_task(cfg, db, tx, pick_tx, id, force_refresh).await;
        });
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

    /// Switch to the processing page for a run that is starting.
    fn begin_processing(&mut self, kind: RunKind, title: impl Into<String>) {
        self.processing = Some(Processing { kind, title: title.into(), started: Instant::now() });
    }

    /// (still running, progress, log) for the run the processing page follows.
    pub(crate) fn processing_state(&self) -> (bool, Option<(usize, usize)>, &[String]) {
        match self.processing.as_ref().map(|p| p.kind) {
            Some(RunKind::Collection) => (self.running, self.progress, &self.log),
            Some(RunKind::ArtistRun) => (self.artist_running, self.artist_progress, &self.artist_log),
            Some(RunKind::Boxset) => (self.boxset_running.is_some(), self.boxset_progress, &self.boxset_log),
            Some(RunKind::Detail) => (self.detail_busy, None, &self.artist_log),
            None => (false, None, &[]),
        }
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
        self.begin_processing(RunKind::Collection, format!("Collection · processing {limit} newest release(s)"));
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
        self.begin_processing(RunKind::ArtistRun, format!("Enrich artists · up to {limit} un-enriched artist(s)"));
        tokio::spawn(async move {
            runners::run_artist_task(cfg, db, tx, pick_tx, limit).await;
        });
    }

    /// Re-enrich the whole artist record on demand (from the artist detail view).
    pub(crate) fn start_single_artist(&mut self, name: String) {
        if self.detail_busy {
            return;
        }
        self.detail_busy = true;
        self.artist_log.clear();
        self.begin_processing(RunKind::Detail, format!("Enrich artist · {name}"));
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        tokio::spawn(async move {
            runners::run_single_artist_task(cfg, db, tx, pick_tx, name).await;
        });
    }

    /// Re-enrich the whole release record on demand (from the release detail view).
    pub(crate) fn start_single_release(&mut self, discogs_id: String) {
        if self.detail_busy {
            return;
        }
        self.detail_busy = true;
        self.artist_log.clear();
        self.begin_processing(RunKind::Detail, format!("Refresh release · {discogs_id}"));
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        tokio::spawn(async move {
            runners::run_single_release_task(cfg, db, tx, pick_tx, discogs_id).await;
        });
    }

    /// Refresh collection.json off the UI thread after a mutating action. Debounced: while a
    /// regeneration is running further requests just mark it dirty, and completion re-runs once.
    pub(crate) fn schedule_collection_regen(&mut self) {
        if self.regen_running {
            self.regen_dirty = true;
            return;
        }
        self.regen_running = true;
        self.regen_dirty = false;
        let (cfg, db, tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone());
        tokio::spawn(async move {
            runners::run_regen_collection_task(cfg, db, tx).await;
        });
    }

    // ── detail editor ────────────────────────────────────────────────────────

    /// The selectable rows of the active detail view.
    fn detail_rows(&self) -> Vec<super::detail::DetailRow> {
        if self.detail.is_some() {
            super::detail::selectable(self)
        } else {
            Vec::new()
        }
    }

    /// Move the detail-field cursor, wrapping around the selectable rows.
    pub(crate) fn move_detail_selection(&mut self, delta: isize) {
        let len = self.detail_rows().len();
        if len == 0 {
            return;
        }
        let cur = self.detail_sel.min(len - 1) as isize;
        self.detail_sel = (cur + delta).rem_euclid(len as isize) as usize;
    }

    /// Keep the cursor within bounds after the row set changes.
    fn clamp_detail_sel(&mut self) {
        let len = self.detail_rows().len();
        if len == 0 {
            self.detail_sel = 0;
        } else if self.detail_sel >= len {
            self.detail_sel = len - 1;
        }
    }

    fn selected_action(&self) -> Option<RowAction> {
        self.detail_rows().get(self.detail_sel).map(|r| r.action)
    }

    /// Re-fetch the selected field's source online (`r`).
    pub(crate) fn refresh_selected_field(&mut self) {
        if self.detail_busy {
            return;
        }
        let Some(action) = self.selected_action().filter(|a| a.refreshable()) else { return };
        let (cfg, db, tx, pick_tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone(), self.pick_tx.clone());
        match (action, self.detail.as_ref()) {
            (RowAction::Artist { field, .. }, Some(DetailView::Artist(rec))) => {
                self.detail_busy = true;
                self.artist_log.clear();
                let rec = (**rec).clone();
                self.begin_processing(RunKind::Detail, format!("Refresh field · {}", rec.name));
                tokio::spawn(async move {
                    runners::run_refresh_artist_field_task(cfg, db, tx, pick_tx, rec, field).await;
                });
            }
            (RowAction::Release { field, .. }, Some(DetailView::Release(rec))) => {
                self.detail_busy = true;
                self.artist_log.clear();
                let rec = (**rec).clone();
                self.begin_processing(RunKind::Detail, format!("Refresh field · {}", rec.title));
                tokio::spawn(async move {
                    runners::run_refresh_release_field_task(cfg, db, tx, pick_tx, rec, field).await;
                });
            }
            _ => {}
        }
    }

    /// Open the manual-edit overlay for the selected field (`e`).
    pub(crate) fn edit_selected_field(&mut self) {
        if self.detail_busy {
            return;
        }
        let Some(row) = self.detail_rows().into_iter().nth(self.detail_sel) else { return };
        if !row.action.editable() {
            return;
        }
        // Structured fields (artists/tracklist/videos/images) open the list editor instead of
        // the one-line overlay.
        match (row.action, self.detail.as_ref()) {
            (RowAction::Release { field }, Some(DetailView::Release(rec))) if field.kind() == crate::ops::FieldKind::Structured => {
                use crate::ops::release as rel;
                let (headers, rows) = match field {
                    rel::ReleaseField::Artists => (vec!["Name", "Discogs ID", "Role"], rel::artists_to_rows(&rec.artists)),
                    rel::ReleaseField::Tracks => (vec!["Position", "Title", "Duration"], rel::tracklist_to_rows(&rec.tracklist)),
                    rel::ReleaseField::Images => (vec!["Type", "URL", "Width", "Height"], rel::images_to_rows(&rec.images)),
                    _ => (vec!["URL"], rel::videos_to_rows(&rec.videos)),
                };
                self.list_edit = Some(PendingListEdit::new(row.label, row.action, headers, rows));
                return;
            }
            (RowAction::Artist { field }, Some(DetailView::Artist(rec))) if field.kind() == crate::ops::FieldKind::Structured => {
                let rows = crate::ops::release::images_to_rows(&rec.images);
                self.list_edit = Some(PendingListEdit::new(row.label, row.action, vec!["Type", "URL", "Width", "Height"], rows));
                return;
            }
            _ => {}
        }
        let initial = match (row.action, self.detail.as_ref()) {
            (RowAction::Artist { field }, Some(DetailView::Artist(rec))) => field.get(rec),
            (RowAction::Release { field }, Some(DetailView::Release(rec))) => field.get(rec),
            _ => String::new(),
        };
        self.edit = Some(PendingEdit::new(row.label, row.action, initial));
    }

    /// Save a structured list edit (`s` in the list editor). A validation `Err` carries the
    /// message for the overlay to display.
    pub(crate) fn apply_list_edit(&mut self, action: RowAction, rows: &[Vec<String>]) -> Result<(), String> {
        use crate::ops::artist::ArtistField;
        use crate::ops::release::ReleaseField;
        let result = match (action, self.detail.as_ref()) {
            (RowAction::Release { field: ReleaseField::Artists }, Some(DetailView::Release(rec))) => {
                crate::ops::release::set_release_artists(&self.cfg, &self.db, rec, rows).map(|_| 0)
            }
            (RowAction::Release { field: ReleaseField::Tracks }, Some(DetailView::Release(rec))) => {
                crate::ops::release::set_release_tracklist(&self.cfg, &self.db, rec, rows).map(|_| 0)
            }
            (RowAction::Release { field: ReleaseField::Videos }, Some(DetailView::Release(rec))) => {
                crate::ops::release::set_release_videos(&self.cfg, &self.db, rec, rows).map(|_| 0)
            }
            (RowAction::Release { field: ReleaseField::Images }, Some(DetailView::Release(rec))) => {
                crate::ops::release::set_release_images(&self.cfg, &self.db, rec, rows).map(|_| 0)
            }
            (RowAction::Artist { field: ArtistField::Images }, Some(DetailView::Artist(rec))) => {
                crate::ops::artist::set_artist_images(&self.cfg, &self.db, rec, rows).map(|(_, fanout)| fanout)
            }
            _ => return Ok(()),
        };
        match result {
            Ok(fanout) => {
                if fanout > 0 {
                    self.artist_log.push(format!("✓ rewrote {fanout} embedding release JSON(s)"));
                }
                let label = match action {
                    RowAction::Release { field } => field.label(),
                    RowAction::Artist { field } => field.label(),
                };
                self.artist_log.push(format!("✓ saved {label} — DB + public JSON written"));
                self.schedule_collection_regen();
                self.refresh_detail();
                Ok(())
            }
            Err(e) => Err(e.to_string()),
        }
    }

    /// Apply a manual edit, then reload the detail record. A validation `Err` carries the
    /// message for the edit overlay to display (nothing was saved). Service-identity edits
    /// re-fetch from the API, so they run as a background task instead of applying inline.
    pub(crate) fn apply_edit(&mut self, action: RowAction, text: &str) -> Result<(), String> {
        use crate::ops::FieldKind;
        match (action, self.detail.as_ref()) {
            (RowAction::Release { field }, Some(DetailView::Release(rec))) if field.kind() == FieldKind::Service => {
                let rec = (**rec).clone();
                let input = text.to_string();
                self.detail_busy = true;
                self.artist_log.clear();
                self.begin_processing(RunKind::Detail, format!("Set service · {}", rec.title));
                let (cfg, db, tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone());
                tokio::spawn(async move {
                    runners::run_set_release_service_task(cfg, db, tx, rec, field, input).await;
                });
                return Ok(());
            }
            (RowAction::Artist { field }, Some(DetailView::Artist(rec))) if field.kind() == FieldKind::Service => {
                let rec = (**rec).clone();
                let input = text.to_string();
                self.detail_busy = true;
                self.artist_log.clear();
                self.begin_processing(RunKind::Detail, format!("Set service · {}", rec.name));
                let (cfg, db, tx) = (self.cfg.clone(), self.db.clone(), self.tx.clone());
                tokio::spawn(async move {
                    runners::run_set_artist_service_task(cfg, db, tx, rec, field, input).await;
                });
                return Ok(());
            }
            _ => {}
        }
        let result = match (action, self.detail.as_ref()) {
            (RowAction::Artist { field }, Some(DetailView::Artist(rec))) => {
                crate::ops::artist::set_artist_value(&self.cfg, &self.db, rec, field, text).map(|(_, fanout)| fanout)
            }
            (RowAction::Release { field }, Some(DetailView::Release(rec))) => {
                crate::ops::release::set_release_value(&self.cfg, &self.db, rec, field, text).map(|_| 0)
            }
            _ => Ok(0),
        };
        match result {
            Ok(fanout) => {
                let label = match action {
                    RowAction::Release { field } => field.label(),
                    RowAction::Artist { field } => field.label(),
                };
                self.artist_log.push(format!("✓ saved {label} — DB + public JSON written"));
                if fanout > 0 {
                    self.artist_log.push(format!("✓ rewrote {fanout} embedding release JSON(s)"));
                }
                self.schedule_collection_regen();
                self.refresh_detail();
                Ok(())
            }
            Err(e) => Err(e.to_string()),
        }
    }

    /// Trigger a whole-record re-enrich for the active detail view (`a`).
    pub(crate) fn refresh_all_detail(&mut self) {
        match self.detail.as_ref() {
            Some(DetailView::Artist(rec)) => {
                let name = rec.name.clone();
                self.start_single_artist(name);
            }
            Some(DetailView::Release(rec)) => {
                let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
                self.start_single_release(id);
            }
            None => {}
        }
    }

    fn list_len(&self) -> usize {
        match self.screen {
            Screen::Releases => self.releases.len(),
            Screen::Artists => self.artists.len(),
            Screen::Boxsets => self.boxsets.len(),
            _ => 0,
        }
    }

    pub(crate) fn move_selection(&mut self, delta: isize) {
        let len = match self.screen {
            Screen::Home => MENU.len(),
            Screen::Releases | Screen::Artists | Screen::Boxsets => self.list_len(),
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
        self.detail_sel = 0;
        match self.screen {
            Screen::Releases | Screen::Boxsets => {
                let did = match self.screen {
                    Screen::Boxsets => self.list.selected().and_then(|i| self.boxsets.get(i)).map(|b| b.discogs_id.clone()),
                    _ => self.list.selected().and_then(|i| self.releases.get(i)).and_then(|s| s.discogs_id.clone()),
                };
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

    /// Re-read the record currently shown in the detail view (after an enrich/edit completes).
    fn refresh_detail(&mut self) {
        match &self.detail {
            Some(DetailView::Artist(rec)) => {
                if let Ok(Some(fresh)) = self.db.get_artist_by_id(&rec.id) {
                    self.detail = Some(DetailView::Artist(Box::new(fresh)));
                }
            }
            Some(DetailView::Release(rec)) => {
                let id = rec.discogs_id.clone().unwrap_or_else(|| rec.id.clone());
                if let Ok(Some(fresh)) = self.db.get_release_by_discogs_id(&id) {
                    self.detail = Some(DetailView::Release(Box::new(fresh)));
                }
            }
            None => {}
        }
        self.clamp_detail_sel();
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
                Msg::BoxsetLog(line) => push_capped(&mut self.boxset_log, line),
                Msg::BoxsetProgress(done, total) => self.boxset_progress = Some((done, total)),
                Msg::Done(what) => match what.as_str() {
                    "probes" => self.probing = false,
                    "collection" => {
                        self.running = false;
                        self.log.push("— run complete —".into());
                    }
                    "artist_run" => {
                        self.artist_running = false;
                        self.artist_log.push("— run complete —".into());
                        self.schedule_collection_regen();
                    }
                    // The discovery core regenerates collection.json itself when saving.
                    "boxset" => {
                        self.boxset_running = None;
                        self.boxset_log.push("— run complete —".into());
                        self.load_boxsets();
                        self.refresh_detail();
                    }
                    "regen" => {
                        self.regen_running = false;
                        if self.regen_dirty {
                            self.schedule_collection_regen();
                        }
                    }
                    _ => {
                        // artist_one | release_one | detail_refresh
                        self.detail_busy = false;
                        self.artist_log.push("— done —".into());
                        self.refresh_detail();
                        self.schedule_collection_regen();
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
