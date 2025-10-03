import { appConfig } from '@/config/app.config';
import type { ImageSize } from '@/types/assets';
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';

/**
 * Get the appropriate image URL based on environment
 * - Development: serves from local /public/ directory
 * - Production: serves from R2 CDN
 */
export function getImageUrl(relativePath: string): string {
  if (!appConfig.assets.useR2) {
    // Development: use local images from /public/
    return `/${relativePath}`;
  }
  // Production: use R2 CDN
  return `${appConfig.assets.baseUrl}/${relativePath}`;
}

/**
 * Get album image URL for a specific size
 */
export function getAlbumImageUrl(albumSlug: string, size: ImageSize = 'medium'): string {
  const imagePath = `album/${albumSlug}/${albumSlug}-${size}.jpg`;
  return getImageUrl(imagePath);
}

/**
 * Get artist image URL for a specific size
 */
export function getArtistImageUrl(artistSlug: string, size: ImageSize = 'medium'): string {
  const imagePath = `artist/${artistSlug}/${artistSlug}-${size}.jpg`;
  return getImageUrl(imagePath);
}

/**
 * Get artist avatar URL (always small size)
 */
export function getArtistAvatarUrl(artistSlug: string): string {
  const imagePath = `artist/${artistSlug}/${artistSlug}-avatar.jpg`;
  return getImageUrl(imagePath);
}

/**
 * Get album OG image URL (for social media sharing)
 * Always returns absolute URL for OG/Twitter meta tags
 */
export function getAlbumOGImageUrl(albumSlug: string): string {
  const imagePath = `album/${albumSlug}/og-image.png`;
  // For OG tags, always use absolute URL
  // In production, use CDN; in dev, use production CDN (social crawlers can't access localhost)
  const baseUrl = appConfig.assets.baseUrl || 'https://assets.russ.fm';
  return `${baseUrl}/${imagePath}`;
}

/**
 * Get artist OG image URL (for social media sharing)
 * Always returns absolute URL for OG/Twitter meta tags
 */
export function getArtistOGImageUrl(artistSlug: string): string {
  const imagePath = `artist/${artistSlug}/og-image.png`;
  // For OG tags, always use absolute URL
  // In production, use CDN; in dev, use production CDN (social crawlers can't access localhost)
  const baseUrl = appConfig.assets.baseUrl || 'https://assets.russ.fm';
  return `${baseUrl}/${imagePath}`;
}

/**
 * Generate responsive srcSet for album images
 */
export function getAlbumImageSrcSet(albumSlug: string): string {
  return [
    `${getAlbumImageUrl(albumSlug, 'small')} 400w`,
    `${getAlbumImageUrl(albumSlug, 'medium')} 800w`,
    `${getAlbumImageUrl(albumSlug, 'hi-res')} 1400w`
  ].join(', ');
}

/**
 * Generate responsive srcSet for artist images
 */
export function getArtistImageSrcSet(artistSlug: string): string {
  return [
    `${getArtistImageUrl(artistSlug, 'small')} 400w`,
    `${getArtistImageUrl(artistSlug, 'medium')} 800w`,
    `${getArtistImageUrl(artistSlug, 'hi-res')} 1400w`
  ].join(', ');
}

/**
 * Handle image loading errors with fallback
 */
export function handleImageError(event: React.SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  
  // First fallback: try 'unknown-' prefix for album images
  if (!img.dataset.unknownFallbackAttempted) {
    const currentSrc = img.src;
    
    // Check if this is an album image path that could have an 'unknown-' fallback
    const albumMatch = currentSrc.match(/\/album\/(\d+)\/(\d+)-(hi-res|medium|small)\.jpg$/);
    if (albumMatch) {
      const [, albumId, fileId, size] = albumMatch;
      // Try the 'unknown-' prefixed version
      const unknownPath = currentSrc.replace(
        `/album/${albumId}/${fileId}-${size}.jpg`,
        `/album/unknown-${albumId}/unknown-${albumId}-${size}.jpg`
      );
      img.dataset.unknownFallbackAttempted = 'true';
      img.src = unknownPath;
      return;
    }
  }
  
  // Final fallback: use generic fallback URL
  if (!img.dataset.fallbackAttempted) {
    img.dataset.fallbackAttempted = 'true';
    img.src = appConfig.assets.fallbackUrl;
  }
}

