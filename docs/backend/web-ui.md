# Web UI

Running `scrapper` with no subcommand starts a local web interface and opens it in your browser.
It is a front end over the same ops the CLI and TUI use, built around the collection itself:
browse by artwork, drill into any release or artist, and run jobs with live progress.

```bash
scrapper                 # web UI on http://127.0.0.1:7878 (opens the browser)
scrapper --port 8080     # another port (the next free one is used if it's taken)
scrapper --no-open       # don't open a browser
scrapper --tui           # the terminal UI instead
```

Running `scrapper` again while it's already up just opens the existing instance. The server
binds `127.0.0.1` only and has no auth, because it holds your API keys and writes to the repo.
Stop it with `Ctrl-C`.

## Status

Phase 1 is in place: launching, the jobs system and read-only browsing.

| Area | State |
|------|-------|
| Dashboard: counts, recently added, genre / decade / format breakdowns | ✅ |
| Library: cover grid and list, search, genre / format / decade / coloured-vinyl filters, sorting (all in the URL) | ✅ |
| Release and artist pages: artwork, metadata, links, tracklist, videos, description, raw DB record + published JSON | ✅ |
| ⌘K palette: releases, artists, pages, actions | ✅ |
| Jobs: live log + progress over SSE, stop, interactive prompts (match picker, Perplexity description) | ✅ |
| Services probe (`scrapper test`), `generate-collection` | ✅ |
| Collection / release / artist / boxset runs, backfills, `db` and `maintenance` tools | Phase 2 |
| Editing records, diff before save, data-health views | Phase 3 |

## Architecture

```
scrapper/
├── src/web/
│   ├── mod.rs       # axum server: bind, routes, /media, embedded SPA, browser launch
│   ├── api.rs       # JSON handlers (reads + job-starting actions)
│   ├── jobs.rs      # job registry, SSE events, interactive prompts
│   ├── library.rs   # slim index of collection.json (+ album-colors.json)
│   └── media.rs     # artwork from public/, derived medium/avatar sizes
└── web/             # Vite + React 19 + TypeScript + Tailwind v4 app
    ├── src/lib/     # api client, live job store, queries, media URL helpers
    ├── src/components/
    └── src/pages/
```

The React app is built into `web/dist` and embedded in the binary with `rust-embed`, so the
installed `scrapper` is still a single file. `install.sh` runs `pnpm --dir web build` before
`cargo install`. In debug builds rust-embed reads `web/dist` from disk at request time, so a
rebuilt frontend shows up without recompiling Rust. If the app hasn't been built, the browser
shows a page explaining how to build it.

### Data sources

- **Library and artists grids** come from `public/collection.json`, cut down to the fields the
  grid needs (`GET /api/library`, about 300 KB gzipped for ~3,700 releases). Each item's
  placeholder colour comes from `public/album-colors.json`. The index is cached and rebuilt
  whenever either file's mtime changes, so regenerating `collection.json` updates the UI.
- **Release and artist pages** combine the published JSON
  (`public/album/<slug>/<slug>.json`) with the database record (looked up by Discogs ID for
  releases, and by ID then name for artists).
- **Dashboard counts** come from the database (`Db::stats`, artist enrichment counts, boxsets)
  plus facets computed from the library index.

### Artwork

`/media/<path>` serves files from the data directory (`public/`). Only `album/…`, `artist/…`
and root-level files are allowed, and `..` is rejected. The scrapper writes only `-hi-res.jpg`;
the site's build makes the `-medium` (800px) and `-avatar` (128px square) sizes. When one of
those is missing, the server derives it from the hi-res file and caches it under
`scrapper/.cache/web-media/` (gitignored). It never writes into `public/`. The cache entry is
rebuilt when the hi-res file is newer. The frontend builds these URLs with
`web/src/lib/media.ts`, which follows the same naming as the site's `src/lib/image-utils.ts`.

### Jobs and live updates

Anything that calls a service or writes runs as a **job** (`web::jobs::Jobs`). Each job is a
tokio task with an ID, a kind, a log (capped at 5,000 lines), progress, a result and a status
(`running` / `done` / `failed` / `cancelled`). Jobs of the same kind never overlap: starting one
while another runs returns `409`. The registry keeps the last 50 jobs.

One SSE feed, `GET /api/events`, carries every job event (`job_started`, `log`, `progress`,
`prompt`, `prompt_cleared`, `job_finished`). Each event has a global, increasing `seq`, and
`GET /api/jobs` returns the current `seq` with its snapshot, so the client drops anything it
has already seen. If a client falls behind, it gets a `resync` event and reloads the snapshot.
When a job finishes, the frontend invalidates the queries it affects (for example
`generate-collection` refreshes the library and dashboard).

**Interactive prompts** reuse the TUI's plumbing. `JobCtx::picker()` returns a
`MatchPicker::Tui` channel, and every `UiRequest` the op sends (`Pick` or `Describe`) becomes a
`prompt` event. The browser answers with
`POST /api/jobs/{id}/answer {prompt_id, answer}`, where `answer` is
`{type: "pick", index}`, `{type: "generate", context}`, `{type: "accept"}` or `{type: "skip"}`.
The prompt shows as a floating panel on every page, and inline on that job's own page.
Long-running ops report through `JobCtx::with_sink`, which hands them a `ProgressSink` wired
to the job.

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | `{app: "scrapper", version}` (used to detect a running instance) |
| GET | `/api/overview` | Dashboard: DB stats, artist/boxset counts, library facets, recent additions, paths |
| GET | `/api/library` | Library index items |
| GET | `/api/artists` | Artists aggregated from the library |
| GET | `/api/releases/{slug}` | `{public, record, item}` for one album folder |
| GET | `/api/artists/{slug}` | `{public, record, summary, releases}` for one artist folder |
| GET | `/api/jobs` · `/api/jobs/{id}` | Job snapshots (`seq` + jobs; one job includes its log) |
| POST | `/api/jobs/{id}/cancel` | Stop a running job |
| POST | `/api/jobs/{id}/answer` | Answer a job's open prompt |
| GET | `/api/events` | SSE feed of job events |
| POST | `/api/actions/probe-services` | Job: `scrapper test` |
| POST | `/api/actions/generate-collection` | Job: `scrapper generate-collection` |
| GET | `/media/{path}` | Artwork / JSON from `public/` |

Errors are `{"error": "…"}` with a matching status code.

## Development

```bash
cd scrapper
cargo run -- --no-open          # API on :7878
pnpm --dir web install
pnpm --dir web dev              # Vite on :5180, proxies /api and /media to :7878
```

Set `SCRAPPER_URL=http://127.0.0.1:7899` to point the Vite proxy at another port. Use
`pnpm --dir web typecheck` to typecheck and `pnpm --dir web build` to refresh what the binary
serves. The `scrapper-web` entry in `.claude/launch.json` runs the server for previews.

The `image` and `zune-jpeg` crates are built at `opt-level = 3` in dev (see `Cargo.toml`),
because deriving thumbnails in an unoptimised build is about 10× slower.

The UI uses neutral light and dark themes (system by default, toggled in the sidebar) so the
artwork carries the colour. Design tokens live in `web/src/index.css`.
