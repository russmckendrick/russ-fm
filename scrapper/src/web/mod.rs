//! The web UI — the bare-invocation experience. An axum server on localhost that serves the
//! React app (built from `web/` and embedded in the binary), a JSON API over the same ops the
//! CLI and TUI use, the artwork in `public/`, and one SSE feed for live job progress.
//!
//! Module map:
//! - [`api`] — JSON handlers (reads + job-starting actions).
//! - [`jobs`] — background job registry: logs, progress, interactive prompts, SSE events.
//! - [`library`] — slim index of `collection.json` for the library and artist grids.
//! - [`media`] — `/media/*` files, deriving `-medium`/`-avatar` from `-hi-res` when missing.

mod api;
pub mod jobs;
pub mod library;
pub mod media;

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use rust_embed::RustEmbed;
use tower_http::compression::CompressionLayer;

use crate::{Config, Db};
use jobs::Jobs;
use library::LibraryCache;
use media::Media;

/// Default port for `scrapper` (the next free one is used when it's taken).
pub const DEFAULT_PORT: u16 = 7878;
/// How many ports above the requested one to try.
const PORT_TRIES: u16 = 20;

/// Shared state for every handler.
pub struct AppState {
    pub cfg: Config,
    pub db: Db,
    pub jobs: Jobs,
    pub library: LibraryCache,
    pub media: Media,
}

/// The built web app (`web/dist`). In debug builds rust-embed reads the folder from disk at
/// request time, so `pnpm --dir web build` shows up without recompiling.
#[derive(RustEmbed)]
#[folder = "web/dist/"]
#[allow_missing = true]
struct Assets;

/// Start the server and (optionally) open it in the browser; runs until Ctrl-C.
pub async fn serve(cfg: Config, port: u16, open: bool) -> Result<()> {
    // Already running on the requested port? Just open that one.
    if already_running(port).await {
        let url = format!("http://127.0.0.1:{port}/");
        println!("scrapper is already running → {url}");
        if open {
            open_browser(&url);
        }
        return Ok(());
    }

    let db = Db::open(cfg.db_path())?;
    let state = Arc::new(AppState {
        library: LibraryCache::new(cfg.data_dir()),
        media: Media::new(cfg.data_dir(), cfg.base_dir.join(".cache").join("web-media")),
        jobs: Jobs::new(),
        db,
        cfg,
    });

    let listener = bind(port).await?;
    let addr = listener.local_addr()?;
    let url = format!("http://{addr}/");
    println!("scrapper web UI → {url}");
    println!("  terminal UI: scrapper --tui · stop: Ctrl-C");
    if Assets::get("index.html").is_none() {
        println!("  note: the web app isn't built — run `pnpm --dir web install && pnpm --dir web build` in scrapper/");
    }
    if open {
        open_browser(&url);
    }

    axum::serve(listener, router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .context("web server failed")
}

pub fn router(state: Arc<AppState>) -> Router {
    let api = Router::new()
        .route("/health", get(api::health))
        .route("/overview", get(api::overview))
        .route("/library", get(api::library))
        .route("/artists", get(api::artists))
        .route("/releases/{slug}", get(api::release))
        .route("/artists/{slug}", get(api::artist))
        .route("/jobs", get(api::jobs))
        .route("/jobs/{id}", get(api::job))
        .route("/jobs/{id}/cancel", post(api::cancel_job))
        .route("/jobs/{id}/answer", post(api::answer_job))
        .route("/events", get(api::events))
        .route("/actions/probe-services", post(api::probe_services))
        .route("/actions/generate-collection", post(api::generate_collection))
        .fallback(|| async { (StatusCode::NOT_FOUND, axum::Json(serde_json::json!({ "error": "no such endpoint" }))) });

    Router::new()
        .nest("/api", api)
        .route("/media/{*path}", get(media_file))
        .fallback(app_asset)
        .layer(CompressionLayer::new())
        .with_state(state)
}

/// Bind 127.0.0.1 on `port`, or the next free port above it.
async fn bind(port: u16) -> Result<tokio::net::TcpListener> {
    let mut last_err = None;
    for p in port..port.saturating_add(PORT_TRIES) {
        match tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, p))).await {
            Ok(l) => return Ok(l),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.map(anyhow::Error::from).unwrap_or_else(|| anyhow::anyhow!("no port to bind")))
        .with_context(|| format!("no free port in {port}..{}", port.saturating_add(PORT_TRIES)))
}

/// True when a scrapper web UI already answers on `port`.
async fn already_running(port: u16) -> bool {
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_millis(400)).build() else {
        return false;
    };
    let url = format!("http://127.0.0.1:{port}/api/health");
    match client.get(url).send().await {
        Ok(r) => r.json::<serde_json::Value>().await.is_ok_and(|v| v["app"] == "scrapper"),
        Err(_) => false,
    }
}

fn open_browser(url: &str) {
    let mut cmd = if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    } else {
        std::process::Command::new("xdg-open")
    };
    if let Err(e) = cmd.arg(url).spawn() {
        eprintln!("couldn't open a browser ({e}); visit {url}");
    }
}

/// `/media/*` — a file from the data directory, deriving resized artwork when needed.
async fn media_file(State(s): State<Arc<AppState>>, Path(path): Path<String>) -> Response {
    let Some(rel) = media::safe_rel(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let file = match s.media.resolve(&rel).await {
        Ok(Some(f)) => f,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}")).into_response(),
    };
    match tokio::fs::read(&file).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&file).first_or_octet_stream();
            // JSON changes when you save a record; artwork rarely does.
            let cache = if rel.ends_with(".json") { "no-cache" } else { "max-age=300" };
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// The SPA: a built asset when the path names one, else `index.html` (client-side routes).
async fn app_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if let Some(file) = (!path.is_empty()).then(|| Assets::get(path)).flatten() {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        // Vite fingerprints everything under assets/.
        let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
        return Response::builder()
            .header(header::CONTENT_TYPE, mime.as_ref())
            .header(header::CACHE_CONTROL, cache)
            .body(Body::from(file.data.into_owned()))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    // A missing file with an extension is a real 404, not a client route.
    if path.rsplit('/').next().is_some_and(|last| last.contains('.')) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match Assets::get("index.html") {
        Some(index) => {
            let mut r = Response::new(Body::from(index.data.into_owned()));
            r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));
            r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            r
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            "<!doctype html><title>scrapper</title><body style=\"font:16px system-ui;padding:3rem\">\
             <h1>The web app isn't built yet</h1><p>In <code>scrapper/</code> run \
             <code>pnpm --dir web install &amp;&amp; pnpm --dir web build</code>, then reload. \
             The API is up at <a href=\"/api/overview\">/api/overview</a>.</p>",
        )
            .into_response(),
    }
}
