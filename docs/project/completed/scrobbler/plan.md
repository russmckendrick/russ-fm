# Russ FM Scrobbler Implementation Plan

## 🎯 Implementation Status

- **Phase 1: Worker Enhancement & Authentication** - ✅ **COMPLETED** (January 2025)
- **Phase 2: React Integration & UI Components** - ✅ **COMPONENTS READY** (Ready for testing)
- **Phase 3: Enhanced Features Using Proven APIs** - ✅ **COMPONENTS READY** (Ready for testing)
- **Phase 4: Advanced Features & Polish** - 📋 **PLANNED**

## Implementation Phases

This plan outlines integrating Last.fm scrobbling into the existing Russ FM Cloudflare Workers platform. Since both systems use the same technology stack, integration will be seamless and performant.

### 📦 **Files Successfully Created & Integrated:**
- `src/worker/handlers/auth.js` - Complete OAuth flow
- `src/worker/handlers/scrobble.js` - Track & album scrobbling  
- `src/worker/handlers/search.js` - Discogs/Last.fm search
- `src/worker/utils/lastfm.js` - MD5 signatures & utilities
- `src/worker/utils/cors.js` - Dynamic CORS handling
- `src/components/LastFmAuthDialog.tsx` - Auth modal
- `src/components/ScrobbleButton.tsx` - Individual track scrobbling
- `src/components/ScrobbleProgress.tsx` - Album scrobbling with progress
- `src/components/UserProfileMenu.tsx` - User profile with Last.fm stats
- `src/hooks/useLastFmAuth.ts` - Authentication state management
- `src/hooks/useScrobble.ts` - Scrobbling operations
- `src/services/scrobbleApi.ts` - API client layer
- `src/types/scrobble.ts` - TypeScript interfaces
- `_worker.js` - Enhanced with API routing
- `wrangler.toml` - KV namespaces configured
- `SCROBBLER_SETUP.md` - Complete setup documentation

## Phase 1: Worker Enhancement & Authentication (Week 1-2)

### Objectives
- Integrate proven scrobbler handlers into existing Russ FM worker
- Adapt authentication flow for React integration
- Configure CORS for cross-origin requests

### Worker Backend Tasks - Using Proven Code

#### 1.1 Integration Strategy
**Copy and adapt working handlers from oldcode/:**
```bash
# Files to integrate from oldcode/:
project/scrobbler/oldcode/handlers/auth.js      → src/worker/handlers/auth.js
project/scrobbler/oldcode/handlers/scrobble.js  → src/worker/handlers/scrobble.js  
project/scrobbler/oldcode/handlers/search.js    → src/worker/handlers/search.js
project/scrobbler/oldcode/utils/lastfm.js       → src/worker/utils/lastfm.js
project/scrobbler/oldcode/utils/static.js       → src/worker/utils/static.js
```

#### 1.2 Enhanced _worker.js Integration
**Extend current `_worker.js` with proven routing pattern:**
```javascript
// Enhanced _worker.js based on working implementation
import { handleAuth } from './src/worker/handlers/auth.js';
import { handleScrobble } from './src/worker/handlers/scrobble.js';
import { handleSearch } from './src/worker/handlers/search.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Parse CORS origins (from working code)
    const allowedOriginsString = env.ALLOWED_ORIGINS_STRING || '';
    const parsedAllowedOrigins = allowedOriginsString
      .split(',').map(origin => origin.trim()).filter(origin => origin.length > 0);

    // Apply proven CORS handling
    const responseCorsHeaders = buildCorsHeaders(request, parsedAllowedOrigins);

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: responseCorsHeaders });
    }

    // Route scrobbling API requests (proven pattern)
    if (path.startsWith('/api/auth/')) {
      const response = await handleAuth(request, env, path);
      applyCorsHeaders(response, responseCorsHeaders);
      return response;
    }
    
    if (path.startsWith('/api/scrobble/')) {
      const response = await handleScrobble(request, env, path);
      applyCorsHeaders(response, responseCorsHeaders);
      return response;
    }
    
    if (path.startsWith('/api/search/')) {
      const response = await handleSearch(request, env, path);
      applyCorsHeaders(response, responseCorsHeaders);
      return response;
    }

    // Existing static asset serving (unchanged)
    return handleStaticAssets(request, env);
  }
};
```

#### 1.3 Key Advantages of Working Code
**Proven implementations we can reuse:**
1. **Complete OAuth Flow**: Login → callback → session management with KV storage
2. **MD5 Signature Generation**: Working Last.fm API authentication with crypto-js
3. **Session Management**: 24-hour TTL, cookie handling, session validation
4. **CORS Handling**: Dynamic origin validation with proper preflight support
5. **Error Handling**: Comprehensive error responses and logging

