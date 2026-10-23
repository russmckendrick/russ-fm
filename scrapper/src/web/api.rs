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
use crate::ops::release::ProgressSink;
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

// ── Any CLI command ─────────────────────────────────────────────────────────────────────────

/// The CLI's command tree, for the Tools page's generated forms.
pub async fn commands() -> Json<Value> {
    Json(json!({ "commands": super::commands::catalog() }))
}

#[derive(Deserialize)]
pub struct RunBody {
    args: Vec<String>,
}

/// Run `scrapper <args>` as a job: output becomes the job log, `--interactive` questions become
/// browser prompts. Jobs of the same command don't overlap.
pub async fn run_command(State(s): Shared, Json(body): Json<RunBody>) -> ApiResult {
    let cli = super::commands::parse(&body.args).map_err(ApiError::bad_request)?;
    let kind = body.args.first().cloned().unwrap_or_default();
    let cfg = s.cfg.clone();
    started(s.jobs.spawn(&kind, super::commands::display(&body.args), |ctx| async move {
        crate::ops::out::capture(ctx.console(), crate::cli::run(cli, cfg)).await?;
        Ok(None)
    }))
}

// ── Collection: pick new releases, enrich artists ───────────────────────────────────────────

/// Releases in the Discogs collection that aren't enriched yet (newest first, up to 50).
pub async fn new_in_collection(State(s): Shared) -> ApiResult {
    let items = crate::ops::collection::new_candidates(&s.cfg, &s.db).await?;
    Ok(Json(json!({ "items": items })))
}

#[derive(Deserialize)]
pub struct ProcessBody {
    /// Picked from `/api/collection/new`.
    #[serde(default)]
    items: Vec<crate::ops::collection::CollectionCandidate>,
    /// Or: the newest N in the collection, processed or not.
    newest: Option<usize>,
}

/// Force-refresh and save releases with interactive match-picking (the TUI Collection screen).
pub async fn process_releases(State(s): Shared, Json(body): Json<ProcessBody>) -> ApiResult {
    if body.items.is_empty() && body.newest.is_none() {
        return Err(ApiError::bad_request("pick some releases, or give `newest`"));
    }
    let title = match body.newest {
        Some(n) => format!("Process the {n} newest release(s)"),
        None if body.items.len() == 1 => format!("Process {} — {}", body.items[0].artist, body.items[0].title),
        None => format!("Process {} release(s)", body.items.len()),
    };
    let (cfg, db) = (s.cfg.clone(), s.db.clone());
    started(s.jobs.spawn("collection", title, |ctx| async move {
        let items = match body.newest {
            Some(n) => {
                ctx.log(format!("Fetching collection for {}…", cfg.discogs.username));
                crate::ops::collection::newest_candidates(&cfg, n.max(1)).await?
            }
            None => body.items,
        };
        let (log, progress) = ctx.sink_fns();
        let sink = ProgressSink { log: &log, progress: &progress };
        crate::ops::collection::process_candidates(&cfg, &db, &items, &ctx.picker(), &sink).await?;
        Ok(None)
    }))
}

#[derive(Deserialize)]
pub struct EnrichArtistsBody {
    limit: usize,
}

/// Enrich the first N un-enriched artists with interactive match-picking.
pub async fn enrich_artists(State(s): Shared, Json(body): Json<EnrichArtistsBody>) -> ApiResult {
    let (cfg, db) = (s.cfg.clone(), s.db.clone());
    let limit = body.limit.clamp(1, 500);
    started(s.jobs.spawn("enrich-artists", format!("Enrich {limit} artist(s)"), |ctx| async move {
        let (log, progress) = ctx.sink_fns();
        let sink = ProgressSink { log: &log, progress: &progress };
        crate::ops::artist::enrich_unenriched(&cfg, &db, limit, &ctx.picker(), &sink).await?;
        Ok(None)
    }))
}

// ── Boxsets ─────────────────────────────────────────────────────────────────────────────────

/// Box-format releases with their discovery state, plus each one's album folder for artwork.
pub async fn boxsets(State(s): Shared) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        let lib = st.library.get()?;
        let slugs: std::collections::HashMap<&str, &str> =
            lib.items.iter().filter_map(|i| Some((i.discogs_id.as_deref()?, i.slug.as_str()))).collect();
        let rows: Vec<Value> = st
            .db
            .list_boxsets()?
            .into_iter()
            .map(|b| {
                let slug = slugs.get(b.discogs_id.as_str()).map(|s| s.to_string());
                let mut v = serde_json::to_value(&b).unwrap_or_default();
                v["processed"] = json!(b.is_processed());
                v["slug"] = json!(slug);
                v
            })
            .collect();
        Ok(Json(json!({ "boxsets": rows })))
    })
    .await
}

#[derive(Deserialize)]
pub struct SingleBody {
    single: bool,
}

/// Flag a box as a single album in a box edition (no discovery), or undo that.
pub async fn set_boxset_single(State(s): Shared, Path(id): Path<String>, Json(body): Json<SingleBody>) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        if !st.db.set_boxset_single_release(&id, body.single)? {
            anyhow::bail!(NotFound(format!("no release {id}")));
        }
        Ok(Json(json!({ "ok": true })))
    })
    .await
}

// ── Database ────────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DbQuery {
    kind: String,
    q: Option<String>,
    sort: Option<String>,
    limit: Option<u32>,
}

