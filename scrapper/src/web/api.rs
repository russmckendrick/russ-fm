//! JSON API handlers. Reads come from the database and the published files in `public/`;
//! anything that calls a service or writes runs as a [`Jobs`](super::jobs::Jobs) job.

use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures::Stream;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::broadcast::error::RecvError;

use super::jobs::PromptAnswer;
use super::AppState;
use crate::output::collection;
use crate::services::{Probe, Services};

type Shared = State<Arc<AppState>>;

/// An error as `{"error": "..."}` with a status code.
pub struct ApiError(StatusCode, String);

impl ApiError {
    fn not_found(what: impl Into<String>) -> Self {
        Self(StatusCode::NOT_FOUND, what.into())
    }
    fn bad_request(what: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, what.into())
    }
    fn conflict(what: impl Into<String>) -> Self {
        Self(StatusCode::CONFLICT, what.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        if e.downcast_ref::<NotFound>().is_some() {
            return Self::not_found(e.to_string());
        }
        Self(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
    }
}

/// Raised inside a [`blocking`] body to answer 404.
#[derive(Debug)]
struct NotFound(String);

impl std::fmt::Display for NotFound {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for NotFound {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

type ApiResult = Result<Json<Value>, ApiError>;

/// Run sync work (SQLite, file reads) off the async workers.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> anyhow::Result<T> + Send + 'static) -> Result<T, ApiError> {
    tokio::task::spawn_blocking(f).await.map_err(|e| anyhow::anyhow!(e))?.map_err(ApiError::from)
}

/// Read a published JSON file under the data directory; `None` when it doesn't exist.
fn read_public_json(path: &std::path::Path) -> anyhow::Result<Option<Value>> {
    match std::fs::read(path) {
        Ok(b) => Ok(Some(serde_json::from_slice(&b)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn absolute(p: std::path::PathBuf) -> std::path::PathBuf {
    std::fs::canonicalize(&p).unwrap_or(p)
}

/// Slugs come from URLs: keep them to the characters a folder name can have.
fn check_slug(slug: &str) -> Result<(), ApiError> {
    let ok = !slug.is_empty() && !slug.contains(['/', '\\']) && slug != "." && slug != "..";
    if ok {
        Ok(())
    } else {
        Err(ApiError::bad_request("invalid slug"))
    }
}

pub async fn health() -> Json<Value> {
    Json(json!({ "app": "scrapper", "version": env!("CARGO_PKG_VERSION") }))
}

/// Dashboard numbers: database counts, library facets and the latest additions.
pub async fn overview(State(s): Shared) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        let stats = st.db.stats()?;
        let (artists_enriched, artists_total) = st.db.artist_enrichment_counts()?;
        let boxsets = st.db.list_boxsets()?;
        let lib = st.library.get()?;

        let mut recent: Vec<_> = lib.items.iter().collect();
        recent.sort_by(|a, b| b.date_added.cmp(&a.date_added));
        recent.truncate(18);

        let count_by = |key: &dyn Fn(&super::library::LibraryItem) -> Vec<String>| {
            let mut m = std::collections::HashMap::<String, usize>::new();
            for i in &lib.items {
                for k in key(i) {
                    *m.entry(k).or_default() += 1;
                }
            }
            let mut v: Vec<(String, usize)> = m.into_iter().collect();
            v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            v
        };
        let genres = count_by(&|i| i.genres.clone());
        let formats = count_by(&|i| i.format.clone().into_iter().collect());
        let mut decades = count_by(&|i| i.year.map(|y| format!("{}s", y / 10 * 10)).into_iter().collect());
        decades.sort();
        let coloured = lib.items.iter().filter(|i| !i.vinyl_colours.is_empty()).count();

        Ok(Json(json!({
            "stats": stats,
            "artists": { "enriched": artists_enriched, "total": artists_total },
            "boxsets": {
                "total": boxsets.len(),
                "processed": boxsets.iter().filter(|b| b.is_processed()).count(),
            },
            "library": {
                "releases": lib.items.len(),
                "artists": lib.artists.len(),
                "coloured_vinyl": coloured,
                "genres": genres,
                "formats": formats,
                "decades": decades,
            },
            "recent": recent,
            "paths": {
                "data_dir": absolute(st.cfg.data_dir()),
                "db": absolute(st.cfg.db_path()),
                "config_dir": absolute(st.cfg.base_dir.clone()),
            },
        })))
    })
    .await
}

pub async fn library(State(s): Shared) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        let lib = st.library.get()?;
        Ok(Json(json!({ "items": lib.items })))
    })
    .await
}

pub async fn artists(State(s): Shared) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        let lib = st.library.get()?;
        Ok(Json(json!({ "artists": lib.artists })))
    })
    .await
}

/// One release: the published album JSON, the database record and its library row.
pub async fn release(State(s): Shared, Path(slug): Path<String>) -> ApiResult {
    check_slug(&slug)?;
    let st = s.clone();
    blocking(move || {
        let public = read_public_json(&st.cfg.releases_dir().join(&slug).join(format!("{slug}.json")))?;
        let lib = st.library.get()?;
        let item = lib.item(&slug).cloned();
        let discogs_id = public
            .as_ref()
            .and_then(|p| p.get("discogs_id"))
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .or_else(|| item.as_ref().and_then(|i| i.discogs_id.clone()));
        let record = match &discogs_id {
            Some(id) => st.db.get_release_by_discogs_id(id)?,
            None => None,
        };
        if public.is_none() && record.is_none() {
            anyhow::bail!(NotFound(format!("no release {slug}")));
        }
        Ok(Json(json!({ "slug": slug, "public": public, "record": record, "item": item })))
    })
    .await
}

