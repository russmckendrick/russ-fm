import type { AlbumColorPalette } from '@/hooks/useAlbumColors';

/**
 * Convert hex color to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Calculate luminance of a color (for contrast calculations)
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Check if text color has sufficient contrast on background
 */
export function hasGoodContrast(textColor: string, backgroundColor: string, level: 'AA' | 'AAA' = 'AA'): boolean {
  const ratio = getContrastRatio(textColor, backgroundColor);
  return level === 'AAA' ? ratio >= 7 : ratio >= 4.5;
}

/**
 * Get the best text color (black or white) for a given background
 */
export function getBestTextColor(backgroundColor: string): string {
  const whiteContrast = getContrastRatio('#ffffff', backgroundColor);
  const blackContrast = getContrastRatio('#000000', backgroundColor);
  return whiteContrast > blackContrast ? '#ffffff' : '#000000';
}

/**
 * Lighten a hex color by a percentage
 */
export function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const { r, g, b } = rgb;
  const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));

  return rgbToHex(newR, newG, newB);
}

/**
 * Darken a hex color by a percentage
 */
export function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const { r, g, b } = rgb;
  const newR = Math.max(0, Math.round(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.round(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.round(b * (1 - percent / 100)));

  return rgbToHex(newR, newG, newB);
}

/**
 * Add alpha to a hex color
 */
export function addAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Generate sophisticated gradients that complement artwork
 */
export function createAlbumGradient(colors: AlbumColorPalette, style: 'hero' | 'card' | 'accent' = 'hero'): string {
  const backgroundLuminance = getLuminance(colors.background);
  const accentLuminance = getLuminance(colors.accent);
  
  switch (style) {
    case 'hero':
      // Sophisticated gradient that works well with the artwork
      if (backgroundLuminance > 0.5) {
        // Light background - use more subtle, sophisticated approach
        return `linear-gradient(135deg, 
          ${addAlpha(colors.background, 0.95)} 0%, 
          ${addAlpha(colors.muted, 0.4)} 30%, 
          ${addAlpha(colors.accent, 0.2)} 60%, 
          ${addAlpha(colors.background, 0.9)} 100%)`;
      } else {
        // Dark background - can be more dramatic
        return `linear-gradient(135deg, 
          ${addAlpha(colors.background, 0.9)} 0%, 
          ${addAlpha(colors.accent, 0.6)} 25%, 
          ${addAlpha(colors.muted, 0.4)} 60%, 
          ${addAlpha(colors.background, 0.95)} 100%)`;
      }
    
    case 'card':
      // Very subtle gradient for cards
      return `linear-gradient(145deg, 
        ${addAlpha(colors.background, 0.03)} 0%, 
        ${addAlpha(colors.accent, 0.02)} 100%)`;
    
    case 'accent':
      // Refined accent gradient
      return `linear-gradient(90deg, 
        ${addAlpha(colors.accent, 0.8)} 0%, 
        ${addAlpha(colors.muted, 0.6)} 100%)`;
    
    default:
      return colors.background;
  }
}

/**
 * Generate sophisticated glow effects for album images
 */
export function createGlowGradient(colors: AlbumColorPalette, intensity: 'subtle' | 'medium' | 'bold' = 'medium'): string {
  const backgroundLuminance = getLuminance(colors.background);
  const accentLuminance = getLuminance(colors.accent);
  
  let alpha: number;
  let spread: number;
  
  // Adjust intensity for more vibrant glows
  switch (intensity) {
    case 'subtle':
      alpha = backgroundLuminance > 0.5 ? 0.2 : 0.3;
      spread = 80;
      break;
    case 'medium':
      alpha = backgroundLuminance > 0.5 ? 0.4 : 0.5;
      spread = 75;
      break;
    case 'bold':
      alpha = backgroundLuminance > 0.5 ? 0.6 : 0.7;
      spread = 70;
      break;
  }
  
  // Create more sophisticated glow with better color blending
  return `radial-gradient(ellipse at center, 
    ${addAlpha(colors.accent, alpha)} 0%, 
    ${addAlpha(colors.muted, alpha * 0.6)} 35%, 
    ${addAlpha(colors.background, alpha * 0.3)} 60%, 
    transparent ${spread}%)`;
}

/**
 * Generate dynamic box shadow using album colors
 */
export function createAlbumShadow(colors: AlbumColorPalette, intensity: 'subtle' | 'medium' | 'bold' = 'medium'): string {
  const shadows = {
    subtle: [
      `0 4px 8px ${addAlpha(colors.accent, 0.1)}`,
      `0 2px 4px ${addAlpha(colors.background, 0.05)}`
    ],
    medium: [
      `0 10px 25px ${addAlpha(colors.accent, 0.2)}`,
      `0 4px 10px ${addAlpha(colors.muted, 0.15)}`,
      `0 2px 4px ${addAlpha(colors.background, 0.1)}`
    ],
    bold: [
      `0 20px 40px ${addAlpha(colors.accent, 0.3)}`,
      `0 10px 20px ${addAlpha(colors.muted, 0.2)}`,
      `0 5px 10px ${addAlpha(colors.background, 0.15)}`
    ]
  };

  return shadows[intensity].join(', ');
}

/**
 * Create bold, vibrant color-bleeding effect overlays
 */
export function createColorBleeding(colors: AlbumColorPalette, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'top-left'): string {
  const positions = {
    'top-left': 'ellipse at top left',
    'top-right': 'ellipse at top right',
    'bottom-left': 'ellipse at bottom left',
    'bottom-right': 'ellipse at bottom right'
  };

  const backgroundLuminance = getLuminance(colors.background);
  
  if (backgroundLuminance > 0.5) {
    // Light backgrounds - still need vibrant bleeding
    return `radial-gradient(${positions[position]}, 
      ${addAlpha(colors.accent, 0.4)} 0%, 
      ${addAlpha(colors.muted, 0.25)} 35%, 
      transparent 75%)`;
  } else {
    // Dark backgrounds - maximum dramatic impact
    return `radial-gradient(${positions[position]}, 
      ${addAlpha(colors.accent, 0.6)} 0%, 
      ${addAlpha(colors.muted, 0.4)} 35%, 
      transparent 70%)`;
  }
}

/**
 * Generate CSS custom properties for album colors
 */
export function generateColorProperties(colors: AlbumColorPalette): Record<string, string> {
  return {
    '--album-bg': colors.background,
    '--album-fg': colors.foreground,
    '--album-accent': colors.accent,
    '--album-muted': colors.muted,
    '--album-bg-alpha': addAlpha(colors.background, 0.8),
    '--album-accent-alpha': addAlpha(colors.accent, 0.8),
    '--album-muted-alpha': addAlpha(colors.muted, 0.8),
    '--album-gradient': createAlbumGradient(colors, 'hero'),
    '--album-gradient-card': createAlbumGradient(colors, 'card'),
    '--album-gradient-accent': createAlbumGradient(colors, 'accent'),
    '--album-glow': createGlowGradient(colors, 'medium'),
    '--album-shadow': createAlbumShadow(colors, 'medium')
  };
}

/**
 * Smart color selection that ensures readability with enhanced contrast detection
 */
export function getReadableTextColor(backgroundColor: string, lightColor: string = '#ffffff', darkColor: string = '#000000'): string {
  const lightContrast = getContrastRatio(lightColor, backgroundColor);
  const darkContrast = getContrastRatio(darkColor, backgroundColor);
  
  // For AAA level accessibility, prefer 7:1 ratio
  if (lightContrast >= 7) return lightColor;
  if (darkContrast >= 7) return darkColor;
  
  // For AA level accessibility, require 4.5:1 ratio
  if (lightContrast >= 4.5) return lightColor;
  if (darkContrast >= 4.5) return darkColor;
  
  // If neither meets standards, return the better one but ensure minimum contrast
  const betterColor = lightContrast > darkContrast ? lightColor : darkColor;
  
  // If contrast is still too low, adjust the background-dependent color
  if (Math.max(lightContrast, darkContrast) < 3) {
    const luminance = getLuminance(backgroundColor);
    // Very bright background - use very dark text
    if (luminance > 0.5) return '#1a1a1a';
    // Very dark background - use very bright text  
    return '#f5f5f5';
  }
  
  return betterColor;
}

/**
 * Check if user has dark mode enabled
 */
export function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for explicit dark class on html element
  if (document.documentElement.classList.contains('dark')) {
    return true;
  }

  // Check system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Get enhanced text color with shadow for maximum readability
 * Now considers user's dark mode preference
 */
export function getEnhancedTextColor(backgroundColor: string, albumColors: AlbumColorPalette): { color: string; textShadow: string } {
  const darkMode = isDarkMode();
  const bgLuminance = getLuminance(backgroundColor);

  // In dark mode, prefer lighter text colors even on medium backgrounds
  // In light mode, prefer darker text colors even on medium backgrounds
  let textColor: string;

  if (darkMode) {
    // Dark mode: Be more aggressive with light text
    if (bgLuminance > 0.4) {
      // Bright background - use dark text
      textColor = getReadableTextColor(backgroundColor, '#ffffff', '#1a1a1a');
    } else {
      // Dark or medium background - use light text
      textColor = '#f5f5f5';
    }
  } else {
    // Light mode: Be more aggressive with dark text
    if (bgLuminance < 0.3) {
      // Very dark background - use light text
      textColor = getReadableTextColor(backgroundColor, '#ffffff', '#1a1a1a');
    } else {
      // Light or medium background - use dark text
      textColor = '#1a1a1a';
    }
  }

  // Verify contrast is still good
  const contrast = getContrastRatio(textColor, backgroundColor);
  if (contrast < 4.5) {
    // Fallback to standard algorithm if our preference doesn't work
    textColor = getReadableTextColor(backgroundColor);
  }

  // Choose shadow color based on current theme mode
  let shadowColor: string;
  if (darkMode) {
    // Dark mode - use dark shadow for depth
    shadowColor = `0 2px 4px rgba(0,0,0,0.8), 0 1px 2px ${albumColors.background}80, 0 0 20px ${albumColors.background}60`;
  } else {
    // Light mode - use light/subtle shadow
    shadowColor = `0 2px 4px rgba(255,255,255,0.9), 0 1px 2px rgba(255,255,255,0.7), 0 0 30px rgba(255,255,255,0.5)`;
  }

  return {
    color: textColor,
    textShadow: shadowColor
  };
}

/**
 * Get an accent color that has sufficient contrast against white/light backgrounds.
 * If the original accent has poor contrast, it will be progressively darkened.
 * Useful for text elements displayed on the main content area (not the hero).
 */
export function getAccessibleAccentColor(accentColor: string, minContrastRatio: number = 4.5): string {
  const whiteBackground = '#ffffff';
  let currentColor = accentColor;
  let currentContrast = getContrastRatio(currentColor, whiteBackground);

  // If already has good contrast, return as-is
  if (currentContrast >= minContrastRatio) {
    return currentColor;
  }

  // Progressively darken until we achieve the required contrast
  // Start with small increments for subtle adjustment
  let darkenAmount = 5;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loop

  while (currentContrast < minContrastRatio && iterations < maxIterations) {
    currentColor = darkenColor(currentColor, darkenAmount);
    currentContrast = getContrastRatio(currentColor, whiteBackground);
    iterations++;

    // If we're making slow progress, increase the darken amount
    if (iterations > 10 && currentContrast < minContrastRatio) {
      darkenAmount = 10;
    }
  }

  // If we still don't have good contrast (very rare), fall back to a safe dark color
  if (currentContrast < minContrastRatio) {
    return '#555555';
  }

  return currentColor;
}

/**
 * Generate complementary colors from album palette
 */
export function getComplementaryColors(colors: AlbumColorPalette) {
  return {
    // Lighter versions
    lightAccent: lightenColor(colors.accent, 20),
    lightMuted: lightenColor(colors.muted, 15),
    lightBackground: lightenColor(colors.background, 10),
    
    // Darker versions
    darkAccent: darkenColor(colors.accent, 20),
    darkMuted: darkenColor(colors.muted, 15),
    darkBackground: darkenColor(colors.background, 10),
    
    // Alpha versions
    accentFade: addAlpha(colors.accent, 0.3),
    mutedFade: addAlpha(colors.muted, 0.3),
    backgroundFade: addAlpha(colors.background, 0.3)
  };
}

/**
 * Create bold, vibrant hero backgrounds that match album energy
 */
export function createHeroBackground(colors: AlbumColorPalette): string {
  const backgroundLuminance = getLuminance(colors.background);
  const accentLuminance = getLuminance(colors.accent);
  
  if (backgroundLuminance > 0.5) {
    // Light backgrounds - still need to be bold and vibrant
    return `
      linear-gradient(135deg, 
        ${addAlpha(colors.background, 0.9)} 0%, 
        ${addAlpha(colors.muted, 0.7)} 20%, 
        ${addAlpha(colors.accent, 0.6)} 40%, 
        ${addAlpha(colors.muted, 0.8)} 60%, 
        ${addAlpha(colors.accent, 0.5)} 80%, 
        ${addAlpha(colors.background, 0.85)} 100%),
      radial-gradient(ellipse at top left, 
        ${addAlpha(colors.accent, 0.4)} 0%, 
        transparent 70%),
      radial-gradient(ellipse at bottom right, 
        ${addAlpha(colors.muted, 0.35)} 0%, 
        transparent 75%)
    `;
  } else {
    // Dark backgrounds - maximize drama and vibrancy
    return `
      linear-gradient(135deg, 
        ${addAlpha(colors.background, 0.85)} 0%, 
        ${addAlpha(colors.accent, 0.8)} 20%, 
        ${addAlpha(colors.muted, 0.7)} 40%, 
        ${addAlpha(colors.accent, 0.9)} 60%, 
        ${addAlpha(colors.muted, 0.6)} 80%, 
        ${addAlpha(colors.background, 0.9)} 100%),
      radial-gradient(ellipse at top left, 
        ${addAlpha(colors.accent, 0.5)} 0%, 
        transparent 65%),
      radial-gradient(ellipse at bottom right, 
        ${addAlpha(colors.muted, 0.4)} 0%, 
        transparent 70%)
    `;
  }
}