#### 1.4 Working API Endpoints (Proven)
**The oldcode already provides these fully working endpoints:**
```javascript
// Authentication (fully implemented)
POST /api/auth/login              # Initiate Last.fm OAuth
GET  /api/auth/callback           # Handle OAuth callback  
GET  /api/auth/status             # Check session status
POST /api/auth/logout             # Clear session
POST /api/auth/refresh-artwork    # Update user's latest album artwork

// Scrobbling (fully working)
POST /api/scrobble/track          # Scrobble individual track
POST /api/scrobble/album          # Scrobble entire album with 3-min intervals

// Search (complete implementation)
GET  /api/search/discogs          # Search Discogs by artist/album or release ID
GET  /api/search/discogs/release/{id} # Get detailed release info
GET  /api/search/lastfm           # Search Last.fm albums
GET  /api/search/lastfm/album     # Get Last.fm album details
```

#### 1.5 Required Dependencies
**Add crypto-js dependency (used in working code):**
```bash
npm install crypto-js
```

#### 1.6 Configuration Setup
```bash
# Create KV namespace (same as working code)
wrangler kv:namespace create "SESSIONS"

# Set required secrets (proven working)
wrangler secret put LASTFM_API_KEY
wrangler secret put LASTFM_SECRET  
wrangler secret put DISCOGS_API_KEY
wrangler secret put ALLOWED_ORIGINS_STRING
```

### React Frontend Tasks

#### 1.7 Authentication Components
```bash
# Files to create:
src/components/LastFmAuthDialog.tsx        # Authentication modal (shadcn Dialog)
src/components/UserProfileMenu.tsx         # Enhanced navigation user menu
src/hooks/useLastFmAuth.ts                 # Authentication state hook
src/services/scrobbleApi.ts                # Worker API communication
src/types/scrobble.ts                      # TypeScript interfaces
```

**Implementation Steps:**
1. Create authentication dialog using shadcn/ui Dialog component
2. Implement authentication context with React Query
3. Add Last.fm status to existing Navigation component
4. Create TypeScript interfaces for scrobbling data
5. Set up API service layer with proper error handling

#### 1.8 Development Setup  
```bash
# Install crypto-js dependency for Last.fm signatures
npm install crypto-js

# Update package.json scripts
npm run dev:worker               # Local development with wrangler
npm run build:worker             # Build worker for deployment

# Environment configuration
echo "VITE_SCROBBLING_ENABLED=true" >> .env.local
```

### Deliverables
- ✅ Proven Last.fm OAuth flow integrated into Russ FM worker
- ✅ Working KV-based session management (24-hour TTL)
- ✅ Complete scrobbling API endpoints (track & album)
- ✅ React authentication UI with shadcn/ui integration
- ✅ CORS handling for cross-origin requests

### Testing Checklist  
- [x] Copy oldcode handlers into src/worker/ directory structure
- [x] Update _worker.js with proven routing and CORS handling
- [x] Install crypto-js dependency and @radix-ui/react-progress
- [x] Create React authentication components (LastFmAuthDialog, ScrobbleButton, etc.)
- [x] Set up KV namespace configuration and secrets documentation
- [x] Update package.json with enhanced worker build scripts
- [ ] Test Last.fm OAuth flow end-to-end
- [ ] Test Discogs search endpoint with curl
- [ ] Verify session persistence and 24-hour TTL
- [ ] Test track and album scrobbling endpoints
- [ ] Verify authentication status displays in React UI

---

## Phase 2: React Integration & UI Components (Week 3-4)

### Objectives
- Create React components that use the proven API endpoints
- Integrate scrobbling UI into existing album pages
- Add real-time feedback for scrobbling operations

### Frontend Integration Tasks

#### 2.1 Core React Components (Using Working APIs)
```bash
# Files to create:
src/components/ScrobbleButton.tsx          # Button using proven /api/scrobble/track endpoint
src/components/ScrobbleProgress.tsx        # Progress for /api/scrobble/album operations  
src/components/LastFmAuthDialog.tsx        # Dialog using proven /api/auth/* endpoints
src/hooks/useLastFmAuth.ts                 # Hook wrapping proven auth status API
src/hooks/useScrobble.ts                   # Hook wrapping proven scrobble APIs
src/services/scrobbleApi.ts                # API client for proven endpoints
```