/// One artist: the published artist JSON, the database record and their releases.
pub async fn artist(State(s): Shared, Path(slug): Path<String>) -> ApiResult {
    check_slug(&slug)?;
    let st = s.clone();
    blocking(move || {
        let public = read_public_json(&st.cfg.artists_dir().join(&slug).join(format!("{slug}.json")))?;
        let lib = st.library.get()?;
        let releases = lib.releases_by(&slug);
        let summary = lib.artists.iter().find(|a| a.slug == slug).cloned();
        let record = match &public {
            Some(p) => match p.get("id").and_then(Value::as_str) {
                Some(id) => st.db.get_artist_by_id(id)?,
                None => None,
            }
            .or(match p.get("name").and_then(Value::as_str) {
                Some(name) => st.db.get_artist_by_name(name)?,
                None => None,
            }),
            None => match &summary {
                Some(a) => st.db.get_artist_by_name(&a.name)?,
                None => None,
            },
        };
        if public.is_none() && record.is_none() && releases.is_empty() {
            anyhow::bail!(NotFound(format!("no artist {slug}")));
        }
        Ok(Json(json!({ "slug": slug, "public": public, "record": record, "summary": summary, "releases": releases })))
    })
    .await
}

// ── Jobs ────────────────────────────────────────────────────────────────────────────────────

pub async fn jobs(State(s): Shared) -> Json<Value> {
    // seq first: the list is at least as new as it, so the client can drop events <= seq.
    let seq = s.jobs.seq();
    Json(json!({ "seq": seq, "jobs": s.jobs.list() }))
}

pub async fn job(State(s): Shared, Path(id): Path<u64>) -> ApiResult {
    let seq = s.jobs.seq();
    let job = s.jobs.snapshot(id).ok_or_else(|| ApiError::not_found("no such job"))?;
    Ok(Json(json!({ "seq": seq, "job": job })))
}

pub async fn cancel_job(State(s): Shared, Path(id): Path<u64>) -> ApiResult {
    if s.jobs.cancel(id) {
        Ok(Json(json!({ "ok": true })))
    } else {
        Err(ApiError::conflict("job isn't running"))
    }
}

#[derive(Deserialize)]
pub struct AnswerBody {
    prompt_id: u64,
    answer: PromptAnswer,
}

pub async fn answer_job(State(s): Shared, Path(id): Path<u64>, Json(body): Json<AnswerBody>) -> ApiResult {
    s.jobs.answer(id, body.prompt_id, body.answer).map_err(ApiError::conflict)?;
    Ok(Json(json!({ "ok": true })))
}

/// The live event feed. On `resync` (the client fell behind) the client reloads `/api/jobs`.
pub async fn events(State(s): Shared) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = s.jobs.subscribe();
    let stream = futures::stream::unfold(rx, |mut rx| async move {
        let event = match rx.recv().await {
            Ok(env) => SseEvent::default().json_data(&env).unwrap_or_else(|_| SseEvent::default().event("resync").data("")),
            Err(RecvError::Lagged(_)) => SseEvent::default().event("resync").data(""),
            Err(RecvError::Closed) => return None,
        };
        Some((Ok(event), rx))
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn started(result: Result<u64, u64>) -> ApiResult {
    match result {
        Ok(id) => Ok(Json(json!({ "job_id": id }))),
        Err(running) => Err(ApiError(StatusCode::CONFLICT, format!("already running as job {running}"))),
    }
}

/// `scrapper test` — probe every configured service.
pub async fn probe_services(State(s): Shared) -> ApiResult {
    let cfg = s.cfg.clone();
    started(s.jobs.spawn("probe", "Test services", |ctx| async move {
        ctx.log("Probing services…");
        let results = Services::new(&cfg).test_all().await;
        let mut rows = Vec::new();
        for (name, probe) in results {
            let (status, detail) = match probe {
                Probe::Ok(d) => ("ok", d),
                Probe::Failed(d) => ("failed", d),
                Probe::Skipped(d) => ("skipped", d),
            };
            let mark = match status {
                "ok" => "✓",
                "failed" => "✗",
                _ => "–",
            };
            ctx.log(format!("{mark} {name:<12} {detail}"));
            rows.push(json!({ "name": name, "status": status, "detail": detail }));
        }
        let healthy = rows.iter().filter(|r| r["status"] == "ok").count();
        let configured = rows.iter().filter(|r| r["status"] != "skipped").count();
        ctx.log(format!("{healthy}/{configured} configured services healthy"));
        Ok(Some(json!({ "services": rows })))
    }))
}

/// `scrapper generate-collection` — rebuild `collection.json` from the database.
pub async fn generate_collection(State(s): Shared) -> ApiResult {
    let (cfg, db) = (s.cfg.clone(), s.db.clone());
    started(s.jobs.spawn("generate-collection", "Generate collection.json", |ctx| async move {
        let output = cfg.data_dir().join("collection.json");
        ctx.log(format!("Generating {}…", output.display()));
        let out = output.clone();
        let count = tokio::task::spawn_blocking(move || collection::generate(&cfg, &db, &out)).await??;
        ctx.log(format!("Wrote {count} entries to {}", output.display()));
        Ok(Some(json!({ "entries": count })))
    }))
}
