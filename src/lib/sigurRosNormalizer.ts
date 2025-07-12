/**
 * Sigur Rós Normalizer
 * Handles the unique Icelandic characters and symbols used by Sigur Rós
 */

// Map of Sigur Rós special characters to their normalized equivalents
const SIGUR_ROS_CHARACTER_MAP: Record<string, string> = {
  // Icelandic characters
  'á': 'a',
  'é': 'e',
  'í': 'i',
  'ó': 'o',
  'ú': 'u',
  'ý': 'y',
  'þ': 'th',
  'ð': 'd',
  'æ': 'ae',
  'ö': 'o',
  'Á': 'A',
  'É': 'E',
  'Í': 'I',
  'Ó': 'O',
  'Ú': 'U',
  'Ý': 'Y',
  'Þ': 'Th',
  'Ð': 'D',
  'Æ': 'AE',
  'Ö': 'O',
  
  // Sigur Rós symbols and special characters
  '()': '(Untitled)',
  '( )': '(Untitled)',
  '[]': '[Untitled]',
  '[ ]': '[Untitled]',
  '{}': '{Untitled}',
  '{ }': '{Untitled}',
  
  // Common problematic symbols
  '–': '-',
  '—': '-',
  '\u2018': "'", // Left single quotation mark
  '\u2019': "'", // Right single quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '…': '...',
  
  // Whitespace normalization
  '\u00A0': ' ', // Non-breaking space
  '\u2000': ' ', // En quad
  '\u2001': ' ', // Em quad
  '\u2002': ' ', // En space
  '\u2003': ' ', // Em space
  '\u2004': ' ', // Three-per-em space
  '\u2005': ' ', // Four-per-em space
  '\u2006': ' ', // Six-per-em space
  '\u2007': ' ', // Figure space
  '\u2008': ' ', // Punctuation space
  '\u2009': ' ', // Thin space
  '\u200A': ' ', // Hair space
  '\u202F': ' ', // Narrow no-break space
  '\u205F': ' ', // Medium mathematical space
  '\u3000': ' ', // Ideographic space
};

// Known Sigur Rós album titles and their preferred display names
const SIGUR_ROS_ALBUM_TITLES: Record<string, string> = {
  '()': 'Untitled',
  '( )': 'Untitled',
  'unknown': 'Untitled', // Generic unknown album (often the () album)
  'Ágætis byrjun': 'Ágætis Byrjun',
  'agaetis byrjun': 'Ágætis Byrjun',
  'Takk...': 'Takk...',
  'takk...': 'Takk...',
  'Með suð í eyrum við spilum endalaust': 'Með Suð Í Eyrum Við Spilum Endalaust',
  'med sud i eyrum vid spilum endalaust': 'Með Suð Í Eyrum Við Spilum Endalaust',
  'Valtari': 'Valtari',
  'valtari': 'Valtari',
  'Kveikur': 'Kveikur',
  'kveikur': 'Kveikur',
  'Átta': 'Átta',
  'atta': 'Átta',
  'Von': 'Von',
  'von': 'Von',
  'Von brigði': 'Von Brigði',
  'von brigdi': 'Von Brigði',
  'Hvarf/Heim': 'Hvarf/Heim',
  'hvarf/heim': 'Hvarf/Heim',
  'Odin\'s Raven Magic': 'Odin\'s Raven Magic',
  'odins raven magic': 'Odin\'s Raven Magic',
  'INNI': 'INNI',
  'inni': 'INNI',
};

/**
 * Check if an artist is Sigur Rós (with various spellings)
 */
export function isSigurRos(artistName: string): boolean {
  const normalized = artistName.toLowerCase().trim();
  return normalized === 'sigur rós' || 
         normalized === 'sigur ros' || 
         normalized.includes('sigur rós') ||
         normalized.includes('sigur ros');
}

/**
 * Normalize Sigur Rós album titles for better display
 */
export function normalizeSigurRosTitle(title: string, artistName?: string): string {
  if (artistName && !isSigurRos(artistName)) {
    return title; // Not a Sigur Rós release, return as-is
  }
  
  let normalized = title.trim();
  
  // Check for exact matches in our known titles map
  const lowerTitle = normalized.toLowerCase();
  if (SIGUR_ROS_ALBUM_TITLES[normalized]) {
    return SIGUR_ROS_ALBUM_TITLES[normalized];
  }
  if (SIGUR_ROS_ALBUM_TITLES[lowerTitle]) {
    return SIGUR_ROS_ALBUM_TITLES[lowerTitle];
  }
  
  // Apply character replacements
  for (const [original, replacement] of Object.entries(SIGUR_ROS_CHARACTER_MAP)) {
    normalized = normalized.replace(new RegExp(escapeRegExp(original), 'g'), replacement);
  }
  
  // Clean up multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Handle empty parentheses that might remain
  if (normalized === '' || normalized === '()' || normalized === '( )') {
    normalized = 'Untitled';
  }
  
  return normalized;
}

/**
 * Normalize Sigur Rós text for safe file paths and URLs
 */
export function normalizeSigurRosForPath(text: string): string {
  let normalized = text.trim();
  
  // Apply all character replacements
  for (const [original, replacement] of Object.entries(SIGUR_ROS_CHARACTER_MAP)) {
    normalized = normalized.replace(new RegExp(escapeRegExp(original), 'g'), replacement);
  }
  
  // Additional path-safe replacements
  normalized = normalized
    .replace(/[^\w\s\-_.]/g, '') // Remove non-word characters except spaces, hyphens, underscores, dots
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .toLowerCase();
  
  // Handle edge cases
  if (normalized === '' || normalized === 'untitled') {
    normalized = 'untitled';
  }
  
  return normalized;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get display-friendly artist name for Sigur Rós
 */
export function normalizeSigurRosArtistName(artistName: string): string {
  if (isSigurRos(artistName)) {
    return 'Sigur Rós';
  }
  return artistName;
}