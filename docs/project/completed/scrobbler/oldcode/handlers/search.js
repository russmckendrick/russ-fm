export async function handleSearch(request, env, path) {
  const url = new URL(request.url);
  
  if (path.startsWith('/api/search/discogs/release/')) {
    const releaseId = path.split('/').pop();
    return handleReleaseDetails(releaseId, env);
  } else if (path === '/api/search/discogs') {
    return handleDiscogsSearch(url, env);
  } else if (path === '/api/search/lastfm') {
    return handleLastFmSearch(url, env);
  } else if (path === '/api/search/lastfm/album') {
    return handleLastFmAlbumDetails(url, env);
  }
  
  return new Response('Search endpoint not found', { status: 404 });
}

async function handleDiscogsSearch(url, env) {
  try {
    const releaseId = url.searchParams.get('releaseId');
    const artist = url.searchParams.get('artist');
    const album = url.searchParams.get('album');
    const page = parseInt(url.searchParams.get('page')) || 1;
    
    if (releaseId) {
      // Direct release lookup - wrap in results format
      const releaseDetails = await handleReleaseDetails(releaseId, env);
      const releaseData = await releaseDetails.json();
      
      if (releaseDetails.status !== 200) {
        return releaseDetails; // Return error as-is
      }
      
      // Transform to search result format
      const searchResult = {
        id: releaseData.id,
        title: releaseData.title,
        artist: releaseData.artists && releaseData.artists.length > 0 ? releaseData.artists[0].name : 'Unknown Artist',
        year: releaseData.year,
        format: releaseData.formats ? releaseData.formats.map(f => f.name) : [],
        label: releaseData.labels ? releaseData.labels.map(l => l.name) : [],
        genre: releaseData.genres || [],
        style: releaseData.styles || [],
        thumb: releaseData.images && releaseData.images.length > 0 ? releaseData.images[0].uri150 || releaseData.images[0].uri : null,
        uri: releaseData.uri,
        resource_url: releaseData.resource_url
      };
      
      return Response.json({
        results: [searchResult],
        pagination: {
          page: 1,
          pages: 1,
          per_page: 1,
          items: 1
        }
      });
    } else if (artist && album) {
      // Search by artist and album
      return searchByArtistAlbum(artist, album, page, env);
    } else {
      return Response.json({ 
        error: 'Missing search parameters' 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ 
      error: 'Search failed' 
    }, { status: 500 });
  }
}

async function handleReleaseDetails(releaseId, env) {
  try {
    const response = await fetch(
      `https://api.discogs.com/releases/${releaseId}`,
      {
        headers: {
          'User-Agent': 'RussFMScrobbler/1.0',
          'Authorization': `Discogs key=${env.DISCOGS_API_KEY}, secret=${env.DISCOGS_SECRET || ''}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return Response.json({ 
          error: 'Release not found' 
        }, { status: 404 });
      } else if (response.status === 429) {
        return Response.json({ 
          error: 'Rate limit exceeded. Please try again later.' 
        }, { status: 429 });
      } else {
        return Response.json({ 
          error: 'Failed to fetch release details' 
        }, { status: response.status });
      }
    }
    
    const data = await response.json();
    
    // Transform the data to a consistent format
    const transformedData = {
      id: data.id,
      title: data.title,
      artists: data.artists || [],
      year: data.year,
      genres: data.genres || [],
      styles: data.styles || [],
      formats: data.formats || [],
      labels: data.labels || [],
      tracklist: data.tracklist || [],
      images: data.images || [],
      uri: data.uri,
      resource_url: data.resource_url
    };
    
    return Response.json(transformedData);
  } catch (error) {
    console.error('Release details error:', error);
    return Response.json({ 
      error: 'Failed to fetch release details' 
    }, { status: 500 });
  }
}

async function searchByArtistAlbum(artist, album, page, env) {
  try {
    const perPage = 20;
    const query = `artist:"${artist}" release_title:"${album}"`;
    
    const searchUrl = new URL('https://api.discogs.com/database/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('type', 'release');
    searchUrl.searchParams.set('page', page.toString());
    searchUrl.searchParams.set('per_page', perPage.toString());
    
    const response = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'RussFMScrobbler/1.0',
        'Authorization': `Discogs key=${env.DISCOGS_API_KEY}, secret=${env.DISCOGS_SECRET || ''}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        return Response.json({ 
          error: 'Rate limit exceeded. Please try again later.' 
        }, { status: 429 });
      } else {
        return Response.json({ 
          error: 'Search failed' 
        }, { status: response.status });
      }
    }
    
    const data = await response.json();
    
    // Transform results to consistent format
    const transformedResults = data.results.map(result => ({
      id: result.id,
      title: result.title,
      artist: extractArtistName(result.title),
      year: result.year,
      format: result.format || [],
      label: result.label || [],
      genre: result.genre || [],
      style: result.style || [],
      thumb: result.thumb,
      uri: result.uri,
      resource_url: result.resource_url,
      master_id: result.master_id,
      master_url: result.master_url
    }));
    
    return Response.json({
      results: transformedResults,
      pagination: {
        page: data.pagination.page,
        pages: data.pagination.pages,
        per_page: data.pagination.per_page,
        items: data.pagination.items,
        urls: data.pagination.urls
      }
    });
  } catch (error) {
    console.error('Artist/album search error:', error);
    return Response.json({ 
      error: 'Search failed' 
    }, { status: 500 });
  }
}

function extractArtistName(title) {
  // Discogs titles are usually in format "Artist - Album Title"
  const parts = title.split(' - ');
  if (parts.length >= 2) {
    return parts[0].trim();
  }
  return 'Unknown Artist';
}

async function handleLastFmSearch(url, env) {
  try {
    const album = url.searchParams.get('album');
    const page = parseInt(url.searchParams.get('page')) || 1;
    
    if (!album) {
      return Response.json({ 
        error: 'Missing album parameter' 
      }, { status: 400 });
    }
    
    const limit = 20;
    const searchUrl = new URL('http://ws.audioscrobbler.com/2.0/');
    searchUrl.searchParams.set('method', 'album.search');
    searchUrl.searchParams.set('album', album);
    searchUrl.searchParams.set('api_key', env.LASTFM_API_KEY);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('limit', limit.toString());
    searchUrl.searchParams.set('page', page.toString());
    
    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      return Response.json({ 
        error: 'Last.fm search failed' 
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    if (data.error) {
      return Response.json({ 
        error: data.message || 'Last.fm API error' 
      }, { status: 400 });
    }
    
    const albums = data.results?.albummatches?.album || [];
    const albumArray = Array.isArray(albums) ? albums : [albums];
    
    // Transform Last.fm results to match our expected format
    const transformedResults = albumArray.map((album, index) => ({
      id: `lastfm-${album.mbid || `${album.artist}-${album.name}-${index}`}`, // Create unique ID
      title: album.name,
      artist: album.artist,
      year: null, // Last.fm search doesn't provide year
      format: [],
      label: [],
      genre: [],
      style: [],
      thumb: album.image?.find(img => img.size === 'large')?.['#text'] || 
             album.image?.find(img => img.size === 'medium')?.['#text'] || '',
      cover_image: album.image?.find(img => img.size === 'extralarge')?.['#text'] || 
                   album.image?.find(img => img.size === 'large')?.['#text'] || '',
      uri: album.url,
      resource_url: album.url,
      mbid: album.mbid,
      listeners: album.listeners,
      playcount: album.playcount
    }));
    
    // Calculate pagination info
    const totalPages = Math.ceil(parseInt(data.results?.['opensearch:totalResults'] || 0) / limit);
    
    return Response.json({
      results: transformedResults,
      pagination: {
        page: page,
        pages: totalPages,
        per_page: limit,
        items: parseInt(data.results?.['opensearch:totalResults'] || 0)
      }
    });
  } catch (error) {
    console.error('Last.fm search error:', error);
    return Response.json({ 
      error: 'Last.fm search failed' 
    }, { status: 500 });
  }
}

async function handleLastFmAlbumDetails(url, env) {
  try {
    const artist = url.searchParams.get('artist');
    const album = url.searchParams.get('album');
    
    if (!artist || !album) {
      return Response.json({ 
        error: 'Missing artist or album parameter' 
      }, { status: 400 });
    }
    
    const searchUrl = new URL('http://ws.audioscrobbler.com/2.0/');
    searchUrl.searchParams.set('method', 'album.getinfo');
    searchUrl.searchParams.set('artist', artist);
    searchUrl.searchParams.set('album', album);
    searchUrl.searchParams.set('api_key', env.LASTFM_API_KEY);
    searchUrl.searchParams.set('format', 'json');
    
    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      return Response.json({ 
        error: 'Last.fm album details failed' 
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    if (data.error) {
      return Response.json({ 
        error: data.message || 'Last.fm API error' 
      }, { status: 400 });
    }
    
    const albumInfo = data.album;
    
    // Transform to match Discogs format
    const transformedData = {
      id: `lastfm-${albumInfo.mbid || `${artist}-${album}`}`,
      title: albumInfo.name,
      artists: [{ name: albumInfo.artist }],
      year: null, // Last.fm doesn't always provide release year
      genres: albumInfo.tags?.tag?.map(tag => tag.name) || [],
      styles: [],
      formats: [],
      labels: [],
      tracklist: albumInfo.tracks?.track?.map((track, index) => ({
        position: (index + 1).toString(),
        title: track.name,
        duration: track.duration ? formatDuration(track.duration) : '',
        type_: 'track'
      })) || [],
      images: albumInfo.image ? [{
        uri: albumInfo.image.find(img => img.size === 'extralarge')?.['#text'] || 
             albumInfo.image.find(img => img.size === 'large')?.['#text'] || '',
        uri150: albumInfo.image.find(img => img.size === 'medium')?.['#text'] || ''
      }] : [],
      uri: albumInfo.url,
      resource_url: albumInfo.url,
      mbid: albumInfo.mbid,
      listeners: albumInfo.listeners,
      playcount: albumInfo.playcount,
      summary: albumInfo.wiki?.summary || ''
    };
    
    return Response.json(transformedData);
  } catch (error) {
    console.error('Last.fm album details error:', error);
    return Response.json({ 
      error: 'Failed to fetch album details' 
    }, { status: 500 });
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds === '0') return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
} 