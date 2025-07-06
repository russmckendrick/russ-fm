/**
 * Filters out non-genre terms from a list of genre/style tags
 * Removes: artist names, decades (80s, 90s), years (1985, 2023), empty tags
 */
export function filterGenres(tags: string[], artistName?: string): string[] {
  const filteredTags = tags
    .filter(tag => {
      const lowerTag = tag.toLowerCase().trim();
      
      // Filter out artist names if provided
      const hasArtistName = artistName ? 
        lowerTag.includes(artistName.toLowerCase()) : false;
      
      // Filter out common non-genre terms
      return !hasArtistName &&
             !/^\d+s$/.test(lowerTag) && // Decades like 90s, 80s, 70s
             !/^(19|20)\d{2}$/.test(lowerTag) && // Full years like 1985, 2023
             lowerTag.length > 0; // Remove empty tags
    })
    .map(tag => tag.toLowerCase().trim());
  
  // Remove duplicates by converting to Set and back to array
  return [...new Set(filteredTags)];
}