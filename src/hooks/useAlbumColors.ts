import { useState, useEffect } from 'react';

export interface AlbumColorPalette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

// In-memory cache for color data
const colorCache = new Map<string, AlbumColorPalette>();
let colorData: Record<string, AlbumColorPalette> | null = null;
let loadingPromise: Promise<void> | null = null;

/**
 * Load album colors from the pregenerated JSON file
 */
const loadAlbumColors = async (): Promise<Record<string, AlbumColorPalette>> => {
  if (colorData) {
    return colorData;
  }

  if (loadingPromise) {
    await loadingPromise;
    return colorData || {};
  }

  loadingPromise = (async () => {
    try {
      const response = await fetch('/album-colors.json');
      if (!response.ok) {
        throw new Error(`Failed to load album colors: ${response.status}`);
      }
      colorData = await response.json();
    } catch (error) {
      console.error('Error loading album colors:', error);
      colorData = {};
    }
  })();

  await loadingPromise;
  return colorData || {};
};

/**
 * Get album colors by URI path
 */
const getColorsByUri = (uri: string, colors: Record<string, AlbumColorPalette>): AlbumColorPalette | null => {
  // Direct URI match
  if (colors[uri]) {
    return colors[uri];
  }

  // Try to find by album path (remove trailing slash if present)
  const normalizedUri = uri.endsWith('/') ? uri : `${uri}/`;
  if (colors[normalizedUri]) {
    return colors[normalizedUri];
  }

  // Try to find by album slug (in case URI format differs)
  const albumSlug = uri.replace(/^\/album\//, '').replace(/\/$/, '');
  const possibleKeys = Object.keys(colors).filter(key => 
    key.includes(albumSlug) || key.includes(`/${albumSlug}/`)
  );

  if (possibleKeys.length > 0) {
    return colors[possibleKeys[0]];
  }

  return null;
};

/**
 * Get album colors by album slug/path
 */
const getColorsBySlug = (albumSlug: string, colors: Record<string, AlbumColorPalette>): AlbumColorPalette | null => {
  // Try direct path match
  const possiblePaths = [
    `/album/${albumSlug}/`,
    `/album/${albumSlug}`,
    albumSlug
  ];

  for (const path of possiblePaths) {
    if (colors[path]) {
      return colors[path];
    }
  }

  // Try fuzzy matching for albums with complex naming
  const possibleKeys = Object.keys(colors).filter(key => {
    const keySlug = key.replace(/^\/album\//, '').replace(/\/$/, '');
    return keySlug === albumSlug || key.includes(albumSlug);
  });

  if (possibleKeys.length > 0) {
    return colors[possibleKeys[0]];
  }

  return null;
};

/**
 * Custom hook to load and manage album colors
 * 
 * @param albumIdentifier - Can be either a URI path (/album/slug/) or just the album slug
 * @returns AlbumColorPalette or null if not found/loading
 */
export function useAlbumColors(albumIdentifier?: string): AlbumColorPalette | null {
  const [colors, setColors] = useState<AlbumColorPalette | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!albumIdentifier) {
      setColors(null);
      return;
    }

    // Check cache first
    const cacheKey = albumIdentifier;
    const cached = colorCache.get(cacheKey);
    if (cached) {
      setColors(cached);
      return;
    }

    // Load colors
    const loadColors = async () => {
      setLoading(true);
      try {
        const allColors = await loadAlbumColors();
        
        let albumColors: AlbumColorPalette | null = null;

        // Try to get colors by URI first (if it looks like a URI)
        if (albumIdentifier.startsWith('/album/') || albumIdentifier.startsWith('album/')) {
          albumColors = getColorsByUri(albumIdentifier, allColors);
        }
        
        // If not found, try by slug
        if (!albumColors) {
          albumColors = getColorsBySlug(albumIdentifier, allColors);
        }

        // Cache the result (even if null)
        colorCache.set(cacheKey, albumColors);
        setColors(albumColors);
      } catch (error) {
        console.error('Error loading album colors:', error);
        setColors(null);
      } finally {
        setLoading(false);
      }
    };

    loadColors();
  }, [albumIdentifier]);

  return loading ? null : colors;
}

/**
 * Hook variant that always returns colors with fallbacks
 */
export function useAlbumColorsWithFallback(albumIdentifier?: string): AlbumColorPalette {
  const colors = useAlbumColors(albumIdentifier);
  
  // Fallback colors that work well in both light and dark modes
  const fallbackColors: AlbumColorPalette = {
    background: '#1a1a1a',
    foreground: '#ffffff',
    accent: '#666666',
    muted: '#404040'
  };

  return colors || fallbackColors;
}

/**
 * Preload album colors for better performance
 */
export function preloadAlbumColors(): Promise<void> {
  return loadAlbumColors().then(() => {});
}

/**
 * The whole uri → palette map (album-colors.json). Null until loaded. Use this
 * when a page paints many sleeves at once (walls, shelves, crates).
 */
export function useAlbumColorMap(): Record<string, AlbumColorPalette> | null {
  const [map, setMap] = useState<Record<string, AlbumColorPalette> | null>(colorData);

  useEffect(() => {
    if (map) return;
    let alive = true;
    loadAlbumColors().then(data => {
      if (alive) setMap(data);
    });
    return () => {
      alive = false;
    };
  }, [map]);

  return map;
}
