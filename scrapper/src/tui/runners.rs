//! Background tasks spawned by the runner screens. Each streams log lines + progress back over
//! the [`Msg`] channel and routes interactive match-picks through the shared `pick_tx`.

use tokio::sync::mpsc::UnboundedSender;

use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::artist::ArtistField;
use crate::ops::collection;
pub(crate) use crate::ops::collection::CollectionCandidate;
use crate::ops::release::{image_client, BoxsetDiscoveryOptions, MatchPicker, ProgressSink, ReleaseField};
use crate::services::Services;
use crate::{Config, Db};

use super::app::Msg;
use crate::ops::release::UiRequest;

/// Load the Collection screen's picker list (new releases in the Discogs collection).
pub(crate) async fn run_collection_candidates_task(cfg: Config, db: Db, tx: UnboundedSender<Msg>) {
    let result = collection::new_candidates(&cfg, &db).await.map_err(|e| e.to_string());
    let _ = tx.send(Msg::CollectionCandidates(result));
}

/// What a collection pass processes.
pub(crate) enum CollectionRun {
    /// The releases picked on the Collection screen.
    Picked(Vec<CollectionCandidate>),
    /// The first N of the collection, newest first, whether processed or not
    /// (`scrapper collection --interactive`).
    Newest(usize),
}

/// Background collection pass, force-refreshed, with interactive match-picking via the TUI
/// modal and step-by-step feedback.
pub(crate) async fn run_collection_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    run: CollectionRun,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::Log(s));
    };
    let progress = |done: usize, total: usize| {
        let _ = tx.send(Msg::Progress(done, total));
    };
    let sink = ProgressSink { log: &log, progress: &progress };
    let items = match run {
        CollectionRun::Picked(items) => Ok(items),
        CollectionRun::Newest(limit) => {
            log(format!("Fetching collection for {}…", cfg.discogs.username));
            collection::newest_candidates(&cfg, limit).await
        }
    };
    let result = match items {
        Ok(items) => collection::process_candidates(&cfg, &db, &items, &MatchPicker::Tui(pick_tx), &sink).await,
        Err(e) => Err(e),
    };
    if let Err(e) = result {
        log(format!("✗ {e}"));
    }
    let _ = tx.send(Msg::Done("collection".into()));
}

/// Background boxset discovery for one box (from the Boxsets screen): find the albums inside
/// it, match each interactively, and enrich + link them as members. `force_refresh` refetches
/// the box itself from Discogs first.
pub(crate) async fn run_boxset_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    box_id: String,
    force_refresh: bool,
) {
    // The core emits CLI-shaped text (blank-line separators, embedded newlines); split it into
    // pane lines and drop the blanks.
    let log = |s: String| {
        for line in s.lines().filter(|l| !l.trim().is_empty()) {
            let _ = tx.send(Msg::BoxsetLog(line.to_string()));
        }
    };
    let progress = |done: usize, total: usize| {
        let _ = tx.send(Msg::BoxsetProgress(done, total));
    };
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        log("Discogs not configured".into());
        let _ = tx.send(Msg::Done("boxset".into()));
        return;
    }
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);
    let sink = ProgressSink { log: &log, progress: &progress };
    let opts = BoxsetDiscoveryOptions { save: true, prefer: None, force_refresh };
    log(format!("▶ boxset {box_id} — discovering albums{}…", if force_refresh { " (refetching the box first)" } else { "" }));
    if let Err(e) = crate::ops::release::discover_boxset(&cfg, &services, &db, &client, &box_id, opts, &picker, &sink).await {
        log(format!("✗ boxset {box_id} — {e}"));
    }
    let _ = tx.send(Msg::Done("boxset".into()));
}

/// Background artist batch: enrich the first N un-enriched artists with interactive match-picking.
pub(crate) async fn run_artist_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    limit: usize,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let progress = |done: usize, total: usize| {
        let _ = tx.send(Msg::ArtistProgress(done, total));
    };
    let sink = ProgressSink { log: &log, progress: &progress };
    if let Err(e) = crate::ops::artist::enrich_unenriched(&cfg, &db, limit, &MatchPicker::Tui(pick_tx), &sink).await {
        log(format!("✗ {e}"));
    }
    let _ = tx.send(Msg::Done("artist_run".into()));
}

/// Enrich a single artist by name (from the detail view's `e` action).
pub(crate) async fn run_single_artist_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    name: String,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        log("Discogs not configured".into());
        let _ = tx.send(Msg::Done("artist_one".into()));
        return;
    }
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    log(format!("▶ {name} — enriching…"));
    match crate::ops::artist::process_artist(&cfg, &services, &db, &client, &name, true, false, false, None, None, &picker).await {
        Ok((_, found)) => {
            let m = |b: bool| if b { "✓" } else { "–" };
            log(format!(
                "apple {} · spotify {} · lastfm {} · wiki {} · saved ✓",
                m(found.apple), m(found.spotify), m(found.lastfm), m(found.wikipedia)
            ));
        }
        Err(e) => log(format!("✗ {name} — {e}")),
    }
    let _ = tx.send(Msg::ArtistProgress(1, 1));
    let _ = tx.send(Msg::Done("artist_one".into()));
}

