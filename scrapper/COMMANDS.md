# Scrapper Command Reference

All commands are run from the `scrapper/` directory with the virtual environment active:

```bash
cd scrapper && source venv/bin/activate
```

---

## Releases

### Fetch a single release

```bash
python main.py release 36361759
```

### Force refresh (bypass cache)

```bash
python main.py release 36361759 --force-refresh
```

### Interactive mode — manually pick matches from each service

Useful when the wrong album is matched (e.g. a remaster vs the original, or two albums with the same name):

```bash
python main.py release 36361759 --force-refresh --interactive
```

### Override the search term used across enrichment services

Useful when the Discogs title doesn't match what streaming services call it:

```bash
python main.py release 36361759 --search "Soul Woman"
```

### Override the album artwork with a custom image URL

```bash
python main.py release 36361759 --custom-cover "https://spindizzyrecords.com/cdn/shop/files/soul-woman.jpg"
```

### Fetch artwork from the v1.russ.fm site

```bash
python main.py release 36361759 --v1
```

### Combine options

```bash
python main.py release 36361759 --force-refresh --interactive \
  --search "Soul Woman" \
  --custom-cover "https://example.com/soul-woman.jpg"
```

---

## Artists

### Fetch artist data

```bash
python main.py artist "Michelle David"
```

### Force refresh from all APIs

```bash
python main.py artist "Michelle David" --force-refresh
```

### Interactive mode — manually pick matches from each service

Useful when the wrong artist is matched (e.g. two artists with the same name):

```bash
python main.py artist "Michelle David" --force-refresh --interactive
```

### Fetch artist image from the v1.russ.fm site

```bash
python main.py artist "Michelle David" --v1
```

### Override artist image with a custom URL

```bash
python main.py artist "Michelle David" --custom-image "https://example.com/michelle-david.jpg"
```

### Prefer a specific image source

Valid sources: `apple_music`, `spotify`, `theaudiodb`, `discogs`, `v1`

```bash
python main.py artist "Michelle David" --prefer theaudiodb
```

### Add TheAudioDB data to an existing artist (without re-fetching everything)

```bash
python main.py artist "Michelle David" --theaudiodb
```

### Generate a Perplexity AI biography

Used as a fallback when no biography was found from Wikipedia or TheAudioDB. On a new artist, full enrichment runs first so Perplexity has genre context:

```bash
python main.py artist "Michelle David" --perplexity
```

### Generate a Perplexity biography with extra context

Use `--perplexity-context` when the artist name is ambiguous and Perplexity picks the wrong person:

```bash
python main.py artist "The True Tones" --perplexity \
  --perplexity-context "Dutch gospel/soul duo formed by Michelle David and Elianne Anemaat"
```

### Force-refresh everything and regenerate the Perplexity biography

```bash
python main.py artist "Michelle David" --force-refresh --perplexity
```

---

## Album Descriptions (Perplexity)

### Generate a Perplexity description for a single release

Skips automatically if the release already has an Apple Music or Perplexity description:

```bash
python main.py enrich-description 36361759
```

### Force regeneration even if a description already exists

```bash
python main.py enrich-description 36361759 --force
```

### Force regeneration with context to guide Perplexity

Use `--perplexity-context` when the release name is ambiguous or Perplexity picks the wrong artist/album:

```bash
python main.py enrich-description 36605119 --force \
  --perplexity-context "Dutch gospel/soul duo Michelle David & The True Tones on Record Kicks, released 2026"
```

### Enrich descriptions for a batch of releases

```bash
python main.py enrich-description --batch-size 25
```

### Enrich descriptions starting from a specific release ID

```bash
python main.py enrich-description --from 36361759 --batch-size 25
```

---

## Collection

### Process the entire collection

```bash
python main.py collection
```

### Resume an interrupted run

```bash
python main.py collection --resume
```

### Process a limited number of releases

```bash
python main.py collection --limit 10
```

### Process a specific range (0-based index)

```bash
python main.py collection --from 20 --to 40
```

### Dry run — show what would be processed without doing anything

```bash
python main.py collection --dry-run
```

---

## Backfill Videos

### Preview which releases need videos

```bash
python main.py backfill-videos --dry-run --limit 5
```

### Process a small batch

```bash
python main.py backfill-videos --batch-size 10 --limit 10
```

### Start from a specific release

```bash
python main.py backfill-videos --from 33817755
```

### Re-fetch videos for all releases

```bash
python main.py backfill-videos --force --limit 5
```

### Run unattended with a pause between batches

```bash
python main.py backfill-videos --pause 30
```

### Larger batches with a longer pause

```bash
python main.py backfill-videos --batch-size 50 --pause 60
```

---

## Utilities

### Test all configured API services

```bash
python main.py test
```

### Show database status and processing progress

```bash
python main.py status
```

### Back up the database

```bash
python main.py backup
```

### Back up to a specific file

```bash
python main.py backup --backup-path my_backup.db
```

---

## Global Options

These work with any command:

```bash
# Use a different config file
python main.py --config my_config.json release 36361759

# Enable debug logging
python main.py --log-level DEBUG artist "Michelle David"

# Write logs to a specific file
python main.py --log-file logs/debug.log collection --resume
```

---

## Database Tools

Run from the `scrapper/` directory.

### Search the database

```bash
python -m tools.db_manager search release "Soul Woman"
python -m tools.db_manager search artist "Michelle David"
```

### List recent entries

```bash
python -m tools.db_manager list releases --limit 20
python -m tools.db_manager list artists --sort name
```

### Show database statistics

```bash
python -m tools.db_manager stats
```

### Delete an entry (creates an automatic backup first)

```bash
python -m tools.db_manager delete release 36361759
python -m tools.db_manager delete artist "artist-id" --force
```

### Find artists missing from `public/artist/`

```bash
python -m tools.find_missing_artists
python -m tools.find_missing_artists --export missing_artists.json
```

### Reconcile artist folders with the database

```bash
python -m tools.artist_folder_reconciler --detailed-analysis
python -m tools.artist_folder_reconciler --find-matches --threshold 0.8
python -m tools.artist_folder_reconciler --generate-script create_missing_folders.sh
```
