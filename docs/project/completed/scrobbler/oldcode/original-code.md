# Russ FM Scrobbler Platform Documentation

## Overview

The Russ FM Scrobbler is a Cloudflare Workers-based web application that enables users to search for music albums on Discogs and scrobble them to Last.fm. The platform provides both a full web interface and an embeddable popup widget for external integration.

## Architecture

### Technology Stack
- **Runtime**: Cloudflare Workers (Edge Computing)
- **Language**: JavaScript (ES6+)
- **Storage**: Cloudflare KV (Key-Value) store for session management
- **Frontend**: Bootstrap 5.3.0 with custom CSS and vanilla JavaScript
- **External APIs**: Discogs API and Last.fm API
- **Dependencies**: crypto-js for API signatures

### Core Components

```
/src/
├── worker.js              # Main entry point and request router
├── handlers/
│   ├── auth.js           # Last.fm OAuth authentication flow
│   ├── search.js         # Album search functionality (Discogs/Last.fm)
│   └── scrobble.js       # Track/album scrobbling to Last.fm
├── utils/
│   ├── lastfm.js         # Last.fm API utilities and signature generation
│   └── static.js         # Static file serving
├── static/               # Frontend assets (HTML, CSS, JS as modules)
└── config/               # Configuration files
```

## Authentication System

### Last.fm OAuth Flow
1. **Login Initiation**: User clicks login → generates session ID → redirects to Last.fm authorization
2. **Callback Handling**: Last.fm returns with token → exchanges for session key → stores user data
3. **Session Management**: 24-hour sessions stored in Cloudflare KV with HttpOnly cookies
4. **Security Features**: CORS protection, SameSite cookies, signature validation

### Session Data Structure
```javascript
{
  type: 'authenticated',
  username: 'string',
  sessionKey: 'string',
  userInfo: {/* Full Last.fm user object */},
  lastAlbumArt: 'url',
  created: timestamp
}
```

## API Endpoints

### Authentication Endpoints
- `POST /api/auth/login` - Initiate Last.fm OAuth flow
- `GET /api/auth/callback` - Handle OAuth callback and create session
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/logout` - Destroy session
- `POST /api/auth/refresh-artwork` - Update user's latest album artwork

### Search Endpoints
- `GET /api/search/discogs` - Search Discogs by release ID or artist/album
- `GET /api/search/discogs/release/{id}` - Get detailed Discogs release info
- `GET /api/search/lastfm` - Search Last.fm albums
- `GET /api/search/lastfm/album` - Get Last.fm album details

### Scrobbling Endpoints
- `POST /api/scrobble/track` - Scrobble individual track
- `POST /api/scrobble/album` - Scrobble entire album with staggered timestamps

### Configuration
- `GET /api/config/example-searches` - Get example album suggestions

## Data Sources Integration

### Discogs API
- **Authentication**: API key/secret headers
- **Capabilities**: Release lookup by ID, artist/album search, detailed metadata
- **Rate Limiting**: 60 requests/minute
- **Data**: Comprehensive vinyl/CD release information, tracklists, artwork

### Last.fm API  
- **Authentication**: OAuth-style flow with MD5 signatures
- **Capabilities**: Album search, user info, scrobbling, recent tracks
- **Rate Limiting**: 5 requests/second
- **Data**: Play counts, user statistics, album metadata

### Data Transformation
Both APIs return data in a unified format:
```javascript
{
  id: 'string',
  title: 'string',
  artists: [{ name: 'string' }],
  year: 'number',
  tracklist: [{ position: 'string', title: 'string', duration: 'string' }],
  images: [{ uri: 'url', uri150: 'url' }],
  // API-specific fields preserved
}
```

## Frontend Architecture

### Main Application
- **Framework**: Bootstrap 5.3.0 with custom branding
- **State Management**: Class-based (`ScrobblerApp`) with direct DOM manipulation
- **Features**: 
  - Smart search input parsing (URLs, IDs, artist/album)
  - Direct album URLs (`/albums/{id}/`)
  - User profile with dynamic backgrounds
  - Responsive design with mobile optimization

### Embed Feature
- **Purpose**: Popup widget for external site integration
- **Flow**: Authentication check → album fetch → auto-scrobble → auto-close
- **UI**: Minimal card-based design with gradient background
- **Integration**: Self-contained with CORS support

## Security Implementation

### CORS Configuration
- Dynamic origin validation based on `ALLOWED_ORIGINS_STRING`
- Proper preflight handling
- Environment-specific allowed origins

### Cookie Security
- HttpOnly to prevent XSS
- Secure flag for production (HTTPS)
- SameSite=Strict to prevent CSRF
- 24-hour expiration

### API Security
- Server-side API key storage (Cloudflare secrets)
- MD5 signature validation for Last.fm requests
- Session-based authentication for scrobbling endpoints

## Configuration Management

### Environment Variables
```javascript
// Required Secrets (set via wrangler secret)
LASTFM_API_KEY     // Last.fm API key
LASTFM_SECRET      // Last.fm shared secret
DISCOGS_API_KEY    // Discogs API key
DISCOGS_SECRET     // Discogs API secret (optional)

