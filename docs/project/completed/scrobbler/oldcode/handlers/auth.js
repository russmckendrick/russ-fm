import { generateSessionId, createAuthUrl, generateApiSig } from '../utils/lastfm.js';

export async function handleAuth(request, env, path) {
  const url = new URL(request.url);
  
  if (path === '/api/auth/status') {
    return handleAuthStatus(request, env);
  } else if (path === '/api/auth/login') {
    return handleLogin(request, env);
  } else if (path === '/api/auth/callback') {
    return handleCallback(request, env, url);
  } else if (path === '/api/auth/logout') {
    return handleLogout(request, env);
  } else if (path === '/api/auth/refresh-artwork') {
    return handleRefreshArtwork(request, env);
  }
  
  return new Response('Auth endpoint not found', { status: 404 });
}

async function handleAuthStatus(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);
    
    if (!sessionId) {
      return Response.json({ authenticated: false });
    }
    
    const sessionData = await env.SESSIONS.get(sessionId);
    
    if (!sessionData) {
      return Response.json({ authenticated: false });
    }
    
    const session = JSON.parse(sessionData);
    
    // Check if session is expired (24 hours)
    if (Date.now() - session.created > 24 * 60 * 60 * 1000) {
      await env.SESSIONS.delete(sessionId);
      return Response.json({ authenticated: false });
    }
    
    return Response.json({
      authenticated: true,
      user: {
        username: session.username,
        sessionKey: session.sessionKey,
        userInfo: session.userInfo || null, // Include full user info if available
        lastAlbumArt: session.lastAlbumArt || null // Include latest album artwork
      }
    });
  } catch (error) {
    console.error('Auth status error:', error);
    return Response.json({ authenticated: false });
  }
}

