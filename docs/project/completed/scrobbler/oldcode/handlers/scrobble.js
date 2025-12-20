import { generateApiSig } from '../utils/lastfm.js';

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
    
    // Scrobble tracks with staggered timestamps (simulate listening to the album)
    const results = [];
    let currentTimestamp = Math.floor(Date.now() / 1000) - (tracks.length * 180); // Start from past
    
    for (const track of tracks) {
      if (!track.title) continue;
      
      const scrobbleResult = await scrobbleTrack({
        artist,
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
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    return Response.json({
      success: failureCount === 0,
      message: `Scrobbled ${successCount} of ${results.length} tracks`,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
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
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;
    
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    const sessionId = cookies.session_id;
    if (!sessionId) return null;
    
    const sessionData = await env.SESSIONS.get(sessionId);
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData);
    
    // Check if session is expired
    if (Date.now() - session.created > 24 * 60 * 60 * 1000) {
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