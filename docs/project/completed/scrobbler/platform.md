# Russ FM Scrobbler Integration Platform

## Integration Architecture Overview

This document outlines how to integrate the Last.fm scrobbling functionality into the existing Russ FM platform. Both systems are **Cloudflare Workers** applications, making integration seamless and maintaining edge computing benefits.

## Current Architecture Analysis

### Russ FM (Current)
- **Runtime**: Cloudflare Workers with Workers Assets
- **Frontend**: React 19 + TypeScript + Vite (served as static assets)
- **Backend**: Simple worker handling SPA routing + Python data collection
- **Storage**: Static JSON files + optional R2 for images
- **Data Flow**: Python generates static JSON → React consumes static data

### Scrobbler (To Integrate)
- **Runtime**: Cloudflare Workers with dynamic API endpoints
- **Frontend**: Bootstrap + vanilla JavaScript (will replace with React integration)
- **Storage**: Cloudflare KV for session management
- **APIs**: Last.fm OAuth, scrobbling, Discogs search
- **Features**: Authentication, track/album scrobbling, search integration

## Integration Strategy

### Extend Existing Worker

The current `_worker.js` will be enhanced to include scrobbling API endpoints while maintaining existing SPA routing functionality.

#### Enhanced Worker Structure

```javascript
// Enhanced _worker.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Route scrobbling API requests
    if (url.pathname.startsWith('/api/scrobble/')) {
      return handleScrobbleAPI(request, env);
    }
    
    // Route authentication requests  
    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuthAPI(request, env);
    }
    
    // Existing static asset + SPA routing logic
    return handleStaticAssets(request, env);
  }
};
```

#### New Worker Components

```
_worker.js                    # Enhanced main worker
src/worker/                   # Worker-specific modules
├── handlers/
│   ├── auth.js              # Last.fm OAuth flow
│   ├── scrobble.js          # Track/album scrobbling
│   └── search.js            # Discogs/Last.fm search (optional)
├── utils/
│   ├── lastfm.js            # Last.fm API utilities
│   ├── sessions.js          # KV session management
│   └── cors.js              # CORS handling
└── config/
    └── constants.js         # API keys, rate limits
```

### Frontend Integration (React)

The existing React components will be enhanced with scrobbling functionality, maintaining the current shadcn/ui design system.

#### New React Components

```
src/
├── components/
│   ├── ScrobbleButton.tsx         # Track/album scrobble button (shadcn/ui)
│   ├── ScrobbleProgress.tsx       # Real-time progress indicator
│   ├── LastFmAuthDialog.tsx      # Authentication modal (shadcn Dialog)
│   ├── UserProfileMenu.tsx       # Enhanced user menu with Last.fm status
│   └── ScrobbleToast.tsx         # Success/error notifications
├── hooks/
│   ├── useLastFmAuth.ts          # Authentication state management
│   ├── useScrobble.ts            # Scrobbling operations with React Query
│   └── useScrobbleStatus.ts      # Real-time scrobbling status
├── services/
│   └── scrobbleApi.ts            # Worker API communication
└── types/
    └── scrobble.ts               # TypeScript interfaces
```

#### Enhanced UI Integration

1. **Album Detail Pages**: Scrobble buttons integrated with existing track listings
2. **Album Cards**: Quick-scrobble action alongside existing service links  
3. **Navigation**: Last.fm authentication status in user menu
4. **Notifications**: Toast notifications for scrobbling status using existing toast system

## Technical Implementation Details

### Worker API Endpoints

The enhanced worker will provide these API endpoints:

```javascript
// Authentication endpoints
POST /api/auth/login              # Initiate Last.fm OAuth flow
GET  /api/auth/callback           # Handle OAuth callback
GET  /api/auth/status             # Check authentication status  
POST /api/auth/logout             # Destroy session
POST /api/auth/refresh-artwork    # Update user's latest album artwork

// Scrobbling endpoints
POST /api/scrobble/track          # Scrobble individual track
POST /api/scrobble/album          # Scrobble entire album with staggered timestamps
GET  /api/scrobble/status/{jobId} # Check bulk scrobbling progress

// Search endpoints (optional - enhance existing data)
GET  /api/search/lastfm           # Last.fm album search
GET  /api/search/lastfm/album     # Get Last.fm album details
```

### Cloudflare KV Data Models

Session and user data will be stored in Cloudflare KV:

```javascript
// Session storage in KV
const sessionData = {
  type: 'authenticated',
  username: 'lastfm-username',
  sessionKey: 'lastfm-session-key', 
  userInfo: {
    // Full Last.fm user object
    playcount: 12345,
    registered: { unixtime: '1234567890' },
    url: 'https://last.fm/user/username'
  },
  lastAlbumArt: 'https://...', // User's latest scrobbled album art
  created: Date.now(),
  expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
};

// Scrobble history (optional - for recent activity)
const scrobbleHistory = {
  userId: 'session-id',
  scrobbles: [
    {
      artist: 'Artist Name',
      album: 'Album Title', 
      track: 'Track Title',
      timestamp: Date.now(),
      status: 'success' // success, failed, pending
    }
  ]
};
```

### Frontend State Management

Using React Query for API state management and React Context for authentication:

