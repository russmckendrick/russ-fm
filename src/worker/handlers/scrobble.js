import { generateApiSig } from '../utils/lastfm.js';

/// Last.fm `ignoredMessage` codes, mapped to something a listener can act on.
const IGNORED_REASONS = {
  '1': 'Last.fm filtered this artist name',
  '2': 'Last.fm filtered this track name',
  '3': 'Timestamp was too far in the past',
  '4': 'Timestamp was too far in the future',
  '5': 'Daily scrobble limit reached'
};

/// Artist names Last.fm treats as placeholders rather than performers. A compilation whose
/// per-track credits are missing falls back to the release artist, which is one of these —
/// scrobbling it is a guaranteed no-op, so we skip it and say so instead.
const PLACEHOLDER_ARTISTS = new Set(['various', 'various artists', 'v/a', 'unknown artist', 'soundtrack']);

function isPlaceholderArtist(name) {
  return PLACEHOLDER_ARTISTS.has(String(name || '').trim().toLowerCase());
}

export async function handleScrobble(request, env, path) {
  if (path === '/api/scrobble/track') {
    return handleTrackScrobble(request, env);
  } else if (path === '/api/scrobble/album') {
    return handleAlbumScrobble(request, env);
  }
  
  return new Response('Scrobble endpoint not found', { status: 404 });
}

async function handleTrackScrobble(request, env) {
  try {
    // Check authentication
    const session = await getSessionFromRequest(request, env);
    if (!session) {
      return Response.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }
    
    const body = await request.json();
    const { artist, track, album, timestamp } = body;
    
    if (!artist || !track) {
      return Response.json({ 
        error: 'Artist and track are required' 
      }, { status: 400 });
    }
    
    const scrobbleResult = await scrobbleTrack({
      artist,
      track,
      album,
      timestamp: timestamp || Math.floor(Date.now() / 1000)
    }, session.sessionKey, env);
    
    if (scrobbleResult.success) {
      return Response.json({ 
        success: true,
        message: 'Track scrobbled successfully'
      });
    } else {
      return Response.json({ 
        error: scrobbleResult.error || 'Scrobble failed' 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Track scrobble error:', error);
    return Response.json({ 
      error: 'Scrobble failed' 
    }, { status: 500 });
  }
}

async function handleAlbumScrobble(request, env) {
  try {
    // Check authentication
    const session = await getSessionFromRequest(request, env);
    if (!session) {
      return Response.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }
    
    const body = await request.json();
    const { artist, album, tracks } = body;
    
    if (!artist || !album || !tracks || !Array.isArray(tracks)) {
      return Response.json({ 
        error: 'Artist, album, and tracks array are required' 
      }, { status: 400 });
    }
    
    if (tracks.length === 0) {
      return Response.json({ 
        error: 'No tracks to scrobble' 
      }, { status: 400 });
    }
    
    // Resolve each track's artist up front: per-track credit for compilations, album artist
    // otherwise. Tracks that resolve to a placeholder ("Various") are dropped here rather
    // than sent — Last.fm filters them, so posting them only produces silent no-ops.
    const resolved = tracks
      .filter(track => track.title)
      .map(track => ({ title: track.title, artist: track.artist || artist }));

    const scrobbleable = resolved.filter(track => !isPlaceholderArtist(track.artist));
    const skipped = resolved.filter(track => isPlaceholderArtist(track.artist));

    if (scrobbleable.length === 0) {
      return Response.json({
        error: `No scrobbleable tracks: this release has no per-track artists, so every track would be credited to "${artist}", which Last.fm filters out.`
      }, { status: 422 });
    }

    // Scrobble tracks with staggered timestamps (simulate listening to the album)
    const results = [];
    let currentTimestamp = Math.floor(Date.now() / 1000) - (scrobbleable.length * 180); // Start from past

    for (const track of scrobbleable) {
      const scrobbleResult = await scrobbleTrack({
        artist: track.artist,
        track: track.title,
        album,
        timestamp: currentTimestamp
      }, session.sessionKey, env);
      
      results.push({
        track: track.title,
        success: scrobbleResult.success,
        error: scrobbleResult.error
      });
      
      // Add 3 minutes between tracks (average song length)
      currentTimestamp += 180;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    for (const track of skipped) {
      results.push({
        track: track.title,
        success: false,
        skipped: true,
        error: `No track artist — "${track.artist}" is filtered by Last.fm`
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    const message = skipped.length
      ? `Scrobbled ${successCount} of ${results.length} tracks (${skipped.length} skipped: no track artist)`
      : `Scrobbled ${successCount} of ${results.length} tracks`;

    return Response.json({
      success: failureCount === 0,
      message,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        skipped: skipped.length
      }
    });
  } catch (error) {
    console.error('Album scrobble error:', error);
    return Response.json({ 
      error: 'Album scrobble failed' 
    }, { status: 500 });
  }
}

async function getSessionFromRequest(request, env) {
  try {
    let sessionId = null;
    
    // First try to get session ID from Authorization header (for cross-domain scenarios)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7); // Remove "Bearer " prefix
    }
    
    // If no Authorization header, try cookies
    if (!sessionId) {
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {});
        sessionId = cookies.session_id;
      }
    }
    
    if (!sessionId) return null;
    
    const sessionData = await env.SESSIONS.get(sessionId);
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData);
    
    // Check if session is expired (30 days)
    if (Date.now() - session.created > 30 * 24 * 60 * 60 * 1000) {
      await env.SESSIONS.delete(sessionId);
      return null;
    }
    
    if (session.type !== 'authenticated') return null;
    
    return session;
  } catch (error) {
    console.error('Session check error:', error);
    return null;
  }
}

async function scrobbleTrack(trackData, sessionKey, env) {
  try {
    const params = {
      method: 'track.scrobble',
      api_key: env.LASTFM_API_KEY,
      sk: sessionKey,
      'artist[0]': trackData.artist,
      'track[0]': trackData.track,
      'timestamp[0]': trackData.timestamp.toString()
    };
    
    // Add optional parameters
    if (trackData.album) {
      params['album[0]'] = trackData.album;
    }
    
    // Generate signature
    const signature = generateApiSig(params, env.LASTFM_SECRET);
    params.api_sig = signature;
    params.format = 'json';
    
    const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    
    const data = await response.json();
    
    if (data.scrobbles && data.scrobbles.scrobble) {
      // A 200 with an ignoredMessage code means Last.fm accepted the request but binned the
      // scrobble (filtered artist, timestamp out of range, daily limit). It never reaches the
      // user's profile, so it is a failure — not the success the response shape implies.
      const scrobble = Array.isArray(data.scrobbles.scrobble)
        ? data.scrobbles.scrobble[0]
        : data.scrobbles.scrobble;
      const ignored = scrobble && scrobble.ignoredMessage;
      const code = ignored && String(ignored.code || '0');

      if (code && code !== '0') {
        return {
          success: false,
          error: IGNORED_REASONS[code] || `Last.fm ignored this scrobble (code ${code})`
        };
      }

      return { success: true };
    } else if (data.error) {
      return { 
        success: false, 
        error: `LastFM Error ${data.error}: ${data.message}` 
      };
    } else {
      return { 
        success: false, 
        error: 'Unknown scrobble error' 
      };
    }
  } catch (error) {
    console.error('Scrobble API error:', error);
    return { 
      success: false, 
      error: 'Failed to communicate with LastFM' 
    };
  }
}