//! Background tasks spawned by the runner screens. Each streams log lines + progress back over
//! the [`Msg`] channel and routes interactive match-picks through the shared `pick_tx`.

use tokio::sync::mpsc::UnboundedSender;

use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::artist::ArtistField;
use crate::ops::release::{image_client, BoxsetDiscoveryOptions, MatchPicker, ProgressSink, ReleaseField};
use crate::services::Services;
use crate::{Config, Db};

use super::app::Msg;
use crate::ops::release::UiRequest;

/// A release in the Discogs collection, distilled from the collection payload's
/// `basic_information` for the Collection screen's picker.
#[derive(Clone, Debug)]
pub(crate) struct CollectionCandidate {
    pub(crate) release_id: String,
    pub(crate) instance_id: Option<String>,
    pub(crate) date_added: Option<String>,
    pub(crate) artist: String,
    pub(crate) title: String,
    pub(crate) year: Option<i64>,
    pub(crate) format: String,
}

impl CollectionCandidate {
    fn from_entry(v: &serde_json::Value) -> Option<Self> {
        let release_id = v.get("id").map(|i| match i {
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        })?;
        let info = v.get("basic_information");
        let str_of = |key: &str| info.and_then(|b| b.get(key)).and_then(|t| t.as_str()).unwrap_or("").to_string();
        let artist = info
            .and_then(|b| b.get("artists"))
            .and_then(|a| a.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                    .map(strip_discogs_suffix)
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        // "Vinyl, LP, Album" — the first format's name plus its descriptions.
        let format = info
            .and_then(|b| b.get("formats"))
            .and_then(|f| f.as_array())
            .and_then(|f| f.first())
            .map(|f| {
                let mut parts: Vec<&str> = f.get("name").and_then(|n| n.as_str()).into_iter().collect();
                if let Some(d) = f.get("descriptions").and_then(|d| d.as_array()) {
                    parts.extend(d.iter().filter_map(|x| x.as_str()));
                }
                parts.join(", ")
            })
            .unwrap_or_default();
        Some(Self {
            release_id,
            instance_id: v.get("instance_id").map(|i| i.to_string()),
            date_added: v.get("date_added").and_then(|d| d.as_str()).map(String::from),
            artist,
            title: str_of("title"),
            year: info.and_then(|b| b.get("year")).and_then(|y| y.as_i64()).filter(|y| *y > 0),
            format,
        })
    }
}

/// Drop Discogs's artist disambiguation suffix: "Placebo (2)" → "Placebo".
fn strip_discogs_suffix(name: &str) -> &str {
    match name.rsplit_once(" (") {
        Some((base, n)) if n.strip_suffix(')').is_some_and(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit())) => base,
        _ => name,
    }
}

/// How many of the newest collection pages (100 releases each) the picker scans.
const CANDIDATE_PAGES: u32 = 3;
/// The most new releases the picker lists.
const CANDIDATE_LIMIT: usize = 50;

/// Load the newest releases in the Discogs collection that aren't enriched in the DB yet, for
/// the Collection screen's picker. Pages newest-first and stops at the first page with nothing
/// new on it (everything older is already processed), after [`CANDIDATE_PAGES`] pages, or once
/// [`CANDIDATE_LIMIT`] are found.
pub(crate) async fn run_collection_candidates_task(cfg: Config, db: Db, tx: UnboundedSender<Msg>) {
    let result = load_collection_candidates(&cfg, &db).await.map_err(|e| e.to_string());
    let _ = tx.send(Msg::CollectionCandidates(result));
}

