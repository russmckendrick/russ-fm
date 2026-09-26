/**
 * Utility functions for parsing and validating music service URLs
 * Supports Apple Music and Spotify URL parsing and validation
 */

export interface ParsedSpotifyUrl {
  type: 'album' | 'track' | 'playlist' | 'artist';
  id: string;
  originalUrl: string;
}

export interface ParsedAppleMusicUrl {
  type: 'album' | 'song' | 'playlist' | 'artist';
  id: string;
  country: string;
  name?: string;
  originalUrl: string;
}

export class MusicServiceError extends Error {
  service: 'spotify' | 'apple_music';
  originalUrl?: string;

  constructor(message: string, service: 'spotify' | 'apple_music', originalUrl?: string) {
    super(message);
    this.name = 'MusicServiceError';
    this.service = service;
    this.originalUrl = originalUrl;
  }
}

/**
 * Validates if a URL is a valid Spotify URL
 */
export function isValidSpotifyUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const spotifyUrlPattern = /^https?:\/\/(open\.spotify\.com|spotify\.com)\/(album|track|playlist|artist)\/[a-zA-Z0-9]+(\?.*)?$/;
  return spotifyUrlPattern.test(url.trim());
}

/**
 * Validates if a URL is a valid Apple Music URL
 */
export function isValidAppleMusicUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const appleMusicUrlPattern = /^https?:\/\/music\.apple\.com\/[a-z]{2}\/(album|song|playlist|artist)\/[^/]+\/\d+(\?.*)?$/;
  return appleMusicUrlPattern.test(url.trim());
}

/**
 * Extracts album ID from Spotify URL
 * Supports formats:
 * - https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy
 * - https://spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy
 * - https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=...
 */
export function parseSpotifyUrl(url: string): ParsedSpotifyUrl {
  if (!url || typeof url !== 'string') {
    throw new MusicServiceError('Invalid URL: URL must be a non-empty string', 'spotify', url);
  }

  const trimmedUrl = url.trim();
  
  if (!isValidSpotifyUrl(trimmedUrl)) {
    throw new MusicServiceError('Invalid Spotify URL format', 'spotify', url);
  }

  try {
    const urlObj = new URL(trimmedUrl);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    if (pathParts.length < 2) {
      throw new MusicServiceError('Invalid Spotify URL: missing type or ID', 'spotify', url);
    }

    const type = pathParts[0] as 'album' | 'track' | 'playlist' | 'artist';
    const id = pathParts[1];

    // Validate Spotify ID format (22 characters, base62)
    if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
      throw new MusicServiceError('Invalid Spotify ID format', 'spotify', url);
    }

    return {
      type,
      id,
      originalUrl: trimmedUrl
    };
  } catch (error) {
    if (error instanceof MusicServiceError) {
      throw error;
    }
    throw new MusicServiceError('Failed to parse Spotify URL', 'spotify', url);
  }
}

/**
 * Extracts album ID and metadata from Apple Music URL
 * Supports formats:
 * - https://music.apple.com/us/album/album-name/1234567890
 * - https://music.apple.com/gb/album/album-name/1234567890?i=1234567891
 */
export function parseAppleMusicUrl(url: string): ParsedAppleMusicUrl {
  if (!url || typeof url !== 'string') {
    throw new MusicServiceError('Invalid URL: URL must be a non-empty string', 'apple_music', url);
  }

  const trimmedUrl = url.trim();
  
  if (!isValidAppleMusicUrl(trimmedUrl)) {
    throw new MusicServiceError('Invalid Apple Music URL format', 'apple_music', url);
  }

  try {
    const urlObj = new URL(trimmedUrl);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    if (pathParts.length < 3) {
      throw new MusicServiceError('Invalid Apple Music URL: missing country, type, or ID', 'apple_music', url);
    }

    const country = pathParts[0];
    const type = pathParts[1] as 'album' | 'song' | 'playlist' | 'artist';
    const name = pathParts[2];
    const id = pathParts[3];

    // Validate country code (2 letters)
    if (!/^[a-z]{2}$/.test(country)) {
      throw new MusicServiceError('Invalid Apple Music country code', 'apple_music', url);
    }

    // Validate Apple Music ID format (numeric)
    if (!/^\d+$/.test(id)) {
      throw new MusicServiceError('Invalid Apple Music ID format', 'apple_music', url);
    }

    return {
      type,
      id,
      country,
      name: decodeURIComponent(name.replace(/-/g, ' ')),
      originalUrl: trimmedUrl
    };
  } catch (error) {
    if (error instanceof MusicServiceError) {
      throw error;
    }
    throw new MusicServiceError('Failed to parse Apple Music URL', 'apple_music', url);
  }
}

/**
 * Extracts Spotify album ID from various input formats
 * Handles both direct IDs and URLs
 */
