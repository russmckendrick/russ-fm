# Music Collection Manager v2

A modern, well-structured Python tool for managing music collections with data enrichment from multiple sources. This is a complete rewrite of the original Discogs collection management system, following Python best practices and modern architecture patterns.

## Features

- **Multi-Service Integration**: Fetch and enrich data from:
  - **Discogs**: Primary collection source and metadata
  - **Apple Music**: High-resolution artwork and editorial content
  - **Spotify**: Streaming links and popularity data
  - **Wikipedia**: Artist biographies and background information
  - **Last.fm**: Tags, play counts, and social data

- **Single Release Lookup**: Get enriched data for any Discogs release ID
- **Artist Information**: Comprehensive artist data with biographies and external service links
- **Full Collection Processing**: Process your entire Discogs collection with resume capability
- **Robust Error Handling**: Graceful degradation when services are unavailable
- **Rich CLI Interface**: Beautiful command-line interface with progress bars
- **Flexible Configuration**: JSON/YAML config files and environment variables
- **SQLite Database**: Local caching and progress tracking

## Installation

### Prerequisites

- Python 3.8 or higher
- API credentials for the services you want to use

### Install from Source

```bash
git clone <repository-url>
cd discogs-v2
python -m venv venv
source venv/bin/activate  # Unix/macOS
# or: venv\Scripts\activate  # Windows

pip install -r requirements.txt
pip install -e .
```

## Quick Start

### 1. Create Configuration

```bash
# Create example configuration file
python main.py init
# This creates config.example.json

# Copy and edit with your API credentials
cp config.example.json config.json
```

### 2. Configure API Credentials

Edit `config.json` with your API credentials:

