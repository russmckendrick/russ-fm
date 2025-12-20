# Last.fm Scrobbler Setup Guide

This guide walks through setting up the Last.fm scrobbling functionality for russ.fm.

## Prerequisites

1. Last.fm API account with API key and secret
2. Discogs API key (optional, for enhanced search)
3. Cloudflare Workers account with KV storage

## Step 1: Create KV Namespaces

Create KV namespaces for session storage:

```bash
# Create production KV namespace
wrangler kv:namespace create "SESSIONS"

# Create preview KV namespace  
wrangler kv:namespace create "SESSIONS" --preview
```

Copy the namespace IDs from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "your-production-namespace-id-here"
preview_id = "your-preview-namespace-id-here"
```

## Step 2: Set Environment Secrets

Set the required API secrets:

```bash
# Set Last.fm API credentials (required)
wrangler secret put LASTFM_API_KEY
wrangler secret put LASTFM_SECRET

# Set Discogs API key (optional, enhances search functionality)
wrangler secret put DISCOGS_API_KEY
```

## Step 3: Development Environment

For local development, create a `.env.local` file:

```bash
# Enable scrobbling in development
echo "VITE_SCROBBLING_ENABLED=true" >> .env.local
```

## Step 4: Deploy

Build and deploy the worker:

```bash
# Build the application
npm run build:worker

# Deploy to Cloudflare Workers
wrangler deploy
```

## API Endpoints

Once deployed, the following endpoints will be available:

### Authentication
- `POST /api/auth/login` - Initiate Last.fm OAuth
- `GET /api/auth/callback` - Handle OAuth callback  
- `GET /api/auth/status` - Check session status
- `POST /api/auth/logout` - Clear session
- `POST /api/auth/refresh-artwork` - Update user's latest album artwork

### Scrobbling
- `POST /api/scrobble/track` - Scrobble individual track
- `POST /api/scrobble/album` - Scrobble entire album with 3-min intervals

### Search (optional)
- `GET /api/search/discogs` - Search Discogs by artist/album or release ID
- `GET /api/search/discogs/release/{id}` - Get detailed release info
- `GET /api/search/lastfm` - Search Last.fm albums
- `GET /api/search/lastfm/album` - Get Last.fm album details

## React Integration

The React components are already integrated and will automatically detect when scrobbling is available. Key components:

- `LastFmAuthDialog` - Authentication modal
- `ScrobbleButton` - Individual track scrobbling
- `ScrobbleProgress` - Album scrobbling with progress
- `UserProfileMenu` - User status and profile access

## Testing

1. Start development server: `npm run dev`
2. Navigate to your collection
3. Look for the Last.fm connect button in the navigation
4. Authenticate with Last.fm
5. Try scrobbling individual tracks or entire albums

## Troubleshooting

### Common Issues

1. **"Last.fm API key not configured"**
   - Ensure `LASTFM_API_KEY` secret is set
   - Check the secret name matches exactly

2. **CORS errors**
   - Verify `ALLOWED_ORIGINS_STRING` includes your domain
   - Check that cookies are being sent with requests

3. **Session expires immediately**
   - Verify KV namespace is correctly configured
   - Check that the namespace IDs in `wrangler.toml` are correct

### Debug Mode

Enable debug logging by adding console.log statements in the worker handlers. Deploy and check logs with:

```bash
wrangler tail
```

## Security Notes

- All API keys are stored as Cloudflare secrets (encrypted)
- Sessions are stored in KV with 24-hour TTL
- CORS is configured to only allow requests from your domains
- Cookies are HTTP-only and secure in production

## Performance

- Edge response times < 100ms globally for scrobbling operations
- Sessions cached in KV for 24 hours
- Album scrobbling processes tracks with 3-minute intervals to simulate realistic listening