interface AlbumServices {
  apple_music?: {
    raw_attributes?: {
      genreNames?: string[];
    };
  };
  spotify?: {
    genres?: string[];
  };
}

interface Album {
  genres?: string[];
  services?: AlbumServices;
}

/**
 * Gets clean genres for an album, prioritizing Apple Music and Spotify data
 * Filters out low-quality genres (all lowercase, starting with numbers)
 */
export function getCleanGenres(album: Album): string[] {
  // First priority: Apple Music genreNames (filtered)
  if (album.services?.apple_music?.raw_attributes?.genreNames?.length) {
    return album.services.apple_music.raw_attributes.genreNames.filter(genre => 
      genre.toLowerCase() !== 'music'
    );
  }
  
  // Second priority: Spotify genres (if they add it in the future, filtered)
  if (album.services?.spotify?.genres?.length) {
    return album.services.spotify.genres.filter(genre => 
      genre.toLowerCase() !== 'music'
    );
  }
  
  // Fallback: filtered genres from main genres array
  if (album.genres?.length) {
    return filterLowQualityGenres(album.genres);
  }
  
  return [];
}

/**
 * Filters out low-quality genre tags
 * Removes: all lowercase genres, genres starting with numbers, artist names, empty tags
 */
export function filterLowQualityGenres(genres: string[], artistName?: string): string[] {
  const filtered = genres
    .filter(genre => {
      const trimmed = genre.trim();
      
      // Skip empty
      if (!trimmed) return false;
      
      // Skip generic "Music" genre
      if (trimmed.toLowerCase() === 'music') return false;
      
      // Skip if all lowercase (indicates low-quality tag)
      if (trimmed === trimmed.toLowerCase()) return false;
      
      // Skip if starts with a number
      if (/^\d/.test(trimmed)) return false;
      
      // Skip if contains artist name (if provided)
      if (artistName && trimmed.toLowerCase().includes(artistName.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  
  // Remove duplicates
  return [...new Set(filtered)];
}

/**
 * Simple genre filtering for collection items (without service data)
 * Used in AlbumCard and similar components
 */
export function getCleanGenresFromArray(genres: string[], artistName?: string): string[] {
  return filterLowQualityGenres(genres, artistName);
}