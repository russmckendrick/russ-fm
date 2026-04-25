/**
 * Path Sanitization and Normalization
 * Handles sanitization matching for the backend folder_sanitizer.py logic
 * This ensures frontend URL matching works with backend-generated folder names
 */

/**
 * Helper function to escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize folder name using the same logic as backend folder_sanitizer.py
 * This function replicates the sanitize_folder_name() Python function
 */
export function sanitizeFolderName(name: string): string {
  // 1. Handle empty or whitespace-only names
  if (!name || !name.trim()) {
    return "unknown";
  }
  
  // 2. Handle special case of empty parentheses or similar
  if (['( )', '()', '[ ]', '[]', '{ }', '{}'].includes(name.trim())) {
    return "unknown";
  }
  
  // 3. Convert to lowercase and replace ALL types of spaces with dashes
  // Handle Unicode spaces: regular space, en space, em space, thin space, hair space, etc.
  let sanitized = name.toLowerCase();
  sanitized = sanitized.replace(/\s+/g, '-'); // Replace any Unicode whitespace
  
  // 4. Handle underscores carefully
  // Remove underscore between single letters (G_d → gd)
  // Replace remaining underscores with dashes (The_Puzzle → the-puzzle)
  sanitized = sanitized.replace(/([a-z])_([a-z])(?![a-z])/g, '$1$2');
  sanitized = sanitized.replace(/_/g, '-');
  
  // 5. Handle brackets - remove them but preserve content
  sanitized = sanitized.replace(/[[\]{}]/g, '');
  
  // 6. Remove common characters that should just be deleted
  sanitized = sanitized.replace(/[&'".!?;:]/g, '');
  
  // 7. Handle Latin accented characters
  const accentMap: Record<string, string> = {
    'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
    'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
    'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o',
    'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
    'ý': 'y', 'ÿ': 'y', 'ñ': 'n', 'ç': 'c', 'ß': 'ss',
    'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th'
  };
  
  // 8. Handle special symbols that need replacement
  const symbolMap: Record<string, string> = {
    '½': 'half', '⅓': 'third', '¼': 'quarter', '¾': 'three-quarters',
    '⅛': 'eighth', '⅜': 'three-eighths', '⅝': 'five-eighths', '⅞': 'seven-eighths',
    '²': '2', '³': '3', '¹': '1',
    '–': '-', '—': '-', '−': '-'  // en dash, em dash, minus sign
  };
  
  // 9. Handle characters that should be removed (for backward compatibility)
  const removeChars = ['°', '©', '®', '™', '\u2018', '\u2019', '\u201C', '\u201D', '«', '»', '‹', '›', '„', '‚',
                      '(', ')', '+', '=', '%', '@', '#', '$', '€', '£', '…'];
  
  // 10. Handle Greek characters
  const greekMap: Record<string, string> = {
    'Α': 'a', 'α': 'a', 'ά': 'a', 'Ά': 'a',
    'Β': 'b', 'β': 'b', 'Γ': 'g', 'γ': 'g',
    'Δ': 'd', 'δ': 'd', 'Ε': 'e', 'ε': 'e', 'έ': 'e', 'Έ': 'e',
    'Ζ': 'z', 'ζ': 'z', 'Η': 'e', 'η': 'e', 'ή': 'e', 'Ή': 'e',
    'Θ': 'th', 'θ': 'th', 'Ι': 'i', 'ι': 'i', 'ί': 'i', 'ϊ': 'i',
    'Κ': 'k', 'κ': 'k', 'Λ': 'l', 'λ': 'l', 'Μ': 'm', 'μ': 'm',
    'Ν': 'n', 'ν': 'n', 'Ξ': 'x', 'ξ': 'x', 'Ο': 'o', 'ο': 'o',
    'Π': 'p', 'π': 'p', 'Ρ': 'r', 'ρ': 'r', 'Σ': 's', 'σ': 's', 'ς': 's',
    'Τ': 't', 'τ': 't', 'Υ': 'u', 'υ': 'u', 'Φ': 'f', 'φ': 'f',
    'Χ': 'ch', 'χ': 'ch', 'Ψ': 'ps', 'ψ': 'ps', 'Ω': 'o', 'ω': 'o'
  };
  
  // 11. Apply transliterations in order
  for (const [accented, ascii] of Object.entries(accentMap)) {
    sanitized = sanitized.replace(new RegExp(accented, 'g'), ascii);
  }
  for (const [symbol, replacement] of Object.entries(symbolMap)) {
    // Add dashes around fraction words
    if (['half', 'third', 'quarter', 'three-quarters', 'eighth', 'three-eighths', 'five-eighths', 'seven-eighths'].includes(replacement)) {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(symbol), 'g'), `-${replacement}`);
    } else {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(symbol), 'g'), replacement);
    }
  }
  for (const char of removeChars) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(char), 'g'), '');
  }
  for (const [greekChar, latin] of Object.entries(greekMap)) {
    sanitized = sanitized.replace(new RegExp(greekChar, 'g'), latin);
  }
  
  // 12. Remove Japanese characters (Hiragana, Katakana, Kanji)
  // Remove these characters entirely rather than transliterate
  sanitized = sanitized.replace(/[\u3040-\u309F]/g, ''); // Hiragana
  sanitized = sanitized.replace(/[\u30A0-\u30FF]/g, ''); // Katakana
  sanitized = sanitized.replace(/[\u4E00-\u9FAF]/g, ''); // CJK Unified Ideographs (Kanji)
  sanitized = sanitized.replace(/[\u3400-\u4DBF]/g, ''); // CJK Extension A
  sanitized = sanitized.replace(/[\uFF00-\uFFEF]/g, ''); // Halfwidth and Fullwidth Forms
  
  // 12. Remove any remaining special characters except dashes
  sanitized = sanitized.replace(/[^a-z0-9-]/g, '');
  
  // 13. Clean up multiple dashes and strip edges
  while (sanitized.includes('--')) {
    sanitized = sanitized.replace(/--/g, '-');
  }
  sanitized = sanitized.replace(/^-+|-+$/g, '');
  
  // 14. Final check - if result is empty, return "unknown"
  if (!sanitized) {
    return "unknown";
  }
  
  return sanitized;
}

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
 * Get display-friendly artist name for Sigur Rós
 */
export function normalizeSigurRosArtistName(artistName: string): string {
  if (isSigurRos(artistName)) {
    return 'Sigur Rós';
  }
  return artistName;
}
