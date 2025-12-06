# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern, full-stack music collection management and showcase system with a React frontend displaying enriched Discogs collection data processed by a sophisticated Python backend.

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Python 3.8+ with SQLite caching and multi-API integration
- **Build Tool**: Vite 7.0.0 with React plugin and path aliases
- **Routing**: React Router DOM 7.6.3 (client-side SPA routing)
- **UI Components**: shadcn/ui (Radix UI primitives) + Lucide React icons

## Common Commands

### Frontend Development
```bash
pnpm run dev             # Start development server (http://localhost:5173)
pnpm run build           # TypeScript compilation + Vite build (outputs to dist/)
pnpm run lint            # Run ESLint
pnpm run preview         # Preview production build locally
```

### Backend Data Collection
```bash
cd scrapper
python -m venv venv && source venv/bin/activate  # Setup virtual environment
pip install -r requirements.txt && pip install -e .

# Core commands
python main.py test                    # Test API connections
python main.py collection            # Process entire collection
python main.py collection --resume   # Resume processing with existing cache
python main.py release 123456 --save # Process specific Discogs release
python main.py artist "Artist Name" --save  # Get artist information

# Album description enrichment (Perplexity AI)
python main.py enrich-description --list-missing          # List albums without descriptions
python main.py enrich-description 12345678                # Generate description by Discogs ID
python main.py enrich-description 123,456,789             # Process multiple IDs (comma-separated)
python main.py enrich-description "Album" --artist "Artist"  # Generate by title/artist
python main.py enrich-description 12345678 --dry-run      # Preview without saving
python main.py enrich-description 12345678 --force        # Regenerate existing description
python main.py enrich-description --from 33817755         # Process backwards from ID (pauses every 50)
python main.py enrich-description --from 33817755 --batch-size 25  # Custom batch size

# Maintenance
python main.py backup                 # Backup SQLite database
python main.py status                 # Check processing status
```

### Asset Deployment to R2
```bash
# Quick sync commands
pnpm run build:sync              # Sync all images to Cloudflare R2
pnpm run build:sync:dry          # Preview what would be synced (dry run)
pnpm run build:generate-sync     # Build project and sync in one command

# Targeted sync options
node scripts/sync-to-r2.js --type album                    # Sync only album images
node scripts/sync-to-r2.js --type artist                   # Sync only artist images
node scripts/sync-to-r2.js --size hi-res                   # Sync only hi-res images
node scripts/sync-to-r2.js --size medium                   # Sync only medium images
node scripts/sync-to-r2.js --filter "album-slug-pattern"   # Sync specific album/artist
node scripts/sync-to-r2.js --force                         # Overwrite existing files

# R2 utilities
pnpm run r2:list                # List all files in R2 bucket
pnpm run r2:clean --confirm     # Clean up orphaned files in R2
```

**Environment Setup for R2:**
Ensure `.env` file contains:
```bash
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=russ-fm-assets
R2_PUBLIC_DOMAIN=https://assets.russ.fm
```

### Deployment Pipeline
The project is deployed via GitHub Actions (`.github/workflows/deploy.yml`) on pushes to `main`:

1.  **Assets Job**:
    - Optimizes images (`pnpm run process-images`)
    - Generates album colors (`pnpm run generate-colors`)
    - Creates OG images (`pnpm run generate-og`)
    - Caches results in `node_modules/.cache/assets` for performance

2.  **Deploy Job**:
    - Builds the Vite application
    - Detects changed files using `git diff`
    - Syncs only changed assets to Cloudflare R2 (`scripts/sync-to-r2.js`)
    - Deploys to Cloudflare Workers via Wrangler

## High-Level Architecture

### Data Flow Architecture
1. **Python Backend** (`/scrapper/`) - Orchestrates data collection from multiple APIs
2. **Static JSON Generation** - Creates structured data files in `/public/`
3. **React Frontend** (`/src/`) - Consumes static JSON data for display

### Key Architectural Patterns

**Backend Data Pipeline:**
- **Orchestrator Pattern**: `utils/orchestrator.py` coordinates multi-service data enrichment
- **Service Layer**: Standardized API clients for Discogs, Apple Music, Spotify, Wikipedia, Last.fm, Perplexity AI
- **Database Layer**: SQLite with models for caching and resume capability
- **Configuration Management**: Centralized config with API credentials and processing options