/**
 * Extract album slug from uri_release and sanitize it to match backend file names
 */
export function getAlbumSlug(uriRelease: string): string {
  const rawSlug = uriRelease.replace('/album/', '').replace('/', '');
  
  // Extract album name and discogs ID (format: "album-name-discogsid")
  const pathMatch = rawSlug.match(/^(.+)-(\d+)$/);
  if (pathMatch) {
    const [, albumNamePart, discogsId] = pathMatch;
    const sanitizedAlbumName = sanitizeFolderName(albumNamePart);
    return `${sanitizedAlbumName}-${discogsId}`;
  }
  
  // Fallback: just sanitize the whole slug
  return sanitizeFolderName(rawSlug);
}

/**
 * Extract artist slug from uri_artist and sanitize it to match backend file names
 */
export function getArtistSlug(uriArtist: string): string {
  const rawSlug = uriArtist.replace('/artist/', '').replace('/', '');
  return sanitizeFolderName(rawSlug);
}

/**
 * Get album image URL from album data
 */
export function getAlbumImageFromData(uriRelease: string, size: ImageSize = 'medium'): string {
  const slug = getAlbumSlug(uriRelease);
  return getAlbumImageUrl(slug, size);
}

/**
 * Get artist image URL from artist data
 */
export function getArtistImageFromData(uriArtist: string, size: ImageSize = 'medium'): string {
  const slug = getArtistSlug(uriArtist);
  return getArtistImageUrl(slug, size);
}

/**
 * Get artist avatar URL from artist data
 */
export function getArtistAvatarFromData(uriArtist: string): string {
  const slug = getArtistSlug(uriArtist);
  return getArtistAvatarUrl(slug);
}

/**
 * Convert existing image URI to new format
 * This helps migrate from the current `album.images_uri_release.medium` format
 */
export function migrateImageUri(currentUri: string): string {
  // If it's already a full URL (R2), return as-is
  if (currentUri.startsWith('http')) {
    return currentUri;
  }
  
  // Convert local path to use our new utility
  return getImageUrl(currentUri.startsWith('/') ? currentUri.slice(1) : currentUri);
}

/**
 * Sanitize JSON file path to match backend-generated file names
 */
export function sanitizeJsonPath(jsonPath: string): string {
  // Handle album JSON paths like: /album/κεφαληξθ-3490956/κεφαληξθ-3490956.json
  if (jsonPath.includes('/album/')) {
    const match = jsonPath.match(/\/album\/(.+?)\/(.+?)\.json$/);
    if (match) {
      const [, folderName, fileName] = match;
      
      // Extract album name and discogs ID from folder/file name
      const pathMatch = folderName.match(/^(.+)-(\d+)$/);
      if (pathMatch) {
        const [, albumNamePart, discogsId] = pathMatch;
        const sanitizedAlbumName = sanitizeFolderName(albumNamePart);
        const sanitizedPath = `${sanitizedAlbumName}-${discogsId}`;
        return `/album/${sanitizedPath}/${sanitizedPath}.json`;
      }
      
      // Fallback: sanitize the whole folder/file name
      const sanitizedName = sanitizeFolderName(folderName);
      return `/album/${sanitizedName}/${sanitizedName}.json`;
    }
  }
  
  // Handle artist JSON paths like: /artist/κεφαληξθ/κεφαληξθ.json
  if (jsonPath.includes('/artist/')) {
    const match = jsonPath.match(/\/artist\/(.+?)\/(.+?)\.json$/);
    if (match) {
      const [, folderName] = match;
      const sanitizedName = sanitizeFolderName(folderName);
      return `/artist/${sanitizedName}/${sanitizedName}.json`;
    }
  }
  
  // Return original path if no pattern matches
  return jsonPath;
}