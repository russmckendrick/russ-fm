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

| Area | State |
|------|-------|
| Dashboard: counts, recently added, genre / decade / format breakdowns | ✅ |
| Library: cover grid and list, search, genre / format / decade / coloured-vinyl filters, sorting (all in the URL) | ✅ |
| Release and artist pages: artwork, metadata, links, tracklist, videos, description, raw DB record + published JSON | ✅ |
| Release and artist actions: re-enrich, refresh one field, new description, redo colours / photo notes, boxset discovery | ✅ |
| Add & enrich: the TUI's new-in-Discogs picker, add a release by ID or URL, enrich artists, resume the collection | ✅ |
| Boxsets: unprocessed / processed / single-release views, discovery, single-release flag | ✅ |
| Tools: every CLI command as a generated form, plus a command line | ✅ |
| Site assets: `pnpm generate-colors` and `pnpm generate-artist-images`, for everything or one album / artist | ✅ |
| Database: search and list releases/artists (including ones not in collection.json), delete, backups | ✅ |
| ⌘K palette: releases, artists, pages, actions | ✅ |
| Jobs: live log + progress over SSE, stop, interactive prompts (match picker, Perplexity description) | ✅ |
| Editing every release and artist field, with a before/after preview of the published files | ✅ |
| Data health: what's missing across the database and public/, with per-item and batch fixes | ✅ |
| New-in-Discogs list sorted into new, already-in-library-under-another-ID (with Replace), and unmatched | ✅ |

## Pages

- **Add & enrich** (`/add`): the newest Discogs releases that aren't enriched yet (the same
  list as the TUI's Collection screen), in three groups:
  - **New**: not in the database.
  - **Already in your library under another Discogs ID**: no record with this ID, but one
    with the same title and artist (normalised: case and punctuation ignored). Usually a
    submission Discogs merged into the release now in the collection. The likely match
    (added the same day) is marked; other same-titled pressings are listed too. **Replace**
    (`ops::collection::replace_release`) processes the collection's ID, keeps the old
    record's description if the new one has none, moves boxset members and links to the new
    ID, backs up the database, then deletes the old record and its album folder.
  - **In the library, but nothing matched**: processed before without any Apple Music /
    Spotify / Last.fm match. Collapsed; select one to try matching again.

  Pick some and process them, or process the newest N. Releases are force-refreshed and
  saved, and service matches are chosen in the browser. Also: add one
  release by ID or discogs.com URL, enrich the next N un-enriched artists or one artist by
  name, and `collection --resume` (with a dry run).
- **Boxsets** (`/boxsets`): box releases with album section headers, split into Unprocessed,
  Processed and Single release, as in the TUI. Discover albums runs
  `release --boxset <id> --save` (Refetch adds `--force-refresh`).
- **Tools** (`/tools/<command>`): one form per CLI command, generated from clap (see below).
  The command line at the top takes any command as you'd type it
  (`artist "Talk Talk" --save`). **Site (pnpm)** runs the site's asset scripts.
- **Edit tab** on release and artist pages (`?tab=edit`): every field the TUI's detail editor
  has, as text boxes, date and list fields, service URLs, and small tables for artists,
  tracks, videos and images (add, remove, reorder rows). **Preview changes** shows the
  difference in each published file (the album or artist JSON and the release's
  collection.json entry), plus notes such as a folder rename or how many release pages an
  artist change rewrites. **Save** writes it. ↻ re-fetches one field from its source as a job.
- **Override colour** in the release Overview's Pressing section: sets the vinyl colour by hand
  when Discogs doesn't say (the Edit tab's **Vinyl colour** field, saved straight away). Blank or
  **Clear** removes it; see [Pressing detail and vinyl colour](./README.md#pressing-detail-and-vinyl-colour).
- **Data health** (`/health`): checks across releases (no Apple Music / Spotify / Last.fm
  match, no description, tracklist, videos or artwork file, original year not looked up,
  album folders without a database record) and artists (not enriched, no photo, biography,
  Wikidata identity or Wikipedia link). Each lists up to 300 records with a Fix (the CLI
  command for that one record) and, where a batch command exists, a fix-all. Leftover album
  folders get a guarded **Remove folder**: refused while any record has that Discogs ID.
  The dashboard shows the biggest gaps.
- **Database** (`/database`): `db search` / `db list` as a table linked to library pages, delete
  (`db delete … --force`, which backs up first), and the backups folder with Back up now.

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
An artist's `-medium` and `-avatar` follow the site's build: they are made from the chosen
artist photo (`source` in its `-image.json`, a fanart picked on the Images tab) when there is
one, with the avatar cut round the faces in the notes, and rebuilt when the photo or its notes
change. The artist page's header shows that photo, centred on its faces (`photo` in
`/api/artists/{slug}`).