/// Search or list database rows (`db search` / `db list`), linked to their library folders.
pub async fn db_rows(State(s): Shared, axum::extract::Query(p): axum::extract::Query<DbQuery>) -> ApiResult {
    let st = s.clone();
    blocking(move || {
        let limit = p.limit.unwrap_or(50).clamp(1, 500);
        let q = p.q.unwrap_or_default();
        let sort = p.sort.unwrap_or_else(|| "date_added".into());
        let lib = st.library.get()?;
        match p.kind.as_str() {
            "release" | "releases" => {
                let rows = if q.trim().is_empty() { st.db.list_releases(limit, &sort)? } else { st.db.search_releases(&q, limit)? };
                let slugs: std::collections::HashMap<&str, &str> =
                    lib.items.iter().filter_map(|i| Some((i.discogs_id.as_deref()?, i.slug.as_str()))).collect();
                let rows: Vec<Value> = rows
                    .into_iter()
                    .map(|r| {
                        let slug = r.discogs_id.as_deref().and_then(|id| slugs.get(id)).map(|s| s.to_string());
                        let mut v = serde_json::to_value(&r).unwrap_or_default();
                        v["slug"] = json!(slug);
                        v
                    })
                    .collect();
                Ok(Json(json!({ "rows": rows })))
            }
            "artist" | "artists" => {
                let sort = if sort == "date_added" { "name".to_string() } else { sort };
                let rows = if q.trim().is_empty() { st.db.list_artists(limit, &sort)? } else { st.db.search_artists(&q, limit)? };
                let slugs: std::collections::HashMap<String, &str> =
                    lib.artists.iter().map(|a| (a.name.to_lowercase(), a.slug.as_str())).collect();
                let rows: Vec<Value> = rows
                    .into_iter()
                    .map(|a| {
                        let slug = slugs.get(&a.name.to_lowercase()).map(|s| s.to_string());
                        let mut v = serde_json::to_value(&a).unwrap_or_default();
                        v["slug"] = json!(slug);
                        v
                    })
                    .collect();
                Ok(Json(json!({ "rows": rows })))
            }
            other => Err(anyhow::anyhow!("unknown kind {other:?} (release or artist)")),
        }
    })
    .await
}

/// Database backups in `<scrapper>/backups`, newest first.
pub async fn backups(State(s): Shared) -> ApiResult {
    let dir = s.cfg.base_dir.join("backups");
    blocking(move || {
        let mut rows = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let Ok(meta) = e.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let modified = meta.modified().ok().map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339());
                rows.push(json!({ "name": e.file_name().to_string_lossy(), "bytes": meta.len(), "modified": modified }));
            }
        }
        rows.sort_by(|a, b| b["modified"].as_str().cmp(&a["modified"].as_str()));
        Ok(Json(json!({ "dir": absolute(dir), "backups": rows })))
    })
    .await
}

// ── Site asset scripts (run from the repo root) ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SiteScriptBody {
    /// `generate-colors` or `generate-artist-images`.
    script: String,
    /// One album (colours) or artist (images) folder to redo.
    only: Option<String>,
    /// Redo everything (`--force` / `--full`).
    #[serde(default)]
    all: bool,
}

/// `pnpm run generate-colors` / `generate-artist-images` in the repo root, as a job. The site's
/// own asset scripts: they read what the scrapper wrote into public/ and write beside it.
pub async fn site_script(State(s): Shared, Json(body): Json<SiteScriptBody>) -> ApiResult {
    let redo_all = match body.script.as_str() {
        "generate-colors" => "--force",
        "generate-artist-images" => "--full",
        other => return Err(ApiError::bad_request(format!("unknown script {other:?}"))),
    };
    let mut args = vec!["run".to_string(), body.script.clone()];
    let mut title = format!("pnpm {}", body.script);
    if let Some(slug) = body.only.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        check_slug(slug)?;
        if slug.starts_with('-') {
            return Err(ApiError::bad_request("invalid slug"));
        }
        args.extend(["--only".to_string(), slug.to_string()]);
        title = format!("{title} --only {slug}");
    } else if body.all {
        args.push(redo_all.to_string());
        title = format!("{title} {redo_all}");
    }
    // The repo root is the data directory's parent (public/ → repo).
    let data_dir = absolute(s.cfg.data_dir());
    let root = data_dir.parent().map(std::path::Path::to_path_buf).unwrap_or(data_dir);
    started(s.jobs.spawn(&body.script, title, |ctx| async move { run_process(&ctx, "pnpm", &args, &root).await }))
}

/// Run a program, streaming its stdout and stderr into the job log; fails on a non-zero exit.
async fn run_process(ctx: &super::jobs::JobCtx, program: &str, args: &[String], dir: &std::path::Path) -> anyhow::Result<Option<Value>> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    ctx.log(format!("$ {program} {}", args.join(" ")));
    let mut child = tokio::process::Command::new(program)
        .args(args)
        .current_dir(dir)
        .env("FORCE_COLOR", "0")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| anyhow::anyhow!("couldn't start {program}: {e}"))?;
    let pump = |stream: Option<Box<dyn tokio::io::AsyncRead + Unpin + Send>>, ctx: super::jobs::JobCtx| async move {
        if let Some(s) = stream {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    ctx.log(line);
                }
            }
        }
    };
    let out = pump(child.stdout.take().map(|s| Box::new(s) as _), ctx.clone());
    let err = pump(child.stderr.take().map(|s| Box::new(s) as _), ctx.clone());
    let (status, _, _) = tokio::join!(child.wait(), out, err);
    let status = status?;
    if !status.success() {
        anyhow::bail!("{program} exited with {status}");
    }
    Ok(None)
}