async fn load_collection_candidates(cfg: &Config, db: &Db) -> anyhow::Result<Vec<CollectionCandidate>> {
    let services = Services::new(cfg);
    if !services.discogs.is_configured() {
        anyhow::bail!("Discogs not configured — set discogs.access_token in config.json");
    }
    let username = cfg.discogs.username.clone();
    if username.is_empty() {
        anyhow::bail!("no Discogs username — set discogs.username in config.json");
    }
    let have = db.enriched_release_ids()?;
    let mut out = Vec::new();
    for page in 1..=CANDIDATE_PAGES {
        let (entries, pages) = services.discogs.get_user_collection_page(&username, page).await?;
        let before = out.len();
        out.extend(
            entries
                .iter()
                .filter_map(CollectionCandidate::from_entry)
                .filter(|c| !have.contains(&c.release_id) && !out.iter().any(|o: &CollectionCandidate| o.release_id == c.release_id))
                .collect::<Vec<_>>(),
        );
        if out.len() == before || out.len() >= CANDIDATE_LIMIT || page >= pages {
            break;
        }
    }
    out.truncate(CANDIDATE_LIMIT);
    Ok(out)
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
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        log("Discogs not configured".into());
        let _ = tx.send(Msg::Done("collection".into()));
        return;
    }

    let items: Vec<CollectionCandidate> = match run {
        CollectionRun::Picked(items) => items,
        CollectionRun::Newest(limit) => {
            let username = cfg.discogs.username.clone();
            log(format!("Fetching collection for {username}…"));
            match services.discogs.get_user_collection(&username).await {
                Ok(entries) => entries.iter().filter_map(CollectionCandidate::from_entry).take(limit).collect(),
                Err(e) => {
                    log(format!("collection fetch failed: {e}"));
                    let _ = tx.send(Msg::Done("collection".into()));
                    return;
                }
            }
        }
    };
    let total = items.len();
    log(format!("Processing {total} release(s) (interactive)"));

    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    for (i, item) in items.iter().enumerate() {
        let (id, date_added, instance) = (&item.release_id, &item.date_added, &item.instance_id);
        log(format!("▶ [{}/{total}] release {id} — fetching from Discogs…", i + 1));
        match crate::ops::release::process_release(&cfg, &services, &db, &client, id, true, None, &picker, date_added.as_deref(), None, false).await {
            Ok((rec, f)) => {
                let _ = db.record_processed(&rec.id, id, instance.as_deref(), date_added.as_deref());
                let m = |b: bool| if b { "✓" } else { "–" };
                log(format!("  {} — {}", first_artist(&rec.artists), rec.title));
                log(format!(
                    "    apple {} · spotify {} · lastfm {} · wiki {} · perplexity {} · artwork {} · saved ✓",
                    svc_mark(f.apple, rec.release_name_apple_music.as_deref()),
                    svc_mark(f.spotify, rec.release_name_spotify.as_deref()),
                    m(f.lastfm), m(f.wikipedia), m(f.perplexity), m(f.image)
                ));
            }
            Err(e) => log(format!("  ✗ {id} — {e}")),
        }
        let _ = tx.send(Msg::Progress(i + 1, total));
    }

    // Refresh the frontend index so the new releases show up.
    let out = cfg.data_dir().join("collection.json");
    log(format!("Updating {}…", out.display()));
    match crate::output::collection::generate(&cfg, &db, &out) {
        Ok(n) => log(format!("✓ wrote {n} entries to collection.json")),
        Err(e) => log(format!("✗ collection.json update failed: {e}")),
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
    let services = Services::new(&cfg);
    if !services.discogs.is_configured() {
        log("Discogs not configured".into());
        let _ = tx.send(Msg::Done("artist_run".into()));
        return;
    }

    match db.seed_missing_artists_from_releases() {
        Ok(seeded) if seeded > 0 => log(format!("Seeded {seeded} missing artist(s) from saved releases.")),
        Ok(_) => {}
        Err(e) => log(format!("failed to seed missing artists: {e}")),
    }

    let artists = match db.list_unenriched_artists(limit as u32) {
        Ok(a) => a,
        Err(e) => {
            log(format!("failed to list un-enriched artists: {e}"));
            let _ = tx.send(Msg::Done("artist_run".into()));
            return;
        }
    };
    if artists.is_empty() {
        log("No un-enriched artists found 🎉".into());
        let _ = tx.send(Msg::Done("artist_run".into()));
        return;
    }

    let total = artists.len();
    log(format!("Enriching {total} artist(s) (interactive)"));
    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    for (i, a) in artists.iter().enumerate() {
        log(format!("▶ [{}/{total}] {} — enriching…", i + 1, a.name));
        match crate::ops::artist::process_artist(&cfg, &services, &db, &client, &a.name, true, false, false, None, None, &picker).await {
            Ok((_, found)) => {
                let m = |b: bool| if b { "✓" } else { "–" };
                log(format!(
                    "    apple {} · spotify {} · lastfm {} · wiki {} · saved ✓",
                    m(found.apple), m(found.spotify), m(found.lastfm), m(found.wikipedia)
                ));
            }
            Err(e) => log(format!("  ✗ {} — {e}", a.name)),
        }
        let _ = tx.send(Msg::ArtistProgress(i + 1, total));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_from_collection_entry() {
        let v = serde_json::json!({
            "id": 15464999,
            "instance_id": 123,
            "date_added": "2026-10-20T09:15:00-07:00",
            "basic_information": {
                "title": "So Tonight That I Might See",
                "year": 1993,
                "artists": [{ "name": "Mazzy Star" }, { "name": "Placebo (2)" }],
                "formats": [{ "name": "Vinyl", "descriptions": ["LP", "Album"] }]
            }
        });
        let c = CollectionCandidate::from_entry(&v).unwrap();
        assert_eq!(c.release_id, "15464999");
        assert_eq!(c.instance_id.as_deref(), Some("123"));
        assert_eq!(c.artist, "Mazzy Star, Placebo");
        assert_eq!(c.title, "So Tonight That I Might See");
        assert_eq!(c.year, Some(1993));
        assert_eq!(c.format, "Vinyl, LP, Album");
    }

    #[test]
    fn strips_only_numeric_disambiguation() {
        assert_eq!(strip_discogs_suffix("Placebo (2)"), "Placebo");
        assert_eq!(strip_discogs_suffix("Sunn O)))"), "Sunn O)))");
        assert_eq!(strip_discogs_suffix("Jesus Jones (UK)"), "Jesus Jones (UK)");
    }
}
