# CLI Commands Reference

Complete reference for all backend CLI commands.

The backend is the `scrapper` Rust binary. Once installed via `cd scrapper && ./install.sh`
it runs from any directory (it registers `~/.config/scrapper/config.json` pointing at the
scrapper folder). To run against source without installing, substitute `cargo run -- <cmd>`
(from inside `scrapper/`) for `scrapper <cmd>` below. Run `scrapper <cmd> --help` for the
authoritative flag list of any subcommand.

## Subcommands

`status`, `test`, `init`, `backup`, `db`, `release`, `collection`, `artist`,
`artist-batch`, `report`, `generate-collection`, `enrich-description`,
`backfill-videos`, `backfill-original-years`, `backfill-formats`, `backfill-tracklists`,
`maintenance`.

## Global Options

Options available for all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--config` | PATH | central config | Configuration file path |
| `--log-level` | CHOICE | `INFO` | Logging level |

**Log Levels:** `DEBUG`, `INFO`, `WARNING`, `ERROR`

**Example:**
```bash
scrapper --log-level DEBUG --config /path/to/config.json collection
```

---

## release

Process and enrich a single Discogs release.

```bash
scrapper release <DISCOGS_ID> [OPTIONS]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `DISCOGS_ID` | No* | Discogs release ID. *Omit it together with `--boxset <BOX_ID>` to run interactive boxset discovery (see below) |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--save` | FLAG | `false` | Save to public directory |
| `--force-refresh` | FLAG | `false` | Refetch everything from the source APIs (Discogs included) and persist it — implies `--save` |
| `--interactive` | FLAG | `false` | Manual match selection |
| `--prefer` | CHOICE | - | Preferred data/image source: `apple-music`, `spotify`, `theaudiodb`, `discogs`, `v1` |
| `--boxset` | STRING | - | Link this release as a member of a boxset (the parent's Discogs ID) |
| `--field` | CHOICE | - | Refresh one field in place: `tracks`, `videos`, `discogs`, `apple`, `spotify`, `lastfm`, `images`. Implies `--save` |

> Run `scrapper release --help` for the full, authoritative flag list.

> **`--field` vs `--force-refresh`.** `--force-refresh` rebuilds `raw_data` from scratch, and
> the Perplexity description is interactive-only — so a headless force-refresh **drops the
> stored album description**. `--field` re-fetches just the named field and writes it back
> into the existing record, leaving descriptions, service matches and artwork alone. Prefer
> it whenever you only need to correct one thing. The release must already be in the
> database.
>
> `--field tracks` is the fix for a compilation whose tracks show no artists: it restores the
> per-track credits from Discogs, without which every track scrobbles as the release artist
> ("Various") and Last.fm filters it out.

> `--interactive` shows the match picker for **every** candidate list, including a single
> candidate, so you can always confirm or skip a source. `--save` also regenerates
> `public/collection.json` after writing the release.

> `--boxset <BOX_ID>` with a release ID requires the parent release to already be in the
> database (process the box itself first). The link is stored at
> `raw_data.boxset.parent_discogs_id`, survives refreshes, and makes the member inherit the
> parent's `date_added` when it has none of its own. The collection generator turns it into
> `boxset` / `boxset_contents` fields in `collection.json` — see
> [data schemas](../data/schemas.md). Members get full enrichment (artwork, tracklist,
> streaming links) and stay searchable, but the frontend excludes them from stats,
> recently-added, browse listings, and wrapped.

### Boxset discovery

`scrapper release --save --boxset <BOX_ID>` (no release ID) runs the whole boxset workflow
in one interactive session: it processes/refetches the box itself, reads the album titles
from the box's tracklist section headers, searches Discogs masters for each album, and
shows a picker (choose a master or skip). Each match resolves to the master's main release
and is processed with full enrichment as a linked member — service matches (Apple Music,
Spotify) are also picked interactively, which avoids bad first-match artwork for albums
that only exist on streaming as combined editions. Requires a terminal; collection.json is
regenerated once at the end.

The same workflow is available inside the TUI from the **Boxsets** screen (Unprocessed view →
`Enter`; `Ctrl+F` = `--force-refresh`), where the pickers are modal overlays — see
[README.md](./README.md#boxsets-tui). Both fronts call `ops::release::discover_boxset`, so the
matching rules and output are identical.

In every `--boxset` run (discovery or manual linking), **existing hi-res artwork is kept**:
skipping a service picker would otherwise let a low-res Last.fm/Discogs image replace a
good cover. Fresh members with no artwork still download one, and passing `--prefer`
explicitly always re-downloads from that source.

### Examples

```bash
# Basic processing
scrapper release 123456

