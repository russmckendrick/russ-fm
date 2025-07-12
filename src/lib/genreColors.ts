/**
 * Generates a consistent dark color for a genre based on its name
 * Uses a simple hash function to ensure the same genre always gets the same color
 */
export function getGenreColor(genre: string): string {
  // Simple hash function to generate a consistent number from the genre name
  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    const char = genre.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use the hash to generate HSL values with much more variety
  // Hue: Full range (0-360) for maximum color variety
  const hue = Math.abs(hash) % 360;
  
  // Saturation: 50-95% for much more vibrant colors (was 45-65%)
  const saturation = 50 + (Math.abs(hash >> 8) % 46);
  
  // Lightness: 25-50% for more variety while keeping readable contrast (was 25-40%)
  const lightness = 25 + (Math.abs(hash >> 16) % 26);
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Gets the text color (white or black) that has good contrast with the background color
 * For dark colors, this will typically return white
 */
export function getGenreTextColor(backgroundColor: string): string {
  // For our dark color range (25-40% lightness), white text will always have good contrast
  return 'white';
}