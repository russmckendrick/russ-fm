# CLI Commands Reference

Complete reference for all backend CLI commands.

## Global Options

Options available for all commands:

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--config` | `-c` | PATH | `config.json` | Configuration file path |
| `--log-level` | | CHOICE | `INFO` | Logging level |
| `--log-file` | | PATH | Auto | Custom log file path |
| `--session-logs` | | FLAG | `true` | Create per-session log files |

**Log Levels:** `DEBUG`, `INFO`, `WARNING`, `ERROR`

**Example:**
```bash
python main.py --log-level DEBUG --config /path/to/config.json collection
```

---

## release

Process and enrich a single Discogs release.

```bash
python main.py release <DISCOGS_ID> [OPTIONS]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `DISCOGS_ID` | Yes | Discogs release ID |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | PATH | - | Output directory |
| `--save` | FLAG | `false` | Save to public directory |
| `--services` | STRING | all | Comma-separated service list |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Manual match selection |
| `--search` | STRING | - | Override search query |
| `--custom-cover` | URL | - | Use custom artwork URL |
| `--prefer` | CHOICE | - | Preferred image source |
| `--v1` | FLAG | `false` | Use v1 output format |

### Examples

```bash
# Basic processing
python main.py release 123456

# Save to public directory
python main.py release 123456 --save

# Force refresh cached data
python main.py release 123456 --force-refresh --save

# Interactive mode for manual matching
python main.py release 123456 --interactive --save

# Use custom search query
python main.py release 123456 --search "Artist - Album" --save

# Use custom artwork
python main.py release 123456 --custom-cover "https://example.com/cover.jpg" --save

# Only use specific services
python main.py release 123456 --services "discogs,spotify" --save

# Prefer Apple Music images
python main.py release 123456 --prefer apple_music --save
```

---

## collection

Process entire Discogs collection.

```bash
python main.py collection [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--username` | STRING | config | Discogs username |
| `--limit` | INT | - | Maximum items to process |
| `--from` | INT | 0 | Start index |
| `--to` | INT | - | End index |
| `--batch-size` | INT | 10 | Items per batch |
| `--resume` | FLAG | `false` | Resume previous run |
| `--dry-run` | FLAG | `false` | Preview without saving |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Manual match selection |
| `--prefer` | CHOICE | - | Preferred image source |

### Examples

```bash
# Process entire collection
python main.py collection

# Resume interrupted processing
python main.py collection --resume

# Process specific range
python main.py collection --from 100 --to 200

# Dry run (preview)
python main.py collection --dry-run

# Smaller batches for stability
python main.py collection --batch-size 5

# Force re-process everything
python main.py collection --force-refresh
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
python main.py artist <ARTIST_NAME> [OPTIONS]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `ARTIST_NAME` | Yes | Artist name to search |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--save` | FLAG | `false` | Save to public directory |
| `--output` | PATH | - | Output directory |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--interactive` | FLAG | `false` | Manual selection |
| `--custom-image` | URL | - | Custom artist image |
| `--verify` | FLAG | `false` | Verify with releases |
| `--prefer` | CHOICE | - | Preferred image source |
| `--theaudiodb` | FLAG | `false` | Include TheAudioDB |
| `--v1` | FLAG | `false` | Use v1 output format |

### Examples

```bash
# Basic artist lookup
python main.py artist "Radiohead"

# Save artist data
python main.py artist "Radiohead" --save

# Interactive selection
python main.py artist "The Beatles" --interactive --save

# Include TheAudioDB data
python main.py artist "Daft Punk" --theaudiodb --save

# Verify with release matching
python main.py artist "Björk" --verify --save
```

---

## artist-batch

Process multiple artists with verification.

```bash
python main.py artist-batch [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--from` | INT | 0 | Start index |
| `--to` | INT | - | End index |
| `--save` | FLAG | `false` | Save to public directory |
| `--verify` | FLAG | `false` | Verify with releases |
| `--interactive` | FLAG | `false` | Manual selection |
| `--include-various` | FLAG | `false` | Include "Various Artists" |
| `--stats` | FLAG | `false` | Show statistics |
| `--force-refresh` | FLAG | `false` | Ignore cache |
| `--prefer` | CHOICE | - | Preferred image source |
| `--theaudiodb` | FLAG | `false` | Include TheAudioDB |

### Examples

```bash
# Process all artists
python main.py artist-batch --save

# Process range with verification
python main.py artist-batch --from 0 --to 50 --verify --save

# Show processing statistics
python main.py artist-batch --stats
```

---

## enrich-description

Generate album descriptions using Perplexity AI.

```bash
python main.py enrich-description [TARGET] [OPTIONS]
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
python main.py enrich-description --list-missing

# Generate for single album by ID
python main.py enrich-description 12345678

# Generate for multiple IDs
python main.py enrich-description 123,456,789

# Generate by title and artist
python main.py enrich-description "OK Computer" --artist "Radiohead"

# Dry run (preview)
python main.py enrich-description 12345678 --dry-run

# Force regenerate existing
python main.py enrich-description 12345678 --force

# Batch process backwards from ID
python main.py enrich-description --from 33817755

# Custom batch size
python main.py enrich-description --from 33817755 --batch-size 25
```

### Description Priority

The system checks multiple sources before generating:
1. Apple Music editorial notes
2. Last.fm wiki content
3. Perplexity AI (fallback)

---

## generate-collection

Generate collection.json for React frontend.

```bash
python main.py generate-collection [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | PATH | `public/collection.json` | Output path |
| `--data-path` | PATH | `public` | Album data directory |

### Examples

```bash
# Generate with defaults
python main.py generate-collection

# Custom output location
python main.py generate-collection --output /path/to/collection.json
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
python main.py report [OPTIONS]
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
python main.py report

# JSON format
python main.py report --format json --output-file report.json

# Limited report
python main.py report --limit 100
```

---

## test

Test API service connections.

```bash
python main.py test
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
python main.py status
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
python main.py backup
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
python main.py init [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output` | PATH | `config.json` | Output path |

### Example

```bash
python main.py init
# Creates config.json with template values
```

---

## Common Workflows

### Initial Setup

```bash
# 1. Create config
python main.py init
# Edit config.json with your credentials

# 2. Test services
python main.py test

# 3. Process collection
python main.py collection
```

### Resume After Interruption

```bash
# Check status
python main.py status

# Resume processing
python main.py collection --resume
```

### Re-process Specific Album

```bash
# Force refresh and save
python main.py release 123456 --force-refresh --save
```

### Add Missing Descriptions

```bash
# List albums needing descriptions
python main.py enrich-description --list-missing

# Generate descriptions
python main.py enrich-description --from 33817755
```

### Regenerate Frontend Data

```bash
# Regenerate collection index
python main.py generate-collection
```

### Troubleshooting

```bash
# Debug mode
python main.py --log-level DEBUG release 123456

# Check specific service
python main.py release 123456 --services "discogs,apple_music" --save
```