# Save to public directory
scrapper release 123456 --save

# Force refresh cached data (rebuilds raw_data — drops the description when headless)
scrapper release 123456 --force-refresh --save

# Refresh only the tracklist, leaving description/service matches intact
# (restores per-track artists on compilations so they can be scrobbled)
scrapper release 38185662 --field tracks

# Interactive mode for manual matching
scrapper release 123456 --interactive --save

# Prefer Apple Music as the source
scrapper release 123456 --prefer apple-music --save

# Interactive boxset discovery: process the box, then search-and-match every album in it
scrapper release --save --boxset 34349962

# Or link individual albums into a box manually
scrapper release 12811757 --save
scrapper release 414374 --save --boxset 12811757
```

---

## collection

Process entire Discogs collection.

```bash
scrapper collection [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--limit` | INT | - | Maximum items to process |
| `--from` | INT | 0 | Start index |
| `--to` | INT | - | End index |
| `--resume` | FLAG | `false` | Resume previous run |
| `--dry-run` | FLAG | `false` | Preview without saving |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Drop into the interactive TUI |
| `--save` | FLAG | `false` | Save to public directory |
| `--prefer` | CHOICE | - | Preferred data/image source |

Plain `collection` runs headless; `collection --interactive` opens the TUI.

### Examples

```bash
# Process entire collection (headless)
scrapper collection

# Interactive TUI
scrapper collection --interactive

# Resume interrupted processing
scrapper collection --resume

# Process specific range
scrapper collection --from 100 --to 200

# Limit the number of items
scrapper collection --limit 5

# Dry run (preview)
scrapper collection --dry-run

# Force re-process everything
scrapper collection --force-refresh
```

### Resume Behavior

The `--resume` flag:
1. Loads existing database state
2. Skips already-processed items
3. Continues from last position
4. Preserves previous results

---

## artist

Get comprehensive artist information.

```bash
scrapper artist <ARTIST_NAME> [OPTIONS]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `ARTIST_NAME` | Yes | Artist name to search |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--save` | FLAG | `false` | Save to public directory |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Manual selection (picker appears even for a single candidate) |
| `--prefer` | CHOICE | - | Preferred data/image source |
| `--theaudiodb` | FLAG | `false` | Include TheAudioDB |
| `--perplexity` | FLAG | `false` | Use Perplexity for artist descriptions |
| `--perplexity-context` | STRING | - | Extra artist identity context for Perplexity |

> `--save` also rewrites every release JSON that embeds the artist (their biography and service
> IDs are joined into release files at write time) and regenerates `public/collection.json`.
> The same applies to `artist-batch --save`.

### Examples

```bash
# Basic artist lookup
scrapper artist "Radiohead"

# Save artist data
scrapper artist "Radiohead" --save

# Interactive selection
scrapper artist "The Beatles" --interactive --save

# Include TheAudioDB data
scrapper artist "Daft Punk" --theaudiodb --save

# Generate a Perplexity description
scrapper artist "Björk" --perplexity --save

# Generate a Perplexity description with identity context
scrapper artist "Steve White Trio" --perplexity --perplexity-context "UK acid jazz trio behind Soul Drums" --save
```

---

## artist-batch

Process multiple artists in a batch.

```bash
scrapper artist-batch [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--from` | INT | 0 | Start index |
| `--to` | INT | - | End index |
| `--save` | FLAG | `false` | Save to public directory |
| `--interactive` | FLAG | `false` | Manual selection |
| `--include-various` | FLAG | `false` | Include "Various Artists" |
| `--stats` | FLAG | `false` | Show statistics |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--prefer` | CHOICE | - | Preferred data/image source |
| `--theaudiodb` | FLAG | `false` | Include TheAudioDB |
| `--perplexity` | FLAG | `false` | Use Perplexity for artist descriptions |
| `--perplexity-context` | STRING | - | Shared artist identity context for Perplexity |

### Examples

```bash
# Process all artists
scrapper artist-batch --save

# Process a range
scrapper artist-batch --from 0 --to 50 --save

# Show processing statistics
scrapper artist-batch --stats
```

`artist-batch` reads from the SQLite `artists` table. Before listing work it
backfills missing placeholder rows from saved release credits, and saving
releases through `collection` or `release` keeps seeding new credited artists as
unenriched rows.

---

## enrich-description

Generate album descriptions using Perplexity AI.

```bash
scrapper enrich-description [TARGET] [OPTIONS]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `TARGET` | No | Discogs ID(s) or album title |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--list-missing` | FLAG | `false` | List albums without descriptions |
| `--force` | FLAG | `false` | Regenerate existing |
| `--dry-run` | FLAG | `false` | Preview without saving |
| `--from` | INT | - | Process from Discogs ID backwards |
| `--batch-size` | INT | 50 | Pause every N items |
| `--artist` | STRING | - | Artist name (with title) |

### Examples

```bash
# List albums missing descriptions
scrapper enrich-description --list-missing

# Generate for single album by ID
scrapper enrich-description 12345678

# Generate for multiple IDs
scrapper enrich-description 123,456,789

# Generate by title and artist
scrapper enrich-description "OK Computer" --artist "Radiohead"

# Dry run (preview)
scrapper enrich-description 12345678 --dry-run

# Force regenerate existing
scrapper enrich-description 12345678 --force

# Batch process backwards from ID
scrapper enrich-description --from 33817755

# Custom batch size
scrapper enrich-description --from 33817755 --batch-size 25
```

### Description Priority

The system checks multiple sources before generating:
1. Apple Music editorial notes
2. Last.fm wiki content
3. Perplexity AI (fallback)

---

## backfill-videos

Backfill the videos behind `tv.json`, from one of three sources, then regenerate
`collection.json` and `tv.json`.

```bash
scrapper backfill-videos [OPTIONS]
```

| Mode | Source | Stored at |
|------|--------|-----------|
| default | The Discogs release's own `videos[]` | `videos` column + album JSON (URLs), `raw_data.discogs.videos` (full objects) |
| `--masters` | The Discogs master's `videos[]`, which covers every edition and usually lists far more than one pressing | `raw_data.discogs.master_videos` |
| `--theaudiodb` | Each artist's official music videos from TheAudioDB (`mvid.php`), with album names resolved from `album.php` | the artist's `raw_data.theaudiodb_videos` |
| `--check` | Whether each video `tv.json` could list plays in an embed, read from YouTube's public embed page (`previewPlayabilityStatus`, no API key) | `video_playability` table; unplayable ids are left out of `tv.json` |

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--masters` | | FLAG | `false` | Fetch Discogs master videos instead |
| `--theaudiodb` | | FLAG | `false` | Fetch TheAudioDB artist music videos instead |
| `--check` | | FLAG | `false` | Check playability instead: new ids plus those last checked over 30 days ago (`--force`: all) |
| `--batch-size` | `-b` | INT | `25` | Rows per batch (used with `--pause`) |
| `--limit` | `-l` | INT | all | Maximum releases (or artists) to process |
| `--dry-run` | | FLAG | `false` | Show what would be fetched |
| `--from` | | STRING | - | Start from this Discogs ID (default mode only) |
| `--force` | `-f` | FLAG | `false` | Re-fetch rows that are already done |
| `--pause` | `-p` | INT | - | Pause for N seconds between batches |

### Examples

```bash
# Preview which releases still need their Discogs video objects
scrapper backfill-videos --dry-run --limit 5

# Releases' own Discogs videos
scrapper backfill-videos

# Discogs master videos (one request per master, about an hour for the whole collection)
scrapper backfill-videos --masters

# TheAudioDB music videos for every artist with a TheAudioDB id
scrapper backfill-videos --theaudiodb

# Check which videos still play in an embed (about 8 a second)
scrapper backfill-videos --check

# Re-fetch everything
scrapper backfill-videos --force
```

### Behavior

- Resumable. The default mode skips releases that already have `raw_data.discogs.videos`.
  `--masters` skips those with `master_videos`, and releases already found to have no master.
  `--theaudiodb` skips artists with `theaudiodb_videos` and artists without a TheAudioDB id.
  `--force` redoes them all.
- `--masters` fetches each master once per run, even when several releases share it. A
  release with no stored `master_id` is fetched first to find its master. A master that
  404s is stored as empty; `backfill-original-years --force` re-points the release.
- New releases and refreshes get the full video objects and master videos from
  `process_release`. Saving a *new* release also refetches its headline artists'
  TheAudioDB videos, because a new album's official videos are often added after the
  artist was last fetched. An artist with no TheAudioDB match yet, such as a brand-new one,
  is searched by name, and the match is kept only when the names agree. Artist refreshes
  keep the stored TheAudioDB match and videos.
- These writes don't bump `updated_at`. The video data only feeds `tv.json`, and the
  album and artist JSON show `updated_at`, so a backfill doesn't rewrite every JSON file.
- Every mode ends by checking the playability of any video ids it added, then
  regenerates. `scrapper collection` does the same for new ids. The check stops early
  and keeps what it has if YouTube starts asking for a bot check. It never marks a
  video dead on that answer.
- How `tv.json` merges the three sources: see [tv.json](../data/schemas.md#tvjson).

---

## backfill-original-years

Look up each release's Discogs master and store its original release year,
then regenerate `collection.json` so `year_original` reaches the frontend.

```bash
scrapper backfill-original-years [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--limit` | `-l` | INT | all | Only process this many releases (newest additions first) |
| `--dry-run` | | FLAG | `false` | List what would be looked up without calling Discogs |
| `--force` | `-f` | FLAG | `false` | Look up every release again, including ones already done |

### Examples

```bash
# Preview how many releases still need an original year
scrapper backfill-original-years --dry-run

# Try the newest 20 additions
scrapper backfill-original-years --limit 20

# Full run (resumable; stop and re-run at any point)
scrapper backfill-original-years

# Redo every release
scrapper backfill-original-years --force
```

### Behavior

- Writes `raw_data.discogs.master_id` and `raw_data.discogs.master_year` on
  each release row, keeping every other `raw_data` key. `master_year: null`
  means "looked up, no master or no year"; no SQLite schema change.
- Uses the stored `master_id` when the row has one; otherwise fetches the
  release first to read it. Each master is looked up once per run, so
  releases sharing a master cost one request.
- Stored master IDs can go stale when Discogs merges or deletes a master.
  If a stored ID returns "not found", the release is fetched again and its
  current `master_id` is used instead (or the row is marked as having no
  master if it no longer has one).
- `/masters/{id}` is called with the personal token, so it runs in the
  authed 60/min bucket. A full run from scratch is roughly 2,900 master
  lookups plus 500 release lookups, about an hour.
- Resumable: rows that already have a `master_year` key are skipped unless
  `--force`. Failed lookups leave the key absent, so a re-run retries them.
- Prints one line per release: `→ 1991`, `· no master`, or `✗ … failed`,
  then a summary.
- Regenerates `collection.json` when at least one release was updated.
  Album JSON files are unchanged.
- New and refreshed releases get the same fields from `process_release`, so
  this is only needed for rows written before that.

---

## backfill-formats

Store each release's Discogs pressing detail (vinyl colour lives in a format's `text`), write
`format_details` / `vinyl_colours` into the album JSON files, and regenerate `collection.json`.

```bash
scrapper backfill-formats [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--limit` | `-l` | INT | all | Only fetch this many releases from Discogs (newest additions first); album JSON is still synced for everything already stored |
| `--dry-run` | | FLAG | `false` | Report how many releases need a Discogs lookup and how many already have stored formats, without calling Discogs or writing anything |
| `--force` | `-f` | FLAG | `false` | Fetch every release again, including ones that already have stored formats |

### Examples

```bash
# How many releases still need their formats fetched?
scrapper backfill-formats --dry-run

# Try the newest 20 additions
scrapper backfill-formats --limit 20

# Full run (resumable; stop and re-run at any point)
scrapper backfill-formats
```

### Behavior

- Writes the Discogs `formats[]` to `raw_data.discogs.formats` on each release row, keeping every
  other `raw_data` key. Rows that already have it (all Python-era rows) make no Discogs request.
- Then syncs every release's album JSON from the DB: `format_details` is set once the formats are
  stored and `vinyl_colours` only when the pressing is coloured. Only those two keys are touched,
  and a file that already holds the right values is not rewritten.
- One `GET /releases/{id}` per release that needs it, in the authed 60/min bucket, so a run over
  the ~450 rows the Rust scrapper wrote before formats were stored takes about eight minutes.
- Resumable: a failed lookup leaves the row without formats, so a re-run retries only those.
- Prints one line per fetched release (`→ Red, Yellow` when coloured), then a summary of fetched,
  failed, updated and already-current files, and regenerates `collection.json`.
- New and refreshed releases store the formats through `process_release` / the Discogs refresh,
  so this is only needed for rows written before that.

---

## backfill-tracklists

Re-fetch the Discogs tracklist of releases stored before headings and suites were told apart,
and patch the result into their album JSON. Older rows kept only the top-level Discogs rows, so a
suite (Discogs `index` track, e.g. Rush's "2112") was stored as a bare title and its movements
were lost.

```bash
scrapper backfill-tracklists [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--limit` | `-l` | INT | all | Only fetch this many releases from Discogs (newest additions first) |
| `--dry-run` | | FLAG | `false` | List the releases that would be fetched, without calling Discogs or writing anything |
| `--force` | `-f` | FLAG | `false` | Fetch every release again, including ones whose tracklist is already typed |

### Behavior

- Candidates are releases with a position-less row that has no `type`. Only those can hide a
  suite. That was 393 releases when this was added.
- One `GET /releases/{id}` per candidate. The tracklist is mapped by the same
  `tracklist_from_discogs()` as `process_release`: headings and suites get `type`, and movements
  are flattened in after their suite with `parent` set (see
  [Tracklist rows](../data/schemas.md#tracklist-rows-headings-suites-and-movements)). This
  replaces the stored tracklist, so hand edits to those releases are overwritten.
- Then every release whose tracklist is typed has its album JSON `tracklist` patched from the DB,
  with keys sorted. Only that key is touched, and a file that is already current is not
  rewritten. `collection.json` doesn't use tracklists, so it isn't regenerated.
- Resumable: a failed lookup keeps the old tracklist, and a re-run retries only those.
- Prints `→ N movement(s)` for releases with suites.

---

## generate-collection

Generate collection.json for React frontend. A `tv.json` video index for the `/tv` page is
written alongside it, in the same directory as `--output` (see
[tv.json](../data/schemas.md#tvjson)).

```bash
scrapper generate-collection [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | PATH | `public/collection.json` | Output path |
| `--data-path` | PATH | `public` | Album data directory |

### Examples

```bash
# Generate with defaults
scrapper generate-collection

# Custom output location
scrapper generate-collection --output /path/to/collection.json
```

### Output Format

```json
{
  "generated_at": "2024-01-15T10:30:00Z",
  "total_albums": 1234,
  "albums": [
    {
      "release_name": "Album Title",
      "release_artist": "Artist Name",
      "uri_release": "/album/slug",
      "date_added": "2024-01-10T15:00:00Z",
      "date_release_year": 2024,
      "year_original": 1997,
      "genre_names": ["Genre1", "Genre2"],
      "images_uri_release": {
        "hi-res": "/album/slug/slug-hi-res.jpg",
        "medium": "/album/slug/slug-medium.jpg"
      }
    }
  ]
}
```

---

## report

Generate album matching report.

```bash
scrapper report [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output-file` | PATH | `report.txt` | Output file |
| `--format` | CHOICE | `text` | Output format (text/json) |
| `--limit` | INT | - | Maximum albums |
| `--filter-config` | PATH | - | Filter configuration |
| `--include-unprocessed` | FLAG | `false` | Include unprocessed items |

### Examples

```bash
# Basic report
scrapper report

# JSON format
scrapper report --format json --output-file report.json

# Limited report
scrapper report --limit 100
```

---

## test

Test API service connections.

```bash
scrapper test
```

### Output

```
Testing Discogs... OK
Testing Apple Music... OK
Testing Spotify... OK
Testing Last.fm... OK
Testing Wikipedia... OK
Testing TheAudioDB... OK
Testing Perplexity... OK (optional)

All required services are working.
```

---

## status

Show database and processing status.

```bash
scrapper status
```

### Output

```
Database Statistics:
  Database path: collection_cache.db
  Database size: 45.2 MB

Releases:
  Total: 1234
  Enriched: 1200
  Pending: 34

Collection Items:
  Total: 1234
  Processed: 1200
  Remaining: 34

Artists:
  Total: 456
  With images: 400

Last processed: 2024-01-15 10:30:00
```

---

## backup

Backup SQLite database.

```bash
scrapper backup
```

### Output

```
Backing up database...
Created backup: collection_cache.db.backup.2024-01-15-103000
Backup size: 45.2 MB
```

---

## init

Create example configuration file.

```bash
scrapper init [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | PATH | `config.json` | Output path |

### Example

```bash
scrapper init
# Creates config.json with template values
```

---

## db

Inspect and manage the SQLite database.

```bash
scrapper db <SUBCOMMAND>
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `search` | Search stored releases/artists |
| `list` | List database entries |
| `delete` | Delete entries |
| `stats` | Show database statistics |
| `backup` | Back up the database |

Run `scrapper db --help` (or `scrapper db <sub> --help`) for flags.

---

## maintenance

Data maintenance utilities.

```bash
scrapper maintenance <SUBCOMMAND>
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `find-missing` | Find releases/artists with missing data |
| `reconcile` | Reconcile the database against the static JSON output |
| `band-members` | Flag band line-up credits as `role: "member"` on stored releases, rewrite their album JSON and regenerate `collection.json`. `--dry-run` lists matches without saving |

Run `scrapper maintenance --help` for flags.

---

## Common Workflows

### Initial Setup

```bash
# 1. Create config
scrapper init
# Edit config.json with your credentials

# 2. Test services
scrapper test

# 3. Process collection
scrapper collection
```

### Resume After Interruption

```bash
# Check status
scrapper status

# Resume processing
scrapper collection --resume
```

### Re-process Specific Album

```bash
# Force refresh and save
scrapper release 123456 --force-refresh --save
```

### Add Missing Descriptions

```bash
# List albums needing descriptions
scrapper enrich-description --list-missing

# Generate descriptions
scrapper enrich-description --from 33817755
```

### Regenerate Frontend Data

```bash
# Regenerate collection index
scrapper generate-collection
```

### Troubleshooting

```bash
# Debug mode
scrapper --log-level DEBUG release 123456

# Prefer a specific source when matching
scrapper release 123456 --prefer apple-music --save
```