#### Discogs (Required)
1. Go to [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Generate a Personal Access Token
3. Add to config: `"access_token": "your_token_here"`

#### Apple Music (Optional)
1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a MusicKit identifier
3. Download the private key (.p8 file)
4. Add to config:
   ```json
   "apple_music": {
     "key_id": "your_key_id",
     "team_id": "your_team_id", 
     "private_key_path": "path/to/your_key.p8"
   }
   ```

#### Spotify (Optional)
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app and get Client ID and Secret
3. Add to config:
   ```json
   "spotify": {
     "client_id": "your_client_id",
     "client_secret": "your_client_secret"
   }
   ```

#### Last.fm (Optional)
1. Get API key from [Last.fm API](https://www.last.fm/api/account/create)
2. Add to config:
   ```json
   "lastfm": {
     "api_key": "your_api_key"
   }
   ```

### 3. Test Your Configuration

```bash
python main.py test
```

## Commands

### Core Commands

#### Single Release Lookup
```bash
# Get data for a specific Discogs release ID
python main.py release 123456

# Save to database
python main.py release 123456 --save

# Output as JSON
python main.py release 123456 --output json

# Use specific services only
python main.py release 123456 --services discogs spotify

# Force refresh (bypass cache)
python main.py release 123456 --force-refresh

# Interactive mode - manually select matches from search results
python main.py release 123456 --force-refresh --interactive

# Override search query for enrichment services
python main.py release 123456 --search "Custom Album Title"

# Override album artwork with custom image URL
python main.py release 123456 --custom-cover "https://example.com/custom-cover.jpg"

# Fetch album artwork from v1.russ.fm site
python main.py release 123456 --v1

# Combine custom search and cover
python main.py release 123456 --force-refresh --interactive --search "Tim's Listening Party Part Two" --custom-cover "https://spindizzyrecords.com/cdn/shop/files/custom-cover.jpg"
```

#### Artist Information
```bash
# Get comprehensive artist data
python main.py artist "The Beatles"

# Save to database
python main.py artist "The Beatles" --save

# Output formats
python main.py artist "The Beatles" --output json
python main.py artist "The Beatles" --output yaml

# Force refresh from APIs
python main.py artist "The Beatles" --force-refresh

# Fetch artist image from v1.russ.fm site
python main.py artist "The Beatles" --v1
```

#### Collection Processing
```bash
# Process entire collection
python main.py collection

# Process with username (if different from config)
python main.py collection --username myuser

# Process with limits
python main.py collection --limit 10

# Process specific range (0-based indexing)
python main.py collection --from 20 --to 40

# Custom batch size
python main.py collection --batch-size 5

# Resume interrupted processing
python main.py collection --resume

# Dry run (show what would be processed)
python main.py collection --dry-run
```

### Utility Commands

#### Test Services
```bash
# Test all configured services
python main.py test
```

#### Database Management
```bash
# Show database status and progress
python main.py status

# Backup database (creates timestamped backup)
python main.py backup

# Backup to specific file
python main.py backup --backup-path my_backup.db
```

#### Configuration
```bash
# Create example configuration
python main.py init

# Create config with custom filename
python main.py init --output my_config.json
```

### Interactive Mode

When automatic matching fails (like "Load" vs "Reload"), use interactive mode:

```bash
# Show search results and manually select correct matches
python main.py release 23599586 --force-refresh --interactive
```

This will display search results from each service in a table format, allowing you to:
- See all available matches with artist, title, year, and type
- Select the correct match by number
- Skip services that don't have the right match
- Ensure accurate data enrichment for tricky cases

Interactive mode is especially useful for:
- Albums with similar names (Load vs Reload, Volume 1 vs Volume 2)
- Remasters vs original releases
- Different regional releases
- Compilation albums vs studio albums

### Advanced Options

#### Custom Search Override

Use `--search` to override the default artist + album search query for enrichment services:

```bash
# When the album title doesn't match what's in streaming services
python main.py release 123456 --search "Tim's Listening Party Part Two"

# For compilations or special releases
python main.py release 123456 --search "Now That's What I Call Music 80s"
```

This is particularly useful for:
- Compilation albums with different titles across services
- Special editions or reissues
- Albums where the Discogs title doesn't match streaming service titles
- Various artist compilations

#### Custom Cover Artwork

Use `--custom-cover` to override album artwork with a custom image URL:

```bash
# Use higher quality artwork from a record store
python main.py release 123456 --custom-cover "https://spindizzyrecords.com/cdn/shop/files/custom-cover.jpg"

# Use signed or special edition artwork
python main.py release 123456 --custom-cover "https://example.com/signed-edition-cover.jpg"
```

This is perfect for:
- Higher quality artwork than available on streaming services
- Special edition covers (signed prints, colored vinyl variants)
- Record store exclusive artwork
- Custom or fan-made artwork
- Correcting incorrect artwork matches

#### V1 Site Integration

Use `--v1` to fetch images from your v1.russ.fm site collection:

```bash
# Fetch release artwork from v1 site
python main.py release 21874351 --v1

# Fetch artist image from v1 site  
python main.py artist "Motörhead" --v1
```

The system automatically:
- Downloads and caches the v1 site index (3,076+ entries)
- Searches by exact Discogs release ID for albums
- Searches by artist name (case-insensitive) for artists
- Handles special characters and URL formatting automatically
- Uses exact image URLs from the v1 site index
- Caches the index for 24 hours to avoid repeated downloads

This is perfect for:
- Using your existing high-quality v1 site images
- Maintaining consistency with your previous collection
- Getting exact matches without URL guessing
- Handling special characters (Motörhead, etc.) correctly

#### Custom Artist Images

Use `--custom-image` to override artist images with a custom image URL:

```bash
# Use higher quality artist photo from a record store
python main.py artist "Claudia Brücken" --custom-image "https://www.russ.fm/artists/claudia-brucken/claudia-brucken.jpg"

# Use official artist photo from band website
python main.py artist "Pink Floyd" --custom-image "https://example.com/official-band-photo.jpg"
```

This is perfect for:
- Higher quality artist photos than available on streaming services
- Official artist photos from band websites
- Professional press photos
- Custom or fan-made artwork
- Correcting incorrect artist image matches

#### Combining Advanced Options

```bash
# Use both custom search and custom cover for maximum control
python main.py release 123456 --force-refresh --interactive \
  --search "Custom Search Term" \
  --custom-cover "https://example.com/custom-cover.jpg"

# Use custom image with artist enrichment
python main.py artist "Claudia Brücken" --force-refresh --interactive \
  --custom-image "https://www.russ.fm/artists/claudia-brucken/claudia-brucken.jpg"

# Use v1 site image for existing collection consistency
python main.py artist "Motörhead" --v1

# Combine v1 with custom options for releases
python main.py release 21874351 --v1 --force-refresh --interactive
```

### Global Options

All commands support these global options:

```bash
# Custom configuration file
python main.py --config my_config.json <command>

# Set logging level
python main.py --log-level DEBUG <command>

# Custom log file
python main.py --log-file logs/debug.log <command>
```

## Configuration

### JSON Configuration Example
```json
{
  "discogs": {
    "access_token": "your_discogs_token",
    "username": "your_username"
  },
  "apple_music": {
    "key_id": "ABC123DEF4",
    "team_id": "DEF456GHI7", 
    "private_key_path": "apple_private_key.p8"
  },
  "spotify": {
    "client_id": "your_spotify_client_id",
    "client_secret": "your_spotify_client_secret"
  },
  "lastfm": {
    "api_key": "your_lastfm_api_key"
  },
  "database": {
    "path": "collection_cache.db"
  },
  "logging": {
    "level": "INFO",
    "file": "logs/music_collection_manager.log"
  }
}
```

### Environment Variables
```bash
export DISCOGS_ACCESS_TOKEN="your_token"
export DISCOGS_USERNAME="your_username"
export APPLE_MUSIC_KEY_ID="your_key_id"
export APPLE_MUSIC_TEAM_ID="your_team_id"
export APPLE_MUSIC_PRIVATE_KEY_PATH="path/to/key.p8"
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_CLIENT_SECRET="your_client_secret"
export LASTFM_API_KEY="your_api_key"
```

## Architecture

The system follows modern Python best practices:

```
music_collection_manager/
├── cli/                    # Command-line interface
├── config/                 # Configuration management
├── models/                 # Data models
├── services/               # API service implementations
│   ├── base/              # Base classes and interfaces
│   ├── discogs/           # Discogs API client
│   ├── apple_music/       # Apple Music API client
│   ├── spotify/           # Spotify API client
│   ├── wikipedia/         # Wikipedia API client
│   └── lastfm/            # Last.fm API client
└── utils/                 # Database and orchestration
```

### Key Features

- **Service-Oriented Architecture**: Each API has its own service class
- **Rate Limiting**: Built-in rate limiting for all services
- **Error Handling**: Graceful degradation and retry logic
- **Data Models**: Proper data classes for type safety
- **Database Caching**: SQLite for local storage and resume capability
- **Logging**: Comprehensive logging with configurable levels
- **Testing**: Built-in service testing and validation

## Database Schema

The SQLite database includes tables for:
- `releases`: Complete release metadata including:
  - Basic info (title, year, country, formats, labels)
  - External service IDs and URLs
  - Enrichment data from all services
  - Date added to collection (from Discogs)
- `artists`: Artist information and biographies  
- `collection_items`: User collection items
- `processing_log`: Processing history and errors

## Development

### Running Tests
```bash
pytest tests/
```

### Code Formatting
```bash
black music_collection_manager/
flake8 music_collection_manager/
```

### Type Checking
```bash
mypy music_collection_manager/
```

## Common Workflows

### Process Your Collection
```bash
# 1. Test your setup
python main.py test

# 2. Start processing with limits
python main.py collection --limit 10

# 3. Resume if interrupted
python main.py collection --resume

# 4. Check progress
python main.py status
```

### Look Up Specific Items
```bash
# Get release data
python main.py release 123456 --save

# Get artist info
python main.py artist "Pink Floyd" --save --output json

# Check what's in database
python main.py status
```

### Backup and Maintenance
```bash
# Regular backup
python main.py backup

# Check database status
python main.py status

# Test services periodically
python main.py test
```

## Troubleshooting

- **Check logs**: Look in `logs/` directory for detailed error information
- **Use debug logging**: Add `--log-level DEBUG` to any command
- **Test services**: Run `python main.py test` to verify API credentials
- **Check database**: Use `python main.py status` to see processing progress
- **Rate limiting**: If you hit API limits, the system will automatically slow down

### Apple Music API Issues

If Apple Music isn't working properly, check these common issues:

1. **JWT Authentication Problems**:
   - Ensure your private key file is in PEM format and readable
   - Verify `key_id`, `team_id`, and `private_key_path` are correct
   - Check that the private key file path is relative to your working directory

2. **API Access Issues**:
   - Verify you have an active Apple Developer Program membership ($99/year)
   - Ensure your MusicKit identifier is properly configured
   - Check that your private key hasn't expired (they're valid for 1 year)

3. **Search Results Problems**:
   - The enhanced search now uses Apple's newer `/search/suggestions` endpoint for better results
   - Interactive mode provides more accurate artist matching
   - Extended attributes provide richer data (editorial videos, formation dates, etc.)

4. **Configuration Validation**:
   ```bash
   # Run the test command for detailed Apple Music diagnostics
   python main.py test
   ```

   This will show specific configuration issues and recommendations for fixing them.

## Migration from v1

If you're migrating from the original script:

1. Backup your existing data: `python main.py backup`
2. Update your configuration to the new format using `python main.py init`
3. Run `python main.py test` to verify setup
4. Process your collection: `python main.py collection`

## License

MIT License - see LICENSE file for details.