**Frontend SPA Architecture:**
- **Page-Based Routing**: Dedicated pages for Albums, Artists, Search, and Details
- **Component Composition**: Reusable UI components with shadcn/ui base components
- **Static Data Consumption**: All data fetched from `/public/` JSON files
- **Client-Side Navigation**: React Router handles all routing without server roundtrips

### Critical Integration Points

**Data Structure Dependencies:**
- Frontend expects specific JSON schema from backend data generation
- Album slugs must match between collection.json and individual album files
- Image paths follow convention: `{slug}-{size}.jpg` (hi-res, medium, small)

**Routing Configuration:**
- SPA requires server configuration to redirect all routes to `index.html`
- Static file serving must handle `/public/album/` and `/public/artist/` directories
- Vite config includes custom middleware for static file vs route disambiguation

**Multi-Artist Support:**
- Backend handles artist collaboration detection and individual artist creation
- Frontend displays multiple artist avatars and links to individual artist pages
- Special handling for "Various Artists" compilation albums

## Project Structure

```
/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── Navigation.tsx        # Top nav with search integration
│   │   ├── AlbumCard.tsx         # Album display with service links
│   │   └── FilterBar.tsx         # Search/filter/sort controls
│   ├── pages/                    # Route-level components
│   ├── hooks/                    # Custom React hooks
│   ├── config/app.config.ts      # App configuration (pagination, external URLs)
│   └── lib/                      # Utilities (className merging, genre filtering)
├── scrapper/                     # Python data collection engine
│   ├── music_collection_manager/ # Core Python package
│   │   ├── services/             # API service implementations
│   │   ├── utils/               # Orchestration and database management
│   │   └── models/              # Data models and serialization
│   ├── main.py                  # CLI entry point
│   └── config.json              # API credentials (not in git)
└── public/                      # Generated static data
    ├── collection.json          # Main collection index
    ├── album/{slug}/           # Individual album data and images
    └── artist/{slug}/          # Individual artist data and images
```

## Important Implementation Details

### Build and Development Workflow
- **Frontend-only changes**: Use `pnpm run dev` for hot reload development
- **Data changes**: Run backend processing, then refresh frontend to see updates
- **TypeScript**: Strict mode enabled with path aliases (`@` → `./src`)
- **Linting**: ESLint configured for React 19 + TypeScript with modern rules

### Data Processing Workflow
- **Resume Capability**: SQLite database tracks processing state for large collections
- **Multi-Service Enrichment**: Combines data from 6+ music APIs with intelligent matching
- **Image Management**: Downloads and resizes images to 3 different resolutions
- **Artist Orchestration**: Complex logic for handling multi-artist albums and collaborations
- **AI Description Fallback**: Perplexity AI generates album descriptions when Apple Music/Last.fm descriptions are unavailable

### Frontend Routing and Data Patterns
- **Static Data Loading**: All API calls use `fetch()` to load JSON from `/public/`
- **URL Structure**: `/album/{slug}` and `/artist/{slug}` with client-side routing
- **Legacy URL Handling**: Old `/albums/{album-slug}` URLs automatically redirect to `/album/{album-slug}` via AlbumsPage component logic
- **Search Integration**: Real-time search with overlay results across multiple data types
- **Responsive Design**: Mobile-first with Tailwind responsive utilities

### Configuration Management
- **Frontend Config**: `src/config/app.config.ts` for pagination, features, external URLs
- **Backend Config**: `scrapper/config.json` for API credentials (use `config.example.json` as template)
- **Build Config**: Vite configuration with React plugin and static file handling middleware

## Key Technical Considerations

### Database and Caching Strategy
- SQLite database in `scrapper/collection_cache.db` maintains processing state
- Resume capability allows processing large collections incrementally
- Comprehensive logging in `scrapper/logs/` for debugging data processing issues

### Multi-Artist Album Handling
- Backend detects collaborations and creates individual artist entries
- Frontend displays artist avatars and handles navigation to individual artist pages
- Special filtering logic excludes "Various Artists" from artist listings

### Image and Asset Management
- **🚨 CRITICAL: Available image sizes**: ONLY `'hi-res'` (1400px) and `'medium'` (800px) exist in the data!
- **❌ 'small' (400px) size does NOT exist** - never use this size or it will break images!
- **Artist avatars**: Square format images for artist thumbnails (`'avatar'`)
- Images stored in structured directories: `/public/album/{slug}/` and `/public/artist/{slug}/`
- Frontend components select appropriate image size based on display context