### Images and the upscaler

Artist and release pages have an **Images** tab (`web/src/components/ImagesPanel.tsx`): the
artist's photo and every TheAudioDB fanart file (the one the site's desktop hero uses is
marked *site hero*), or the album's cover, each with its size and an **Upscale** button. It
runs `src/upscale.rs` there and then (a few seconds an image): Upscayl's `upscayl-bin`
(Real-ESRGAN) upscales 4×, the result is resized to the target (photos and covers under
1000px to 2000px on the long side, fanart to 2560×1440) and written over the original as a
JPEG. The original is kept under `scrapper/backups/upscale-originals/` (logged in its
`log.jsonl`) and **Restore original** puts it back. An image already at its target offers
**Upscale 2× anyway**. Without Upscayl the tab says so and the buttons are off.

For an artist, each card also has **Use as hero** (the image the site's desktop hero shows)
and, on fanart, **Use as artist photo** (the site's avatar, artist cards and phone hero use it
instead of the downloaded photo). They save the **Hero image** / **Artist photo** fields
(`raw_data.overrides.hero` / `.photo`) and start `generate-artist-images --only <slug>` so the
site follows; badges show the *site hero* and *artist photo*, marked *chosen* when picked by
hand, with **Hero back to automatic** / **Use the downloaded photo** above the cards. No file
on disk is replaced or deleted for any of this: the downloaded photo and every fanart stay.
Which fanart the site may use at all is the **Fanart** field on the Edit tab (blank for all,
`off`, or the numbers to use, e.g. `1,2`).

### Running CLI commands as jobs

The web UI runs the real CLI code rather than a copy of it:

- **Forms come from clap.** `GET /api/commands` walks `Cli::command()` and returns each
  command's about text, positionals, flags, options, defaults and allowed values
  (`web/commands.rs`). The Tools page renders those as fields, so a new flag shows up in the
  browser as soon as it's added to `cli/mod.rs`. `init` is left out because it writes a config
  into the server's working directory, and so are the TUI's own flags.
- **Arguments are parsed by clap too.** `POST /api/run {args}` parses
  `["scrapper", ...args]` with `Cli::try_parse_from`, so the browser gets the same validation
  and error text as the terminal (conflicting flags, bad values). It refuses `--config`, `init`
  and `collection --interactive` (that one opens the TUI; use the Add page's picker instead),
  then runs `cli::run` as a job.
- **Output is captured per job.** Command code writes with `say!` (`ops/out.rs`) instead of
  `println!`. On the CLI that's stdout; inside a job a tokio task-local `Console` sends each
  line to the job log, so concurrent jobs never mix their output. Batch loops call
  `out::progress(i, total)` for the progress bar. A tracing layer (`logging.rs`) also copies
  the crate's warnings and errors into the running job's log.
- **`--interactive` works in the browser.** `MatchPicker::interactive()` returns the job's
  prompt channel when one is active, and dialoguer on the terminal otherwise, so
  `release … --interactive`, `artist … --interactive` and boxset discovery ask their questions
  in the browser.

The TUI and the web share the collection picker (`ops::collection::new_candidates` /
`process_candidates`) and the artist runner (`ops::artist::enrich_unenriched`). Both take a
`ProgressSink` and a `MatchPicker`.

### Editing with a preview

The TUI detail editor's setters used to validate, change and write in one step. They're now
split in `ops::release` / `ops::artist`, and the TUI calls them in sequence, so it behaves as
before:

- `apply_release_value` / `apply_release_rows` / `apply_artist_value` / `apply_artist_rows`
  change a record in memory and validate.
- `fetch_release_service` / `fetch_artist_service` look up a pasted Apple Music, Spotify,
  Last.fm, Discogs or Wikipedia URL or ID, and report whether new artwork arrived.
- `commit_release_edit` / `commit_artist_edit` do the writing: move the folder when the slug
  changes (and, for artists, rename them in every release that credits them), save to the
  database and write the JSON (artists also rewrite the release JSON that embeds them).

`POST /api/{releases|artists}/{slug}/edit {edits, save}` applies the edits to a copy. With
`save: false` it renders the published JSON before and after (`release_to_value`,
`collection::entry_for`, `artist_to_value`) without writing anything. With `save: true` it
downloads artwork if a service change brought new sources, commits, and regenerates
collection.json. Each edit is `{field, text}` or `{field, rows}`. Field keys come from
`ReleaseField::key()` / `ArtistField::key()`, and `GET …/fields` lists every field with its
kind, value, rows and whether it can be edited or refreshed. Validation errors (a bad date,
an unrecognised URL) answer 400 with the field name.

### Site asset scripts

`POST /api/actions/site-script {script, only?, all?}` runs `pnpm run generate-colors` or
`pnpm run generate-artist-images` in the repo root (the data directory's parent), streaming
stdout and stderr into the job log. `only` passes `--only <slug>` to redo one album or artist;
`all` passes `--force` (colours) or `--full` (artist images). Album and artist pages have
one-click buttons for their own slug. `generate-artist-images` needs macOS (Apple Vision).

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
| POST | `/api/actions/process-releases` | Job: process picked candidates (`{items}`) or the newest N (`{newest}`), interactively |
| POST | `/api/actions/enrich-artists` | Job: enrich the next `{limit}` un-enriched artists, interactively |
| POST | `/api/actions/site-script` | Job: `pnpm run generate-colors` / `generate-artist-images` (`{script, only?, all?}`) |
| GET | `/api/commands` | The CLI command tree, for generated forms |
| POST | `/api/run` | Job: `scrapper <args>` (`{args: [...]}`) |
| GET | `/api/collection/new` | New / un-enriched releases in the Discogs collection (calls Discogs) |
| GET | `/api/boxsets` | Box releases with discovery state and album folder |
| POST | `/api/boxsets/{id}/single` | Flag or unflag a box as a single release (`{single}`) |
| GET | `/api/db/rows` | `?kind=release|artist&q=&sort=&limit=`: search or list database rows |
| GET | `/api/backups` | Files in `scrapper/backups/` |
| GET | `/api/{releases,artists}/{slug}/fields` | Editable fields with kinds, values and rows |
| POST | `/api/{releases,artists}/{slug}/edit` | Preview (`save: false`) or save `{edits}` |
| POST | `/api/actions/refresh-field` | Job: re-fetch one field (`{kind, slug, field}`), interactively |
| POST | `/api/actions/replace-release` | Job: move a library release onto the collection's ID (`{old_id, item}`) |
| GET | `/api/health/checks` | Data-health checks with flagged records and fixes |
| POST | `/api/orphans/{slug}/remove` | Delete an album folder that has no database record |
| GET | `/api/images/{artist,album}/{slug}` | The folder's photo / fanart / cover with sizes, upscale targets and whether each was upscaled |
| POST | `/api/images/upscale` | Upscale one image now (`{path, force?}`; path under `public/`) |
| POST | `/api/images/restore` | Put an upscaled image back to its kept original (`{path}`) |
| GET | `/media/{path}` | Artwork / JSON from `public/` |

Errors are `{"error": "…"}` with a matching status code. Jobs of the same kind (for `run`, the
first word of the command) don't overlap: starting a second one answers `409`. When a job
that writes finishes, the browser refetches whatever is on screen.

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

The `image`, `zune-jpeg` and `serde_json` crates are built at `opt-level = 3` in dev (see
`Cargo.toml`). Deriving thumbnails, and the whole-table reads behind health checks and
collection.json, are several times slower unoptimised. The health checks take about 1.3s in
a release build and about 5s in dev.

The UI uses neutral light and dark themes (system by default, toggled in the sidebar) so the
artwork carries the colour. Design tokens live in `web/src/index.css`.
