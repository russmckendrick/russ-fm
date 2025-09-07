/**
 * Enhanced Cloudflare Worker for russ.fm
 * Handles SPA routing + Last.fm scrobbling API endpoints
 */

import { handleAuth } from './src/worker/handlers/auth.js';
import { handleScrobble } from './src/worker/handlers/scrobble.js';
import { handleSearch } from './src/worker/handlers/search.js';
import { buildCorsHeaders, applyCorsHeaders } from './src/worker/utils/cors.js';

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
      // For API endpoints, use restricted CORS
      if (path.startsWith('/api/')) {
        return new Response(null, { headers: responseCorsHeaders });
      }
      
      // For static assets, use permissive CORS
      const staticCorsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      return new Response(null, { headers: staticCorsHeaders });
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

    // Static asset serving with CORS headers
    const response = await handleStaticAssets(request, env);
    
    // For static assets, use permissive CORS to allow any origin
    const staticCorsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    applyCorsHeaders(response, staticCorsHeaders);
    return response;
  }
};

async function handleStaticAssets(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Try to serve the static asset first
  const response = await env.ASSETS.fetch(request);

  // If the asset exists, return it
  if (response.status !== 404) {
    return response;
  }

  // For 404s, check if this looks like a client-side route
  // (not a file extension and not an API endpoint)
  const isClientRoute = !pathname.includes('.') && 
                       !pathname.startsWith('/api/') &&
                       !pathname.startsWith('/_');

  if (isClientRoute) {
    // Serve index.html for client-side routing
    const indexRequest = new Request(new URL('/', request.url), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    
    if (indexResponse.ok) {
      // Return index.html with proper headers
      return new Response(indexResponse.body, {
        status: 200,
        headers: {
          ...Object.fromEntries(indexResponse.headers),
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
  }

  // If we can't serve index.html or it's not a client route, return the 404
  return response;
}
