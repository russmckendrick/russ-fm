# Getting Started

This guide will help you set up russ.fm for local development and data processing.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x or later | Frontend development and build tools |
| pnpm | 8.x or later | Package manager |
| Python | 3.8 or later | Backend data collection |
| Git | Latest | Version control |

### API Credentials

To enrich your collection data, you'll need API access for the following services:

| Service | Required | Purpose | Get Credentials |
|---------|----------|---------|-----------------|
| Discogs | Yes | Primary data source | [discogs.com/developers](https://www.discogs.com/developers) |
| Apple Music | Recommended | Album artwork, editorial notes | [developer.apple.com](https://developer.apple.com/musickit/) |
| Spotify | Recommended | Streaming links, popularity data | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| Last.fm | Recommended | Wiki content, scrobbling | [last.fm/api](https://www.last.fm/api/account/create) |
| Perplexity | Optional | AI-generated descriptions | [perplexity.ai](https://www.perplexity.ai/) |

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/russmckendrick/russ-fm.git
cd russ-fm
```

### 2. Frontend Setup

```bash
# Install Node.js dependencies
pnpm install

# Create environment file (optional - only needed for R2 in production)
cp .env.example .env

# Start development server
pnpm run dev
```

The frontend will be available at `http://localhost:5173`.

### 3. Backend Setup

```bash
# Navigate to the scrapper directory
cd scrapper

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -e .

# Create configuration file
cp config.example.json config.json
```

### 4. Configure API Credentials

Edit `scrapper/config.json` with your API credentials:

```json
{
  "discogs": {
    "access_token": "YOUR_DISCOGS_TOKEN",
    "username": "YOUR_DISCOGS_USERNAME"
  },
  "apple_music": {
    "key_id": "YOUR_KEY_ID",
    "team_id": "YOUR_TEAM_ID",
    "private_key_path": "/path/to/AuthKey.p8"
  },
  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  },
  "lastfm": {
    "api_key": "YOUR_API_KEY"
  },
  "perplexity": {
    "api_key": "YOUR_API_KEY"
  }
}
```

## Quick Start

### Test API Connections

```bash
cd scrapper
source venv/bin/activate
python main.py test
```

Expected output:
```
Testing Discogs... OK
Testing Apple Music... OK
Testing Spotify... OK
Testing Last.fm... OK
Testing Perplexity... OK
```

### Process a Single Album

```bash
# Replace 123456 with a valid Discogs release ID
python main.py release 123456 --save
```

This will:
1. Fetch the release from Discogs
2. Search for matches on Apple Music, Spotify, and Last.fm
3. Download artwork
4. Save enriched data to `public/album/{slug}/`

### Process Your Collection

```bash
# Process all albums in your Discogs collection
python main.py collection

# Resume a previous run (uses cached data)
python main.py collection --resume
```

### View in Frontend

```bash
# In the root directory
pnpm run dev
```

Navigate to `http://localhost:5173` to see your collection.

## Development Workflow

### Frontend Development

```bash
# Start dev server with hot reload
pnpm run dev

# Type checking
pnpm run tsc --noEmit

# Linting
pnpm run lint

# Build for production
pnpm run build
```

### Backend Development

```bash
cd scrapper
source venv/bin/activate

# Process single release with verbose output
python main.py --log-level DEBUG release 123456

# Check processing status
python main.py status

# Backup database before major changes
python main.py backup
```

## Directory Structure After Setup

```
russ-fm/
├── node_modules/           # Frontend dependencies
├── public/
│   ├── collection.json     # Generated album index
│   ├── album/              # Album data and images
│   │   └── {album-slug}/
│   │       ├── index.json
│   │       ├── {album-slug}-hi-res.jpg
│   │       └── {album-slug}-medium.jpg
│   └── artist/             # Artist data and images
│       └── {artist-slug}/
│           ├── index.json
│           └── {artist-slug}-*.jpg
├── scrapper/
│   ├── venv/               # Python virtual environment
│   ├── config.json         # API credentials (not in git)
│   ├── collection_cache.db # SQLite database
│   └── logs/               # Processing logs
└── dist/                   # Production build output
```

## Common Issues

### "No module named 'music_collection_manager'"

Make sure you installed the package in editable mode:
```bash
cd scrapper
pip install -e .
```

### Frontend shows no albums

1. Check that `public/collection.json` exists
2. Ensure album JSON files exist in `public/album/*/`
3. Regenerate the collection index:
   ```bash
   cd scrapper
   python main.py generate-collection
   ```

### API authentication errors

1. Verify credentials in `config.json`
2. Test individual services:
   ```bash
   python main.py test
   ```
3. Check logs in `scrapper/logs/`

### Images not loading

In development, images are served from `/public/`. Ensure:
1. Hi-res images exist (medium/small are generated on-demand in dev mode)
2. Image paths in JSON files are correct

## Next Steps

- [Architecture Overview](../architecture/) - Understand the system design
- [Backend CLI Commands](../backend/cli-commands.md) - Full command reference
- [Frontend Development](../frontend/) - Component and hook documentation
- [Configuration Reference](../development/configuration.md) - All configuration options
