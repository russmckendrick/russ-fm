# Data Collection Engine

The **Core Data Scrapper** (`scrapper/`) is a comprehensive Python application designed to enrich your Discogs collection with high-quality metadata from multiple sources. It serves as the "backend" of the Russ.fm project, generating the static data consumed by the frontend.

## Overview

The scrapper operates on a simple principle: **enrichment pipelines**. For each release in your Discogs collection, it:
1.  Fetches base metadata from **Discogs**.
2.  Searches for the album on **Apple Music** and **Spotify** to find streaming links and high-res artwork.
3.  Queries **Last.fm** for play counts, tags, and wiki summaries.
4.  Scrapes **Wikipedia** for artist biographies.
5.  Uses **Perplexity AI** (optional) to generate detailed album descriptions if other sources fail.
6.  Saves the consolidated data to the local SQLite cache and generates static JSON files.

## CLI Usage

The primary interface is the `main.py` script.

### Collection Management

Processing your entire collection is robust and resumable.

```bash
# Process full collection (resumes automatically if interrupted)
python main.py collection

# Process specific range (useful for testing or debugging)
python main.py collection --from 20 --to 40

# Limit the number of items to process
python main.py collection --limit 10

# Resume explicitly
python main.py collection --resume
```

### Single Release Operations

You can work with individual releases using their Discogs ID. This is perfect for fixing specific albums or adding new purchases immediately.

```bash
# Process and save a single release
python main.py release 123456 --save

# Force refresh (bypass all caches)
python main.py release 123456 --force-refresh --save

# Interactive Mode (Resolve ambiguous matches)
python main.py release 123456 --interactive
```

**Interactive Mode** displays search results from enrichment services (Apple Music, Spotify) and lets you manually select the correct match. This is crucial for albums with generic titles (e.g., "Greatest Hits") or multiple versions.

### Artist Operations

Managing artist data is separate but related to releases.

```bash
# Fetch and save artist info
python main.py artist "Pink Floyd" --save

# Force refresh artist data
python main.py artist "Pink Floyd" --force-refresh
```

## Advanced Enrichment

Sometimes automated matching isn't enough. The CLI provides overrides to ensure your collection looks perfect.

### Custom Metadata Overrides

```bash
# Override search term for finding the album on streaming services
python main.py release 123456 --search "Alternative Album Title"

# Force a specific custom cover image URL
python main.py release 123456 --custom-cover "https://example.com/custom-cover.jpg"

# Force a specific artist image
python main.py artist "Artist Name" --custom-image "https://example.com/photo.jpg"
```

### V1 Migration Support

If you are migrating from the previous version of this project (`v1.russ.fm`), you can pull existing image assets to maintain consistency.

```bash
# Use artwork from v1 site
python main.py release 123456 --v1
python main.py artist "Artist Name" --v1
```

## AI Description Generation

We integrate with **Perplexity AI** to generate rich, context-aware album descriptions when standard editorial content is missing.

```bash
# Generate description for a specific release
python main.py enrich-description 12345678

# List releases taking advantage of AI descriptions
python main.py enrich-description --list-missing
```

See `CLAUDE.md` for more details on the enrichment fallback chain.

## Configuration

Configuration is managed via `scrapper/config.json`.

```json
{
  "discogs": {
    "access_token": "REQUIRED",
    "username": "REQUIRED"
  },
  "apple_music": {
    "key_id": "OPTIONAL",
    "team_id": "OPTIONAL",
    "private_key_path": "auth_key.p8"
  },
  "perplexity": {
    "api_key": "OPTIONAL",
    "model": "sonar"
  }
}
```

*Note: While Discogs is required, other services are optional. The system will gracefully skip services if credentials are not provided.*
