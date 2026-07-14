//! Background tasks spawned by the runner screens. Each streams log lines + progress back over
//! the [`Msg`] channel and routes interactive match-picks through the shared `pick_tx`.

use tokio::sync::mpsc::UnboundedSender;

use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::artist::ArtistField;
use crate::ops::release::{image_client, MatchPicker, ReleaseField};
use crate::services::Services;
use crate::{Config, Db};

use super::app::Msg;
use crate::ops::release::UiRequest;

/// Background collection pass: process the first N of the collection (newest first), force-
/// refreshed, with interactive match-picking via the TUI modal and step-by-step feedback.
pub(crate) async fn run_collection_task(
    cfg: Config,
    db: Db,
    tx: UnboundedSender<Msg>,
    pick_tx: UnboundedSender<UiRequest>,
    limit: usize,
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

    let username = cfg.discogs.username.clone();
    log(format!("Fetching collection for {username}…"));
    let entries = match services.discogs.get_user_collection(&username).await {
        Ok(e) => e,
        Err(e) => {
            log(format!("collection fetch failed: {e}"));
            let _ = tx.send(Msg::Done("collection".into()));
            return;
        }
    };
    // Keep each release's collection date_added and instance so newly-added releases sort right.
    let mut items: Vec<(String, Option<String>, Option<String>)> = entries
        .iter()
        .filter_map(|v| {
            let id = v.get("id").map(|i| match i {
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })?;
            let date_added = v.get("date_added").and_then(|d| d.as_str()).map(String::from);
            let instance = v.get("instance_id").map(|i| i.to_string());
            Some((id, date_added, instance))
        })
        .collect();
    items.truncate(limit);
    let total = items.len();
    log(format!("Processing {total} release(s) (newest first, interactive)"));

    let client = image_client();
    let picker = MatchPicker::Tui(pick_tx);

    for (i, (id, date_added, instance)) in items.iter().enumerate() {
        log(format!("▶ [{}/{total}] release {id} — fetching from Discogs…", i + 1));
        match crate::ops::release::process_release(&cfg, &services, &db, &client, id, true, None, &picker, date_added.as_deref()).await {
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
    match crate::ops::release::process_release(&cfg, &services, &db, &client, &discogs_id, true, None, &picker, None).await {
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
        Ok((_, found)) => log(format!("  {} {}", if found { "✓ updated" } else { "– no data" }, field.label())),
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
        Ok((_, found)) => log(format!("  {} {}", if found { "✓ updated" } else { "– no data" }, field.label())),
        Err(e) => log(format!("  ✗ {e}")),
    }
    let _ = tx.send(Msg::Done("detail_refresh".into()));
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