// Environment Variables
ENVIRONMENT        // "development" or "production"
ALLOWED_ORIGINS_STRING // Comma-separated CORS origins

// KV Namespace Bindings
SESSIONS          // Session storage namespace
```

### Deployment Configuration (wrangler.toml)
```toml
name = "russ-fm-scrobbler"
main = "src/worker.js"
compatibility_date = "2023-05-18"

[[kv_namespaces]]
binding = "SESSIONS"
preview_id = "preview-namespace-id"
id = "production-namespace-id"
```

## Key Features

### Search Functionality
1. **Discogs Integration**: Direct release ID lookup or artist/album search
2. **Last.fm Integration**: Album search with play statistics
3. **Smart Input Parsing**: Handles URLs, IDs, and search terms
4. **Example Suggestions**: Pre-configured popular albums for discovery

### Scrobbling
1. **Individual Tracks**: Single track scrobbling with custom timestamps
2. **Full Albums**: Bulk scrobbling with realistic listening simulation (3-minute intervals)
3. **Progress Tracking**: Real-time feedback on scrobbling status
4. **Error Handling**: Graceful failure with detailed error messages

### User Experience
1. **Responsive Design**: Mobile-first with desktop enhancements
2. **Brand Integration**: Custom logos and color schemes
3. **Progressive Enhancement**: Works without JavaScript for basic functionality
4. **Direct Linking**: Shareable album URLs

## Development Workflow

### Local Development
```bash
npm install
npm run dev    # Starts local server at http://localhost:8787
```

### Deployment
```bash
npm run deploy  # Deploys to Cloudflare Workers
```

### Secret Management
```bash
wrangler secret put LASTFM_API_KEY
wrangler secret put LASTFM_SECRET
wrangler secret put DISCOGS_API_KEY
```

## Error Handling and Monitoring

### Frontend Error Handling
- User-friendly error messages
- Loading states with animated indicators
- Graceful fallbacks for missing data
- Auto-retry for temporary failures

### Backend Error Handling
- Standardized HTTP status codes
- Detailed error logging
- Rate limiting detection and reporting
- Session validation and cleanup

### Monitoring Considerations
- Request logging through Cloudflare Workers analytics
- Error tracking via console.log statements
- Session usage tracking in KV storage
- API rate limit monitoring

## Performance Optimizations

### Edge Computing Benefits
- Global distribution via Cloudflare's edge network
- Sub-100ms response times worldwide
- Automatic scaling with zero cold starts

### Caching Strategy
- Static assets served with aggressive caching headers
- API responses cached where appropriate
- Session data stored in fast KV storage

### Code Optimization
- Minimal dependencies (only crypto-js)
- Tree-shaken JavaScript bundles
- Optimized API calls with batch operations

## Migration and Extensibility

### For Platform Migration
1. **Database Migration**: Replace KV storage with preferred database
2. **Authentication**: Adapt OAuth flow to new environment
3. **API Integration**: Port Discogs/Last.fm integration logic
4. **Frontend**: Static assets can be served by any web server
5. **Configuration**: Migrate environment variables and secrets

### Extensibility Points
1. **Additional Music Sources**: Spotify, Apple Music, Bandcamp APIs
2. **Enhanced Scrobbling**: Playlist imports, bulk operations
3. **Social Features**: User sharing, recommendations
4. **Analytics**: Listening statistics, discovery tracking
5. **Mobile App**: API ready for native mobile clients

### Simplification Opportunities
1. **Remove Embed Feature**: If not needed, simplifies CORS and authentication
2. **Single Music Source**: Choose either Discogs or Last.fm to reduce complexity
3. **Simplified Authentication**: Remove OAuth for API-key only access
4. **Static Hosting**: Convert to static site with client-side API calls

## Dependencies and External Services

### Critical Dependencies
- **crypto-js**: Required for Last.fm API signatures (can be replaced with native crypto)
- **Bootstrap 5**: UI framework (can be replaced with custom CSS)
- **Cloudflare Workers Runtime**: Core platform (needs replacement for migration)

### External Service Dependencies
- **Last.fm API**: Core functionality for scrobbling
- **Discogs API**: Music metadata and search
- **Cloudflare KV**: Session storage (needs database replacement)

This documentation provides a complete technical overview for migrating the platform to a different codebase while maintaining all functionality and providing opportunities for streamlining based on specific requirements.