**🚨 CRITICAL: Actual Data Structure (`/public/collection.json`):**
```json
"images_uri_release": {
  "hi-res": "/album/album-name/album-name-hi-res.jpg",
  "medium": "/album/album-name/album-name-medium.jpg"
  // NO 'small' size exists!
}
```

**🚨 CRITICAL: Image Utility Functions** (`src/lib/image-utils.ts`):

**⚠️ NEVER USE DIRECT IMAGE PATHS IN FRONTEND COMPONENTS! ⚠️**
**ALWAYS use these utility functions for ALL image rendering:**

- `getImageUrl(relativePath)` - Handles dev/prod environment differences (local vs R2 CDN)
- `getAlbumImageUrl(albumSlug, size)` - Constructs album image URLs with proper sizing
  - `size` parameter: `'hi-res' | 'medium'` ONLY (defaults to `'medium'`) - **NEVER use 'small'!**
- `getArtistImageUrl(artistSlug, size)` - Constructs artist image URLs with proper sizing
  - `size` parameter: `'hi-res' | 'medium'` ONLY (defaults to `'medium'`) - **NEVER use 'small'!**
- `getArtistAvatarUrl(artistSlug)` - Gets artist avatar (small square format, always `'avatar'` size)
- `getAlbumImageFromData(uriRelease, size)` - Extracts slug from URI and gets album image
- `getArtistImageFromData(uriArtist, size)` - Extracts slug from URI and gets artist image
- `handleImageError()` - Provides fallback logic for broken images

**❌ NEVER DO THIS:**
```jsx
<img src="/album/some-album/image.jpg" />
<img src={album.images_uri_release['hi-res']} />
<img src={getAlbumImageFromData(album.uri_release, 'small')} /> // 'small' BREAKS IMAGES!
srcSet={`${getAlbumImageFromData(album.uri_release, 'small')} 400w`} // 'small' BREAKS IMAGES!
```

**✅ ALWAYS DO THIS:**
```jsx
<img src={getAlbumImageFromData(album.uri_release, 'hi-res')} />
<img src={getAlbumImageFromData(album.uri_release, 'medium')} />
<img src={getArtistImageFromData(artist.uri_artist, 'medium')} />
// NO srcSet needed - only 2 sizes exist: 'hi-res' and 'medium'
```

**WHY:** These functions handle environment differences (dev vs prod), R2 CDN routing, fallbacks, and ensure images work correctly in production deployments.

### Album Description Enrichment (Perplexity AI)

The system uses Perplexity AI as a fallback to generate album descriptions when Apple Music editorial notes and Last.fm wiki content are unavailable.

**How it works:**
1. During normal collection processing, after fetching Apple Music and Last.fm data
2. If no description is found from either source, Perplexity AI is called
3. Perplexity generates a 2-3 paragraph description using rich context (artist, album, year, genres, labels)
4. The description is stored in `raw_data.services.perplexity.description`

**Frontend fallback chain** (`src/pages/AlbumDetailPage.tsx`):
```typescript
// Description sources checked in order (longest wins):
1. Apple Music editorial notes (short)
2. Apple Music editorial notes (standard)
3. Apple Music editorial_notes field
4. Last.fm wiki_summary
5. Last.fm wiki_content
6. Perplexity AI description  // Fallback
```

**Configuration** (`scrapper/config.json`):
```json
"perplexity": {
  "api_key": "YOUR_PERPLEXITY_API_KEY",
  "model": "sonar",
  "rate_limit": 20
}
```

**Retroactive enrichment:**
Use `enrich-description` command to add descriptions to existing releases:
- Updates both SQLite database AND JSON files in `/public/album/{slug}/`
- Use `--list-missing` to find releases without descriptions
- Use `--dry-run` to preview without saving

### Error Handling and Fallbacks
- Comprehensive fallback systems for missing data, images, and service failures
- Backend includes retry logic and graceful degradation for API failures
- Frontend handles missing data gracefully with placeholder content

### Performance Optimization
- Static JSON files enable fast loading and CDN caching
- Client-side routing eliminates server roundtrips for navigation
- Lazy loading and image optimization for large collections
- Configurable pagination to manage large dataset rendering

**Build-time Color Extraction:**
- `pnpm run generate-colors` - Extracts dominant colors from album covers during build
- Generates `/public/album-colors.css` (CSS custom properties) and `/public/album-colors.json` (JS data)
- Eliminates runtime image processing and CORS issues
- Colors used in HomePage hero section for dynamic theming

This architecture demonstrates clean separation between data collection and presentation, with robust error handling and comprehensive tooling for both development and production deployment.