/// Re-enrich a whole release record (from the release detail view's `a` action).
pub(crate) async fn run_single_release_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    discogs_id: String,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        log("Discogs not configured".into());
        let _ = tx.send(Msg::Done("release_one".into()));
        return;
    }
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    log(format!("▶ release {discogs_id} — re-enriching…"));
    match crate::ops::release::process_release(&cfg, &services, &db, &client, &discogs_id, true, None, &picker, None, None, false).await {
        Ok((rec, f)) => {
            let m = |b: bool| if b { "✓" } else { "–" };
            log(format!("  {} — {}", first_artist(&rec.artists), rec.title));
            log(format!(
                "    apple {} · spotify {} · lastfm {} · wiki {} · perplexity {} · artwork {} · saved ✓",
                svc_mark(f.apple, rec.release_name_apple_music.as_deref()),
                svc_mark(f.spotify, rec.release_name_spotify.as_deref()),
                m(f.lastfm), m(f.wikipedia), m(f.perplexity), m(f.image)
            ));
        }
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("release_one".into()));
}

/// Re-fetch a single artist field (from the artist detail editor's `r` action).
pub(crate) async fn run_refresh_artist_field_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    rec: ArtistRecord,
    field: ArtistField,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    log(format!("▶ {} — refreshing {}…", rec.name, field.label()));
    match crate::ops::artist::refresh_artist_field(&cfg, &services, &db, &client, &rec, field, &picker).await {
        Ok((rec, found)) => log(refresh_outcome(found, field.label(), &field.get(&rec))),
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("detail_refresh".into()));
}

/// Re-fetch a single release field (from the release detail editor's `r` action).
pub(crate) async fn run_refresh_release_field_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    rec: ReleaseRecord,
    field: ReleaseField,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    log(format!("▶ {} — refreshing {}…", rec.title, field.label()));
    match crate::ops::release::refresh_release_field(&cfg, &services, &db, &client, &rec, field, &picker).await {
        Ok((rec, found)) => log(refresh_outcome(found, field.label(), &field.get(&rec))),
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("detail_refresh".into()));
}

/// Rebuild collection.json off the UI thread (a full DB scan) after a mutating detail action.
pub(crate) async fn run_regen_collection_task(cfg: Config, db: Db, tx: UnboundedSender<Msg>) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let result = tokio::task::spawn_blocking(move || crate::output::collection::regenerate(&cfg, &db)).await;
    match result {
        Ok(Ok(n)) => log(format!("✓ collection.json refreshed ({n} entries)")),
        Ok(Err(e)) => log(format!("✗ collection.json refresh failed: {e}")),
        Err(e) => log(format!("✗ collection.json refresh panicked: {e}")),
    }
    let _ = tx.send(Msg::Done("regen".into()));
}

/// Apply a release service-identity edit (URL/ID → parse → fetch → persist) in the background.
pub(crate) async fn run_set_release_service_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    rec: ReleaseRecord,
    field: ReleaseField,
    input: String,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    let client = image_client();

    log(format!("▶ {} — setting {}…", rec.title, field.label()));
    match crate::ops::release::set_release_service(&cfg, &services, &db, &client, &rec, field, &input).await {
        Ok(rec) => log(refresh_outcome(true, field.label(), &field.get(&rec))),
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("detail_refresh".into()));
}

/// Apply an artist service-identity edit (URL/ID → parse → fetch → persist) in the background.
pub(crate) async fn run_set_artist_service_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    rec: ArtistRecord,
    field: ArtistField,
    input: String,
) {
    let log = |s: String| {
        let _ = tx.send(Msg::ArtistLog(s));
    };
    let services = Services::new(&cfg);
    let client = image_client();

    log(format!("▶ {} — setting {}…", rec.name, field.label()));
    match crate::ops::artist::set_artist_service(&cfg, &services, &db, &client, &rec, field, &input).await {
        Ok((rec, fanout)) => {
            log(refresh_outcome(true, field.label(), &field.get(&rec)));
            if fanout > 0 {
                log(format!("  ✓ rewrote {fanout} embedding release JSON(s)"));
            }
        }
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("detail_refresh".into()));
}

/// Log line for a field refresh, naming the resulting value when there is one to show.
fn refresh_outcome(found: bool, label: &str, value: &str) -> String {
    match (found, value.is_empty()) {
        (true, false) => format!("  ✓ {label} → {value}"),
        (true, true) => format!("  ✓ updated {label}"),
        (false, _) => format!("  – no data for {label}"),
    }
}

/// Service tick that names the matched item, so auto- and picked matches are visible in the log.
fn svc_mark(found: bool, name: Option<&str>) -> String {
    match (found, name) {
        (true, Some(n)) if !n.is_empty() => format!("✓ \"{n}\""),
        (true, _) => "✓".into(),
        (false, _) => "–".into(),
    }
}

fn first_artist(artists: &serde_json::Value) -> String {
    artists
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("?")
        .to_string()
}