#### 2.2 API Integration Advantages
**Since we have working endpoints, React integration is straightforward:**
```typescript
// Example: useScrobble hook using proven API
const useScrobble = () => {
  const scrobbleTrack = useMutation({
    mutationFn: async ({ artist, album, track }: ScrobbleRequest) => {
      // Call proven /api/scrobble/track endpoint
      return fetch('/api/scrobble/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist, album, track }),
        credentials: 'include' // Include session cookies
      }).then(res => res.json());
    }
  });
  
  return { scrobbleTrack, isScrobbling: scrobbleTrack.isPending };
};
```

#### 2.3 Album Page Integration (Proven Data Flow)
**The working scrobble handler expects this exact format:**
```typescript
// Album scrobbling using proven API format
const scrobbleAlbum = async (album: Album) => {
  const payload = {
    artist: album.artists[0].name,
    album: album.title, 
    tracks: album.tracklist.map(track => ({
      title: track.title
    }))
  };
  
  // Call proven /api/scrobble/album endpoint
  return fetch('/api/scrobble/album', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include'
  });
};
```

### Deliverables  
- ✅ React components using proven API endpoints
- ✅ Real-time progress feedback for album scrobbling
- ✅ Seamless integration with existing shadcn/ui design
- ✅ Error handling using proven API error responses

### Testing Checklist
- [x] React components created using proven API endpoints (ScrobbleButton, ScrobbleProgress)
- [x] Real-time progress feedback implemented for album scrobbling
- [x] Seamless integration with existing shadcn/ui design system
- [x] Error handling implemented using proven API error responses
- [ ] Individual tracks scrobble using proven /api/scrobble/track
- [ ] Album scrobbling works with proven 3-minute interval logic
- [ ] Progress indicators show real-time feedback in deployed environment
- [ ] Authentication dialogs use proven OAuth flow
- [ ] Error messages match proven API error responses

---

## Phase 3: Enhanced Features Using Proven APIs (Week 5-6)

### Objectives  
- Leverage proven search APIs to enhance static data
- Add user statistics using proven auth APIs
- Polish UI integration across all components

### Enhanced Features Using Working Code

#### 3.1 Search Integration (Using Proven APIs)
**The oldcode already provides complete search functionality:**
```bash
# Working search endpoints we can integrate:
GET /api/search/discogs          # Already working: search by artist/album or release ID
GET /api/search/lastfm           # Already working: Last.fm album search  
GET /api/search/lastfm/album     # Already working: detailed album info
```

**React Integration Strategy:**
```typescript
// Enhance existing search with proven API
const useEnhancedSearch = () => {
  // Use proven Last.fm search to complement static data
  const searchLastFm = useQuery({
    queryKey: ['lastfm-search', query],
    queryFn: async () => {
      return fetch(`/api/search/lastfm?album=${encodeURIComponent(query)}`)
        .then(res => res.json());
    },
    enabled: !!query
  });
  
  // Combine static data with Last.fm results
  return {
    staticResults: existingStaticSearch,
    lastfmResults: searchLastFm.data?.results || [],
    loading: searchLastFm.isLoading
  };
};
```

#### 3.2 User Profile Enhancement (Using Proven Auth)
**The proven auth system already provides rich user data:**
```typescript
// Use proven /api/auth/status endpoint data
interface LastFmUser {
  username: string;
  sessionKey: string;
  userInfo: {
    playcount: string;      // Total plays
    registered: { unixtime: string };
    url: string;           // Last.fm profile URL
  };
  lastAlbumArt: string;    // Latest scrobbled album artwork
}
```

#### 3.3 Enhanced Navigation (Using Proven Data)
```bash
# Files to enhance:
src/components/Navigation.tsx              # Show rich Last.fm user data
src/components/UserProfileMenu.tsx         # Display proven user stats
```

**Features using proven APIs:**
1. Display username and total play count from proven userInfo
2. Show latest album artwork from proven lastAlbumArt
3. Use proven /api/auth/refresh-artwork to update user background
4. Link to Last.fm profile using proven userInfo.url

### Deliverables
- ✅ Enhanced search using proven Discogs/Last.fm APIs
- ✅ Rich user profile with proven authentication data
- ✅ Polished navigation showing Last.fm statistics
- ✅ Seamless integration with existing design system

