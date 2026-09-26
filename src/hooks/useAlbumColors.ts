import { useState, useEffect } from 'react';

/**
 * One album's sleeve colours from album-colors.json, decided at build time by
 * scripts/generate-album-colors.js. Read them through `floodFor` in
 * src/lib/sleeveColour.ts rather than directly.
 */
export interface AlbumColorPalette {
  /** Palette version; the generator redoes entries from older versions. */
  v: number;
  /** The sleeve's colour: heroes, tiles, bars, chips. A tinted neutral when `vivid` is 0. */
  flood: string;
  /** Dark ink or cream, whichever reads on the flood. */
  ink: string;
  /** The sleeve's own dark: page body, vinyl labels. Never pure black. */
  ground: string;
  /** The flood, lightened if needed to reach 3:1 on the ground (accents below the hero). */
  glow: string;
  /** A second, clearly different sleeve colour, or null. */
  secondary: string | null;
  /** Flood hue, 0–1 (OKLCH), for colour sorting. */
  hue: number;
  /** How bold the flood is: 0 for monochrome sleeves, up to about 2.6. */
  vivid: number;
}

// In-memory cache for color data
const colorCache = new Map<string, AlbumColorPalette | null>();
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

/** Resolve (and cache) a palette from the loaded colour map. */
const resolveColors = (albumIdentifier: string, allColors: Record<string, AlbumColorPalette>): AlbumColorPalette | null => {
  if (colorCache.has(albumIdentifier)) return colorCache.get(albumIdentifier) ?? null;

  let albumColors: AlbumColorPalette | null = null;
  // Try to get colors by URI first (if it looks like a URI)
  if (albumIdentifier.startsWith('/album/') || albumIdentifier.startsWith('album/')) {
    albumColors = getColorsByUri(albumIdentifier, allColors);
  }
  // If not found, try by slug
  if (!albumColors) {
    albumColors = getColorsBySlug(albumIdentifier, allColors);
  }
  colorCache.set(albumIdentifier, albumColors);
  return albumColors;
};

/**
 * Custom hook to load and manage album colors
 *
 * Once album-colors.json has loaded the palette is returned on the first
 * render, so pages flood in the right colour without a neutral flash.
 *
 * @param albumIdentifier - Can be either a URI path (/album/slug/) or just the album slug
 * @returns AlbumColorPalette or null if not found/loading
 */
export function useAlbumColors(albumIdentifier?: string): AlbumColorPalette | null {
  const [loaded, setLoaded] = useState(() => colorData !== null);

  useEffect(() => {
    if (loaded) return;
    let alive = true;
    loadAlbumColors().then(() => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [loaded]);

  if (!albumIdentifier || !loaded || !colorData) return null;
  return resolveColors(albumIdentifier, colorData);
}

/**
 * Hook variant that always returns colors with fallbacks
 */
export function useAlbumColorsWithFallback(albumIdentifier?: string): AlbumColorPalette {
  const colors = useAlbumColors(albumIdentifier);
  
  const fallbackColors: AlbumColorPalette = {
    v: 2,
    flood: '#e8e2d6',
    ink: '#0e0d0c',
    ground: '#1c1916',
    glow: '#e8e2d6',
    secondary: null,
    hue: 0.12,
    vivid: 0,
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

/** A sleeve swatch: `[hex, percent of the sleeve it covers]`. */
export type AlbumSwatch = [string, number];

let swatchData: Record<string, AlbumSwatch[]> | null = null;
let swatchPromise: Promise<Record<string, AlbumSwatch[]>> | null = null;

const loadSwatches = (): Promise<Record<string, AlbumSwatch[]>> => {
  swatchPromise ??= fetch('/album-swatches.json')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then(data => (swatchData = data));
  return swatchPromise;
};

/**
 * The sleeve's main swatches, largest first (album-swatches.json). Kept out
 * of the colour map because only the album page shows them; fetched on first
 * use. Empty until loaded.
 */
export function useAlbumSwatches(uri?: string): AlbumSwatch[] {
  const [data, setData] = useState(swatchData);

  useEffect(() => {
    if (data || !uri) return;
    let alive = true;
    loadSwatches().then(d => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [data, uri]);

  return (uri && data?.[uri]) || [];
}
