# scrapper

A cohesive Rust music-collection enrichment tool that runs as an interactive **TUI** by default
and a **headless CLI** for automation. It replaced the original Python implementation, reuses the
same data assets verbatim, and preserves the static data contract the React frontend in `public/`
depends on.

## Why

The original Python tool grew over years into multiple entry points (`main.py`, `run_web.py`,
a pile of `tools/*` scripts) and a parallel FastAPI web admin. This Rust binary consolidates all
of that into one executable with a single, consistent interface.

## Design

- **One binary, two faces.** No arguments → launches the TUI. A subcommand → runs that command
  headlessly (`scrapper collection --resume`) for cron/CI.
- **Reuse, don't re-fetch.** The 358MB `collection_cache.db`, `discogs_cache/`, `config.json`,
  `album_matching_filters.json`, and `secrets/` are copied in as-is. The SQLite schema is
  unchanged from the Python tool.
- **Preserve the data contract.** Folder slugs and the album/artist JSON shapes written into
  `../public` must match what already exists. The folder sanitizer is a verified byte-for-byte
  port of the Python one (see Testing).
- **Concurrent, rate-limited.** Service fetches use `tokio` with per-service rate limiters
  (`governor`) instead of the old sequential model.

## Location & paths

`scrapper/` sits at the repo root, so the config's `data.path = "../public"` resolves to
`<repo>/public`. Output goes to `../public/album/<slug>/` and `../public/artist/<slug>/`.

## Layout

```
src/
  main.rs        Entry point: TUI when bare, CLI dispatch otherwise
  config.rs      config.json + env-var overrides + secrets resolution
  db.rs          rusqlite/r2d2 layer over collection_cache.db (schema unchanged)
  sanitize.rs    Folder-name sanitizer (verified port) + filename helpers
  logging.rs     tracing setup
  util.rs        Timestamps and small helpers
  cli/           clap command surface (all commands + flags)
  ops/           Command implementations shared by CLI and TUI
  services/      API clients (Discogs, Apple Music, Spotify, Last.fm, Wikipedia,
                 TheAudioDB, Perplexity) with rate limiting
  output/        JSON writer, image manager, collection generator
  tui/           ratatui app, screens, detail views, modals, runners
tests/
  sanitizer_corpus.rs   Gate: every existing public/ folder must be reproducible
  json_fidelity.rs      Gate: regenerated JSON matches public/ semantically
```

## Commands

```
scrapper                       # launch the TUI
scrapper status                # database + processing status
scrapper db search <release|artist> <query>
scrapper db list <releases|artists> [--limit N] [--sort date_added|title|year|name]
scrapper db delete <release|artist> <id> --force   # auto-backs up first
scrapper db stats | backup [--name F]
scrapper backup [--backup-path P]
scrapper init [--output P]
scrapper test                  # service credential / connectivity check
scrapper collection [--resume] [--from N --to N] [--limit N] [--dry-run] ...
scrapper release <discogs_id> [--save] [--prefer …] [--output json]   # live: fetch+enrich
scrapper artist <name> [--save] [--interactive] [--theaudiodb] [--perplexity] ...
scrapper artist-batch --from N --to N [--save] [--interactive] [--stats] ...
scrapper enrich-description [<id>] [--list-missing] [--force] [--from <id>] ...
scrapper backfill-videos [--dry-run] [--from <id>] [--limit N] ...
scrapper report | generate-collection
scrapper maintenance find-missing [--show-orphaned] | reconcile [--threshold F]
```

Run `scrapper --help` or `scrapper <command> --help` for the full flag set.

## Build, install & run

Install once so `scrapper` is on your `PATH` and works from any directory:

```
./install.sh
```

This runs `cargo install --path . --force` (binary → `~/.cargo/bin/scrapper`) and writes a
central pointer at `~/.config/scrapper/config.json` (`{ "root": "<this folder>" }`). The binary
discovers its real `config.json` + database + secrets via that pointer, so `scrapper status`
works from anywhere. Re-run `./install.sh` after pulling changes to rebuild.

Config discovery order: `--config <path>` → `./config.json` (in-folder dev) → the central
`~/.config/scrapper/config.json` pointer.

For local development without installing:

```
cargo build
cargo run -- status          # uses ./config.json from this folder
cargo test && cargo clippy
```

Requires `config.json` (copy `config.example.json`) plus the data assets (`collection_cache.db`,
`secrets/`, `discogs_cache/`) in this folder. All assets, secrets, and build artifacts are
git-ignored.