```typescript
// Authentication context
interface LastFmAuthContext {
  isAuthenticated: boolean;
  username: string | null;
  userInfo: LastFmUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

// Scrobbling hook with React Query
const useScrobble = () => {
  const scrobbleTrack = useMutation({
    mutationFn: async ({ artist, album, track }: ScrobbleRequest) => {
      return scrobbleApi.scrobbleTrack({ artist, album, track });
    },
    onSuccess: () => {
      toast.success('Track scrobbled successfully!');
    },
    onError: (error) => {
      toast.error(`Scrobbling failed: ${error.message}`);
    }
  });
  
  return { scrobbleTrack, isScrobbling: scrobbleTrack.isPending };
};
```

## Integration with Existing Features

### Enhanced Album Cards

Seamless integration with current album display components:

```typescript
// Enhanced AlbumCard with scrobbling
const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const { isAuthenticated } = useLastFmAuth();
  const { scrobbleAlbum } = useScrobble();
  
  return (
    <Card className="album-card">
      {/* Existing album artwork and info */}
      <CardContent>
        <div className="flex items-center justify-between">
          {/* Existing service links */}
          <div className="service-links">
            {/* Spotify, Apple Music, etc. */}
          </div>
          
          {/* New scrobbling action */}
          {isAuthenticated && (
            <ScrobbleButton 
              album={album}
              variant="ghost"
              size="sm"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

### Enhanced Navigation

Last.fm authentication integrated into existing navigation:

```typescript
// Enhanced Navigation with auth status
const Navigation: React.FC = () => {
  const { isAuthenticated, username, userInfo } = useLastFmAuth();
  
  return (
    <nav className="top-navigation">
      {/* Existing navigation items */}
      <div className="flex items-center gap-4">
        <SearchInput /> {/* Existing search */}
        
        {/* New Last.fm user menu */}
        {isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Music className="h-4 w-4" />
                {username}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                {userInfo?.playcount} plays
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <LastFmAuthButton />
        )}
      </div>
    </nav>
  );
};
```

## Cloudflare Configuration Updates

### Enhanced wrangler.toml

```toml
name = "russ-fm"
compatibility_date = "2024-03-01" 
main = "./_worker.js"

# Workers Assets (existing)
[assets]
directory = "./dist-worker"
binding = "ASSETS"

# KV Namespace for scrobbling sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "your-sessions-namespace-id"
preview_id = "your-preview-sessions-namespace-id"

# Environment variables
[vars]
ENVIRONMENT = "production"
ALLOWED_ORIGINS = "https://russ.fm,https://preview.russ.fm"

# Production environment
[env.production]
vars = { ENVIRONMENT = "production" }
```

### Required Secrets

```bash
# Set via wrangler secret put
wrangler secret put LASTFM_API_KEY      # Last.fm API key
wrangler secret put LASTFM_SECRET       # Last.fm shared secret  
wrangler secret put DISCOGS_API_KEY     # Optional: for enhanced search
```

## Security Considerations

### Session Security
- Store session keys securely in Cloudflare KV with TTL
- Use secure HTTP-only cookies for session management
- Implement SameSite=Strict for CSRF protection
- Automatic session cleanup via KV expiration

### API Security
- Rate limiting using Cloudflare Workers built-in limits
- Validate all requests against stored sessions
- Server-side API key storage (Cloudflare secrets)
- MD5 signature validation for Last.fm API calls

### CORS Configuration
- Dynamic origin validation for development/production
- Proper preflight handling for cross-origin requests
- Environment-specific allowed origins configuration

## Performance Considerations

### Edge Computing Benefits
- Global distribution via Cloudflare's edge network
- Sub-100ms response times worldwide
- Automatic scaling with zero cold starts
- KV storage replication across edge locations

### Caching Strategy
- Cache Last.fm responses in KV with appropriate TTL
- Static assets served with aggressive caching headers
- Session data cached at edge for fast authentication checks

### Rate Limiting & Optimization
- Respect Last.fm API limits (5 requests/second)
- Implement exponential backoff for failed requests
- Batch scrobbling operations efficiently
- Minimal dependencies to reduce bundle size

## Development Workflow Integration

### Enhanced Build Process

```bash
# Build worker with scrobbling functionality
npm run build:worker                     # Build enhanced worker
npm run dev:worker                       # Local development with wrangler

# Frontend development (existing + scrobbling)
npm run dev                              # Vite dev server
npm run build                           # Build React app to dist-worker/
npm run test                            # Jest tests including scrobbling components

# Deployment
npm run deploy                          # Deploy to Cloudflare Workers
wrangler kv:namespace create "SESSIONS" # Create KV namespace
```

### Testing Strategy
- Unit tests for worker handlers and utilities
- React component testing with MSW for API mocking
- Integration tests for authentication flow
- End-to-end testing with Playwright

### Python Backend Integration
The existing Python data collection remains unchanged:

```bash
# Existing data collection workflow
cd scrapper
python main.py collection               # Generate static JSON data
python main.py collection --resume      # Resume processing
```

The Python backend generates static data consumed by React, while the enhanced Worker provides dynamic scrobbling functionality.

## Benefits of This Integration

### Seamless User Experience
- Scrobbling feels native to existing interface
- No additional authentication systems to manage
- Consistent design language using shadcn/ui
- Progressive enhancement - works without JavaScript

### Technical Advantages
- Maintains existing architecture patterns
- Leverages Cloudflare's global edge network
- No additional infrastructure required
- Automatic scaling and reliability
- Fast API responses from edge locations

### Development Benefits
- Familiar React/TypeScript development patterns
- Existing build and deployment workflows
- Type safety across frontend and API layer
- Easy testing and debugging with Wrangler dev mode

This integration approach extends the current Russ FM platform with powerful scrobbling capabilities while maintaining the elegant simplicity and performance of the existing Cloudflare Workers architecture.