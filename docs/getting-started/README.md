# Getting Started

This guide will help you set up russ.fm for local development and data processing.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x or later | Frontend development and build tools |
| pnpm | 8.x or later | Package manager |
| Rust | Latest stable (via rustup) | Backend data collection |
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

The backend is a Rust TUI/CLI binary. Install it once and it runs from any directory.

```bash
# Navigate to the scrapper directory
cd scrapper

# Build and install the `scrapper` binary to ~/.cargo/bin
# This also writes ~/.config/scrapper/config.json pointing at this folder,
# so the `scrapper` command works from anywhere.
./install.sh

# Create configuration file
cp config.example.json config.json
```

To run against the source without installing, use `cargo run -- <cmd>` from inside `scrapper/` instead of the installed `scrapper` command.

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
scrapper test
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
scrapper release 123456 --save
```

This will:
1. Fetch the release from Discogs
2. Search for matches on Apple Music, Spotify, and Last.fm
3. Download artwork
4. Save enriched data to `public/album/{slug}/`

### Process Your Collection

```bash
# Process all albums in your Discogs collection (headless)
scrapper collection

# Resume a previous run (uses cached data)
scrapper collection --resume

# Drop into the interactive TUI instead of running headless
scrapper collection --interactive
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
# Process single release with verbose output
scrapper --log-level DEBUG release 123456

# Check processing status
scrapper status

# Backup database before major changes
scrapper backup
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
│   ├── config.json         # API credentials (not in git)
│   ├── collection_cache.db # SQLite database
│   └── logs/               # Processing logs
└── dist/                   # Production build output
```

## Common Issues

### `scrapper: command not found`

Make sure the binary was installed and `~/.cargo/bin` is on your `PATH`:
```bash
cd scrapper
./install.sh
```
Until installed, you can run the backend from source with `cargo run -- <cmd>` inside `scrapper/`.

### Frontend shows no albums

1. Check that `public/collection.json` exists
2. Ensure album JSON files exist in `public/album/*/`
3. Regenerate the collection index:
   ```bash
   scrapper generate-collection
   ```

### API authentication errors

1. Verify credentials in `config.json`
2. Test individual services:
   ```bash
   scrapper test
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