## Testing

```
cargo test            # unit tests + sanitizer corpus gate
cargo clippy --all-targets
```

The **sanitizer corpus gate** (`tests/sanitizer_corpus.rs`) enumerates every folder under
`public/album` and `public/artist` and asserts each is reproducible from its JSON via the Rust
sanitizer. A short, documented allowlist covers legacy folders that predate certain sanitizer
rules (the current Python sanitizer doesn't reproduce them either) plus one macOS NFC/NFD
filesystem artifact; both sides are NFC-normalized before comparison.

The **JSON fidelity gate** (`tests/json_fidelity.rs`) regenerates album/artist JSON from the DB
and compares it *semantically* against the on-disk `public/` files (album ~98%, artist ~95%).
Excluded from the comparison are fields a DB-only regenerate cannot reproduce (`resource_url`,
per-track `artists`, the `services`/`raw_data` blobs — which in the old files are Python
dataclass-repr strings) and volatile timestamps. The residual misses are stale snapshots where
the DB has moved on (ids assigned, albums re-matched, videos backfilled), not serializer errors.

## Status

| Area | State |
|---|---|
| Scaffold, config, logging, assets | ✅ done |
| Folder sanitizer + corpus gate | ✅ verified against 4,509 folders |
| Database read layer + resume + maintenance | ✅ done |
| CLI surface (all commands/flags) | ✅ done |
| Local commands (status, db, backup, init, dry-runs, list-missing, maintenance) | ✅ working |
| API services (7) | ✅ done — `test` probes all 7 concurrently |
| Public JSON serializer (album + artist) | ✅ done — fidelity-tested vs `public/` |
| Image manager (hi-res download + source fallback) | ✅ done |
| Live `release <id>` (fetch → enrich → save → JSON + artwork) | ✅ done |
| Live `collection` (resume-aware, reuses the release pipeline) | ✅ done |
| Live `artist` (Discogs + Apple/Spotify/Last.fm/Wikipedia/TheAudioDB) | ✅ done |
| `generate-collection` (collection.json index) | ✅ done — 99.8% match vs existing |
| `artist-batch`, `enrich-description` (Perplexity), `backfill-videos`, `report` | ✅ done |
| ratatui TUI (dashboard, browsers, live probes, live collection) | ✅ done |

All commands and the interactive TUI are implemented.

### TUI

Running `scrapper` with no arguments launches the interactive TUI: a home menu into a
**Dashboard** (DB + artist-enrichment stats with gauges), searchable **Releases** and **Artists**
browsers (with `✓`/`·` enrichment badges and Enter-to-open **detail** drill-downs), live **service
probes**, a **Collection** runner, and an **Enrich artists** runner. Both runners process a
configurable number of items (editable with digits or `↑/↓`) in the background with a progress
gauge and a step-by-step log. When a release *or artist* has more than one Apple Music / Spotify /
Discogs candidate, a **modal match-picker** pauses the run so you can choose (`↑/↓` select, `Enter`
confirm, `Esc` skip). From an artist's detail view, press `e` to enrich just that one artist.
Keys: type to search, `↑/↓` move, `Enter` open detail, `r` run/re-probe, `e` enrich (artist
detail), `Esc` back, `q` quit.

**`scrapper collection --interactive` drops straight into this TUI**, pre-set to process the
first N releases (from `--to`/`--limit`) — interactive enrichment *is* the TUI experience, with
modal match-pickers and live feedback. Non-interactive `collection` stays headless; CLI
`release --interactive` prompts inline on the terminal.

Each release is enriched across Discogs, Apple Music, Spotify, Last.fm and **Wikipedia** (artist
bio), and — interactively — **Perplexity**: the description modal shows what's being described,
lets you add free-text context, and (re)generate before accepting. (TheAudioDB is artist-only;
it's used by the `artist` command.) The feedback line reports each service's result.

### Services

`scrapper test` probes all seven concurrently with the real credentials:

| Service | Auth | Rate limit |
|---|---|---|
| Discogs | `Authorization: Discogs token=…` | 60/min |
| Apple Music | ES256 JWT (from the `.p8`), 12h expiry | 60/min |
| Spotify | client-credentials OAuth, cached token | 100/min |
| Last.fm | `api_key` param (+ MD5 signing available) | 60/min |
| Wikipedia | none (User-Agent only) | 120/min |
| TheAudioDB | token in URL path | 30/min |
| Perplexity | Bearer key; `sonar` model | from config (20/min) |
