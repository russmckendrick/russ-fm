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
      // Check if this is a social media scraper
      const userAgent = request.headers.get('user-agent') || '';
      const isScraper = /facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot/i.test(userAgent);

      // If it's a scraper and an album/artist page, inject meta tags
      if (isScraper && (pathname.startsWith('/album/') || pathname.startsWith('/artist/'))) {
        const htmlWithMeta = await injectMetaTags(pathname, indexResponse, env, url, request);
        if (htmlWithMeta) {
          return new Response(htmlWithMeta, {
            status: 200,
            headers: {
              ...Object.fromEntries(indexResponse.headers),
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }

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

async function injectMetaTags(pathname, indexResponse, env, url, request) {
  try {
    const html = await indexResponse.text();
    const isAlbum = pathname.startsWith('/album/');
    const slug = pathname.split('/').filter(Boolean)[1]; // Get slug from path

    if (!slug) return null;

    // Fetch data from JSON file
    let jsonPath, data, title, description, imageUrl, ogType;

    if (isAlbum) {
      // Album page
      jsonPath = `/album/${slug}/${slug}.json`;
      const jsonRequest = new Request(new URL(jsonPath, url.origin), request);
      const jsonResponse = await env.ASSETS.fetch(jsonRequest);

      if (!jsonResponse.ok) return null;

      data = await jsonResponse.json();
      title = `${data.title} by ${data.artist} | Russ.fm`;
      description = `${data.title} by ${data.artist} (${data.year}). ${data.genres?.slice(0, 3).join(', ') || ''}.`;
      imageUrl = `https://assets.russ.fm/album/${slug}/og-image.png`;
      ogType = 'music.album';
    } else {
      // Artist page - fetch from collection.json
      const collectionRequest = new Request(new URL('/collection.json', url.origin), request);
      const collectionResponse = await env.ASSETS.fetch(collectionRequest);

      if (!collectionResponse.ok) return null;

      const collection = await collectionResponse.json();
      const artistAlbums = collection.filter(album => {
        const albumArtistPath = album.uri_artist?.replace('/artist/', '').replace('/', '');
        return albumArtistPath === slug;
      });

      if (artistAlbums.length === 0) return null;

      // Try to load detailed artist info
      try {
        const artistJsonPath = artistAlbums[0].json_detailed_artist;
        const artistJsonRequest = new Request(new URL(artistJsonPath, url.origin), request);
        const artistJsonResponse = await env.ASSETS.fetch(artistJsonRequest);

        if (artistJsonResponse.ok) {
          data = await artistJsonResponse.json();
        }
      } catch (e) {
        // Use basic info if detailed artist JSON not found
      }

      const artistName = data?.name || artistAlbums[0].release_artist;
      const bio = data?.biography?.substring(0, 200) || `Explore ${artistName}'s music collection`;
      title = `${artistName} - ${artistAlbums.length} Album${artistAlbums.length !== 1 ? 's' : ''} | Russ.fm`;
      description = `${artistName}. ${bio}... ${artistAlbums.length} album${artistAlbums.length !== 1 ? 's' : ''} in collection.`;
      imageUrl = `https://assets.russ.fm/artist/${slug}/og-image.png`;
      ogType = 'music.musician';
    }

    // Build the canonical URL
    const canonicalUrl = `https://russ.fm${pathname.endsWith('/') ? pathname.slice(0, -1) : pathname}`;

    // Inject meta tags into HTML
    let modifiedHtml = html;

    // Replace or inject Open Graph tags
    const ogTags = `
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />`;

    // Replace or inject Twitter tags
    const twitterTags = `
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />`;

    // Replace title
    modifiedHtml = modifiedHtml.replace(
      /<title>.*?<\/title>/,
      `<title>${escapeHtml(title)}</title>`
    );

    // Replace description
    modifiedHtml = modifiedHtml.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`
    );

    // Replace Open Graph tags (find the block and replace all at once)
    modifiedHtml = modifiedHtml.replace(
      /<!-- Open Graph \/ Facebook -->[\s\S]*?(?=<!-- Twitter -->)/,
      `<!-- Open Graph / Facebook -->${ogTags}\n\n    `
    );

    // Replace Twitter tags
    modifiedHtml = modifiedHtml.replace(
      /<!-- Twitter -->[\s\S]*?(?=<title>|<\/head>)/,
      `<!-- Twitter -->${twitterTags}\n\n    `
    );

    return modifiedHtml;
  } catch (error) {
    console.error('Error injecting meta tags:', error);
    return null;
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