export function extractSpotifyAlbumId(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new MusicServiceError('Invalid input: must be a non-empty string', 'spotify', input);
  }

  const trimmedInput = input.trim();

  // If it's already a Spotify ID (22 characters, base62)
  if (/^[a-zA-Z0-9]{22}$/.test(trimmedInput)) {
    return trimmedInput;
  }

  // If it's a URL, parse it
  if (trimmedInput.includes('spotify.com')) {
    const parsed = parseSpotifyUrl(trimmedInput);
    if (parsed.type !== 'album') {
      throw new MusicServiceError('URL is not a Spotify album URL', 'spotify', input);
    }
    return parsed.id;
  }

  throw new MusicServiceError('Invalid Spotify input: must be a valid album ID or URL', 'spotify', input);
}

/**
 * Extracts Apple Music album ID from various input formats
 * Handles both direct IDs and URLs
 */
export function extractAppleMusicAlbumId(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new MusicServiceError('Invalid input: must be a non-empty string', 'apple_music', input);
  }

  const trimmedInput = input.trim();

  // If it's already an Apple Music ID (numeric)
  if (/^\d+$/.test(trimmedInput)) {
    return trimmedInput;
  }

  // If it's a URL, parse it
  if (trimmedInput.includes('music.apple.com')) {
    const parsed = parseAppleMusicUrl(trimmedInput);
    if (parsed.type !== 'album') {
      throw new MusicServiceError('URL is not an Apple Music album URL', 'apple_music', input);
    }
    return parsed.id;
  }

  throw new MusicServiceError('Invalid Apple Music input: must be a valid album ID or URL', 'apple_music', input);
}

/**
 * Constructs a Spotify embed URL from an album ID
 */
export function buildSpotifyEmbedUrl(albumId: string, options?: {
  theme?: 'light' | 'dark';
  height?: number;
}): string {
  if (!albumId || typeof albumId !== 'string') {
    throw new MusicServiceError('Invalid album ID: must be a non-empty string', 'spotify');
  }

  if (!/^[a-zA-Z0-9]{22}$/.test(albumId.trim())) {
    throw new MusicServiceError('Invalid Spotify album ID format', 'spotify');
  }

  const baseUrl = `https://open.spotify.com/embed/album/${albumId.trim()}`;
  const params = new URLSearchParams();

  if (options?.theme) {
    params.set('theme', options.theme);
  }

  if (options?.height) {
    params.set('height', options.height.toString());
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Constructs an Apple Music embed URL from an album ID and country
 * Uses the correct Apple Music embed format with required query parameters
 */
export function buildAppleMusicEmbedUrl(albumId: string, country: string = 'us', options?: {
  height?: number;
  theme?: 'light' | 'dark';
}): string {
  if (!albumId || typeof albumId !== 'string') {
    throw new MusicServiceError('Invalid album ID: must be a non-empty string', 'apple_music');
  }

  if (!country || typeof country !== 'string') {
    throw new MusicServiceError('Invalid country: must be a non-empty string', 'apple_music');
  }

  if (!/^\d+$/.test(albumId.trim())) {
    throw new MusicServiceError('Invalid Apple Music album ID format', 'apple_music');
  }

  if (!/^[a-z]{2}$/.test(country.trim().toLowerCase())) {
    throw new MusicServiceError('Invalid country code format', 'apple_music');
  }

  // Use the correct Apple Music embed URL format with required parameters
  const baseUrl = `https://embed.music.apple.com/${country.trim().toLowerCase()}/album/${albumId.trim()}`;
  const params = new URLSearchParams();

  // Required parameters for Apple Music embeds
  params.set('app', 'music');
  params.set('itsct', 'music_box_player');
  params.set('itscg', '30200');
  params.set('ls', '1');
  params.set('theme', options?.theme || 'dark');

  if (options?.height) {
    params.set('height', options.height.toString());
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Validates and normalizes a music service URL
 */
export function validateAndNormalizeUrl(url: string, service: 'spotify' | 'apple_music'): string {
  if (!url || typeof url !== 'string') {
    throw new MusicServiceError('Invalid URL: must be a non-empty string', service, url);
  }

  const trimmedUrl = url.trim();

  if (service === 'spotify') {
    if (!isValidSpotifyUrl(trimmedUrl)) {
      throw new MusicServiceError('Invalid Spotify URL format', service, url);
    }
    const parsed = parseSpotifyUrl(trimmedUrl);
    return `https://open.spotify.com/${parsed.type}/${parsed.id}`;
  } else if (service === 'apple_music') {
    if (!isValidAppleMusicUrl(trimmedUrl)) {
      throw new MusicServiceError('Invalid Apple Music URL format', service, url);
    }
    const parsed = parseAppleMusicUrl(trimmedUrl);
    return `https://music.apple.com/${parsed.country}/${parsed.type}/${parsed.name?.replace(/\s+/g, '-') || 'album'}/${parsed.id}`;
  }

  throw new MusicServiceError('Unsupported service', service, url);
}