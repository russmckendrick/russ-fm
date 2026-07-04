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
`backfill-videos`, `maintenance`.

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
| `DISCOGS_ID` | Yes | Discogs release ID |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--save` | FLAG | `false` | Save to public directory |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Manual match selection |
| `--prefer` | CHOICE | - | Preferred data/image source: `apple-music`, `spotify`, `theaudiodb`, `discogs`, `v1` |

> Run `scrapper release --help` for the full, authoritative flag list.

### Examples

```bash
# Basic processing
scrapper release 123456

# Save to public directory
scrapper release 123456 --save

# Force refresh cached data
scrapper release 123456 --force-refresh --save

# Interactive mode for manual matching
scrapper release 123456 --interactive --save

# Prefer Apple Music as the source
scrapper release 123456 --prefer apple-music --save
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
| `--interactive` | FLAG | `false` | Manual selection |
| `--prefer` | CHOICE | - | Preferred data/image source |
| `--theaudiodb` | FLAG | `false` | Include TheAudioDB |
| `--perplexity` | FLAG | `false` | Use Perplexity for artist descriptions |
| `--perplexity-context` | STRING | - | Extra artist identity context for Perplexity |

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

Backfill YouTube video URLs from Discogs for existing releases.

```bash
scrapper backfill-videos [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--batch-size` | `-b` | INT | `25` | Releases per batch before prompting |
| `--limit` | `-l` | INT | all | Maximum total releases to process |
| `--dry-run` | | FLAG | `false` | Show what would be fetched |
| `--from` | | STRING | - | Start from this Discogs ID |
| `--force` | `-f` | FLAG | `false` | Re-fetch even if videos exist |
| `--pause` | `-p` | INT | - | Pause for N seconds between batches instead of prompting |

### Examples

```bash
# Preview which releases need videos
scrapper backfill-videos --dry-run --limit 5

# Process a small batch
scrapper backfill-videos --batch-size 10 --limit 10

# Start from a specific release
scrapper backfill-videos --from 33817755

# Re-fetch videos for all releases
scrapper backfill-videos --force --limit 5

# Run unattended with a 30-second pause between batches
scrapper backfill-videos --pause 30

# Larger batches with a longer pause
scrapper backfill-videos --batch-size 50 --pause 60
```

### Behavior

- Fetches full release details from Discogs API and extracts video URLs
- Updates both the SQLite database and album JSON files in `public/album/`
- Respects Discogs rate limits with a 1-second delay between requests
- Prompts to continue after each batch by default
- Use `--pause` to run unattended with an automatic delay between batches
- Skips releases that already have videos (unless `--force`)

---

## generate-collection

Generate collection.json for React frontend.

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