### Testing Checklist
- [x] Enhanced search APIs integrated (Discogs and Last.fm endpoints)
- [x] Rich user profile components created with authentication data
- [x] Polished navigation showing Last.fm statistics (UserProfileMenu)
- [x] Seamless integration with existing design system maintained
- [ ] Search enhancement tested with proven /api/search/* endpoints
- [ ] User profile displays proven userInfo data correctly in deployed environment
- [ ] Latest album artwork updates using proven refresh-artwork API
- [ ] All proven API integrations work seamlessly end-to-end

---

## Phase 4: Advanced Features & Polish (Week 7-8)

### Objectives
- Add advanced scrobbling features
- Implement performance optimizations
- Add comprehensive error handling and logging

### Advanced Worker Features

#### 4.1 Bulk Scrobbling Enhancements
```bash
# Files to create:
src/worker/handlers/bulk.js               # Bulk scrobbling operations
src/worker/utils/queue.js                 # KV-based job queue
src/worker/utils/scheduler.js             # Delayed execution handling
```

**Features:**
1. Collection-wide bulk scrobbling with progress tracking
2. Duplicate detection and prevention using KV storage
3. Scheduled scrobbling for delayed operations
4. Resume capability for interrupted bulk operations

#### 4.2 Enhanced React Components
```bash
# Files to create:
src/components/BulkScrobbleDialog.tsx     # Bulk operation modal
src/components/ScrobbleQueue.tsx          # Queue management interface
src/hooks/useBulkScrobble.ts              # Bulk operation management
src/hooks/useScrobbleQueue.ts             # Queue status tracking
```

**Features:**
1. Bulk scrobbling from filtered album collections
2. Queue management with cancel/pause functionality
3. Collection-wide scrobbling with user confirmations
4. Real-time progress tracking for large operations

#### 4.3 Mobile & Touch Optimization
```bash
# Files to modify:
src/components/ScrobbleButton.tsx         # Touch-friendly interactions
src/components/AlbumCard.tsx              # Mobile-optimized layout
src/styles/scrobble.css                   # Mobile-specific styles
```

**Improvements:**
1. Touch-optimized scrobble buttons with proper sizing
2. Swipe gestures for quick scrobbling actions
3. Mobile-specific progress indicators and modals
4. Responsive design optimizations for small screens

### Performance & Edge Optimization

#### 4.4 Cloudflare KV Optimization
```bash
# Files to create/modify:
src/worker/utils/cache.js                 # KV caching strategies
src/worker/utils/performance.js           # Performance monitoring
```

**Optimizations:**
1. Intelligent KV caching of Last.fm responses with appropriate TTL
2. Edge location optimization for global response times
3. Request batching to minimize API calls
4. Efficient session and progress storage patterns

#### 4.5 Error Handling & Monitoring
```bash
# Files to create:
src/worker/utils/monitoring.js            # Error tracking and analytics
src/worker/utils/recovery.js              # Failure recovery strategies
```

**Features:**
1. Comprehensive error logging with edge location tracking
2. Automatic retry logic with exponential backoff
3. Failed scrobble recovery and queue management
4. Usage analytics and performance monitoring

### Deliverables
- ✅ Advanced bulk scrobbling with queue management
- ✅ Optimized edge performance for global users
- ✅ Mobile-first responsive design
- ✅ Comprehensive error handling and monitoring

### Testing Checklist
- [ ] Bulk operations handle 100+ albums efficiently
- [ ] Performance remains consistent across global edge locations
- [ ] Mobile interface provides excellent touch experience
- [ ] Error recovery works for network and API failures

---

## Configuration & Deployment

### Cloudflare Workers Setup

#### KV Namespace Creation
```bash
# Create production KV namespace
wrangler kv:namespace create "SESSIONS" 

# Create preview KV namespace  
wrangler kv:namespace create "SESSIONS" --preview
```

#### Environment Configuration
```bash
# Set Last.fm API secrets
wrangler secret put LASTFM_API_KEY
wrangler secret put LASTFM_SECRET

# Optional: Enhanced search capability
wrangler secret put DISCOGS_API_KEY
```

#### Enhanced wrangler.toml
```toml
name = "russ-fm"
compatibility_date = "2024-03-01"
main = "./_worker.js"

# Static assets (existing)
[assets]
directory = "./dist-worker"
binding = "ASSETS"

# KV storage for sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "826248011b2e42daa3052edb12763522"
preview_id = "b791af7209cd437f9ecef0155597f7bd"

# Environment variables
[vars]
ENVIRONMENT = "production"
ALLOWED_ORIGINS_STRING = "https://russ.fm,https://preview.russ.fm"

# Preview environment
[env.preview]
vars = { ENVIRONMENT = "preview", ALLOWED_ORIGINS_STRING = "http://localhost:5173,https://preview.russ.fm" }

# Production environment  
[env.production]
vars = { ENVIRONMENT = "production", ALLOWED_ORIGINS_STRING = "https://russ.fm" }
```

### Development Workflow

#### Enhanced Build Scripts
```json
// package.json scripts (✅ IMPLEMENTED)
{
  "scripts": {
    "dev": "vite",
    "dev:worker": "wrangler dev",
    "build": "tsc --noEmit && vite build && npm run process-images",
    "build:fast": "tsc --noEmit && vite build",
    "build:worker": "npm run build:fast && node scripts/build-worker.js",
    "deploy": "npm run build:worker && wrangler deploy",
    "deploy:preview": "npm run build:worker && wrangler deploy --env preview",
    "lint": "eslint .",
    "preview": "vite preview --outDir dist-worker"
  }
}
```

### Feature Configuration
```typescript
// src/config/app.config.ts
export const appConfig = {
  // Existing config...
  features: {
    scrobbling: {
      enabled: import.meta.env.VITE_SCROBBLING_ENABLED !== 'false',
      bulkScrobbling: true,
      maxBulkSize: 100, // Albums per bulk operation
      progressPollingInterval: 2000, // ms
      sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
    }
  },
  lastfm: {
    rateLimit: 5, // requests per second
    retryAttempts: 3,
    retryDelay: 1000 // ms
  }
}
```

## Risk Mitigation

### Technical Risks
1. **Last.fm API Rate Limits**: Implement KV-based queuing and intelligent request batching
2. **Authentication Expiry**: Auto-refresh sessions stored in KV with graceful re-auth
3. **Edge Performance**: Leverage Cloudflare's global network for consistent response times
4. **KV Storage Limits**: Efficient data structures and automatic cleanup with TTL

### User Experience Risks
1. **Learning Curve**: Progressive disclosure with onboarding tooltips
2. **Network Latency**: Edge caching and optimistic UI updates
3. **Integration Complexity**: Maintain existing React patterns and design system
4. **Mobile Performance**: Touch-optimized components with proper sizing

### Operational Risks
1. **Cloudflare Service Limits**: Monitor usage and implement graceful degradation
2. **Session Management**: Robust KV cleanup and session validation
3. **API Availability**: Fallback messaging and retry strategies
4. **Deployment Issues**: Comprehensive testing in preview environment

## Success Metrics

### Performance Metrics
- Edge response times < 100ms globally for scrobbling operations
- Success rate > 99% for individual scrobbles
- Bulk operations complete within 3 minutes per 50 tracks
- Zero session data loss with 24-hour persistence

### User Experience Metrics
- Time to first scrobble < 15 seconds from login (OAuth flow)
- Mobile scrobbling interface usable on screens ≥ 320px wide
- Error recovery successful in > 95% of failed attempts
- User retention rate > 80% after first successful scrobble

### Integration Quality Metrics
- Zero disruption to existing album browsing workflows
- Scrobbling UI integrates seamlessly with shadcn/ui design system
- React component tree depth increase < 10% with scrobbling features
- Bundle size increase < 50KB with all scrobbling functionality

## Maintenance Plan

### Ongoing Development
- Monitor Last.fm API changes and deprecation notices
- Regular testing of OAuth flows and session management
- Performance monitoring via Cloudflare Analytics
- User feedback collection and feature iteration

### Monitoring & Analytics
- Track scrobbling success/failure rates via KV analytics
- Monitor edge performance across global locations
- User engagement metrics for scrobbling features
- Error tracking and automatic alerting

### Documentation & Support
- Worker API documentation for scrobbling endpoints
- React component documentation with usage examples
- User guide for Last.fm integration and troubleshooting
- Migration guide for future Cloudflare Workers updates

### Technical Debt Management
- Regular KV storage cleanup and optimization
- Worker bundle size monitoring and optimization
- React component performance profiling
- Dependency updates and security patches

## Python Backend Integration

The existing Python data collection workflow remains unchanged and independent:

```bash
# Existing workflow continues as-is
cd scrapper
python main.py collection               # Generate static JSON data
python main.py collection --resume      # Resume processing

# Optional: Add Last.fm metadata to static data
python main.py lastfm-enhance          # Future enhancement
```

The Python backend generates static data consumed by React, while the enhanced Cloudflare Worker provides dynamic scrobbling functionality. This separation ensures:

- **Independence**: Data collection and scrobbling operate separately
- **Reliability**: Static data remains available even if scrobbling is unavailable  
- **Performance**: Static JSON loading remains unaffected by dynamic features
- **Scalability**: Each system can scale independently based on usage patterns

This implementation plan leverages the existing Cloudflare Workers architecture to add powerful scrobbling functionality while maintaining the elegant simplicity and global performance of the current platform.