async function handleLogin(request, env) {
  try {
    // Debug: Check if API key is available
    console.log('LASTFM_API_KEY available:', !!env.LASTFM_API_KEY);
    console.log('LASTFM_API_KEY value:', env.LASTFM_API_KEY ? 'SET' : 'UNDEFINED');
    
    if (!env.LASTFM_API_KEY) {
      return Response.json({ 
        error: 'Last.fm API key not configured. Please set LASTFM_API_KEY secret.' 
      }, { status: 500 });
    }
    
    const sessionId = generateSessionId();
    
    // Get the current origin and determine callback URL
    const url = new URL(request.url);
    const referer = request.headers.get('Referer');
    
    // Check if this is an embed request by looking at the referer
    let callbackUrl = `${url.origin}/`;
    if (referer && referer.includes('/embed/')) {
      // Extract the embed path from referer for callback
      const embedMatch = referer.match(/\/embed\/(\d+)\/?/);
      if (embedMatch) {
        callbackUrl = `${url.origin}/embed/${embedMatch[1]}/`;
      }
    }
    
    console.log('Creating auth URL with callback:', callbackUrl);
    const authUrl = createAuthUrl(env.LASTFM_API_KEY, callbackUrl);
    console.log('Generated auth URL:', authUrl);
    
    // Store temporary session for callback verification
    await env.SESSIONS.put(sessionId, JSON.stringify({
      type: 'pending',
      created: Date.now(),
      isEmbed: referer && referer.includes('/embed/') // Track if this is an embed session
    }), { expirationTtl: 600 }); // 10 minutes
    
    const response = Response.json({ authUrl });
    
    // Set session cookie (adjust for localhost)
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const cookieOptions = isLocalhost 
      ? `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      : `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`;
    
    response.headers.set('Set-Cookie', cookieOptions);
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}

async function handleCallback(request, env, url) {
  try {
    const token = url.searchParams.get('token');
    const sessionId = getSessionFromRequest(request);
    
    if (!token || !sessionId) {
      return Response.json({ 
        success: false, 
        error: 'Missing token or session' 
      }, { status: 400 });
    }
    
    // Get session key from LastFM
    const sessionKey = await getSessionKey(token, env.LASTFM_API_KEY, env.LASTFM_SECRET);
    
    if (!sessionKey) {
      return Response.json({ 
        success: false, 
        error: 'Failed to get session key' 
      }, { status: 400 });
    }
    
    // Get user info
    const userInfo = await getUserInfo(sessionKey, env.LASTFM_API_KEY, env.LASTFM_SECRET);
    
    if (!userInfo) {
      return Response.json({ 
        success: false, 
        error: 'Failed to get user info' 
      }, { status: 400 });
    }
    
    // Get user's recent tracks for album artwork
    const recentTracks = await getUserRecentTracks(sessionKey, env.LASTFM_API_KEY, env.LASTFM_SECRET, 1);
    let lastAlbumArt = null;
    
    if (recentTracks && recentTracks.length > 0) {
      const latestTrack = Array.isArray(recentTracks) ? recentTracks[0] : recentTracks;
      if (latestTrack.image && latestTrack.image.length > 0) {
        // Find the largest available image
        const largeImage = latestTrack.image.find(img => img.size === 'extralarge') ||
                          latestTrack.image.find(img => img.size === 'large') ||
                          latestTrack.image.find(img => img.size === 'medium') ||
                          latestTrack.image[0];
        
        if (largeImage && largeImage['#text']) {
          lastAlbumArt = largeImage['#text'];
        }
      }
    }
    
    // Store authenticated session with full user info
    await env.SESSIONS.put(sessionId, JSON.stringify({
      type: 'authenticated',
      username: userInfo.name,
      userInfo: userInfo, // Store full user info from Last.fm
      lastAlbumArt: lastAlbumArt, // Store latest album artwork
      sessionKey: sessionKey,
      created: Date.now()
    }), { expirationTtl: 86400 }); // 24 hours
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Callback error:', error);
    return Response.json({ 
      success: false, 
      error: 'Authentication failed' 
    }, { status: 500 });
  }
}

async function handleLogout(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);
    
    if (sessionId) {
      await env.SESSIONS.delete(sessionId);
    }
    
    const response = Response.json({ success: true });
    
    // Clear session cookie
    response.headers.set('Set-Cookie', 
      'session_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    );
    
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json({ error: 'Logout failed' }, { status: 500 });
  }
}

async function handleRefreshArtwork(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);
    
    if (!sessionId) {
      return Response.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }
    
    const sessionData = await env.SESSIONS.get(sessionId);
    
    if (!sessionData) {
      return Response.json({ 
        error: 'Session not found' 
      }, { status: 401 });
    }
    
    const session = JSON.parse(sessionData);
    
    if (session.type !== 'authenticated') {
      return Response.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }
    
    // Get user's recent tracks for updated album artwork
    const recentTracks = await getUserRecentTracks(session.sessionKey, env.LASTFM_API_KEY, env.LASTFM_SECRET, 1);
    let lastAlbumArt = null;
    
    if (recentTracks && recentTracks.length > 0) {
      const latestTrack = Array.isArray(recentTracks) ? recentTracks[0] : recentTracks;
      if (latestTrack.image && latestTrack.image.length > 0) {
        // Find the largest available image
        const largeImage = latestTrack.image.find(img => img.size === 'extralarge') ||
                          latestTrack.image.find(img => img.size === 'large') ||
                          latestTrack.image.find(img => img.size === 'medium') ||
                          latestTrack.image[0];
        
        if (largeImage && largeImage['#text']) {
          lastAlbumArt = largeImage['#text'];
        }
      }
    }
    
    // Update session with new album artwork
    session.lastAlbumArt = lastAlbumArt;
    
    await env.SESSIONS.put(sessionId, JSON.stringify(session), { 
      expirationTtl: 86400 
    });
    
    return Response.json({ 
      success: true, 
      lastAlbumArt: lastAlbumArt 
    });
  } catch (error) {
    console.error('Refresh artwork error:', error);
    return Response.json({ 
      error: 'Failed to refresh artwork' 
    }, { status: 500 });
  }
}

function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  return cookies.session_id;
}

async function getSessionKey(token, apiKey, secret) {
  try {
    const params = {
      method: 'auth.getSession',
      api_key: apiKey,
      token: token
    };
    
    const signature = generateApiSig(params, secret);
    params.api_sig = signature;
    params.format = 'json';
    
    const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    
    const data = await response.json();
    
    if (data.session && data.session.key) {
      return data.session.key;
    }
    
    return null;
  } catch (error) {
    console.error('Get session key error:', error);
    return null;
  }
}

async function getUserInfo(sessionKey, apiKey, secret) {
  try {
    const params = {
      method: 'user.getInfo',
      api_key: apiKey,
      sk: sessionKey
    };
    
    const signature = generateApiSig(params, secret);
    params.api_sig = signature;
    params.format = 'json';
    
    const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    
    const data = await response.json();
    
    if (data.user) {
      return data.user;
    }
    
    return null;
  } catch (error) {
    console.error('Get user info error:', error);
    return null;
  }
}

async function getUserRecentTracks(sessionKey, apiKey, secret, limit = 1) {
  try {
    const params = {
      method: 'user.getRecentTracks',
      api_key: apiKey,
      sk: sessionKey,
      limit: limit.toString()
    };
    
    const signature = generateApiSig(params, secret);
    params.api_sig = signature;
    params.format = 'json';
    
    const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
    
    const data = await response.json();
    
    if (data.recenttracks && data.recenttracks.track) {
      return data.recenttracks.track;
    }
    
    return null;
  } catch (error) {
    console.error('Get recent tracks error:', error);
    return null;
  }
} 