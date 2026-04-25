interface ColorPalette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number;
  let s: number;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

function adjustColorLightness(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(100, l + amount));
  
  // Convert back to RGB
  const hue = h / 360;
  const saturation = s / 100;
  const lightness = newL / 100;
  
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
  const m = lightness - c / 2;
  
  let newR, newG, newB;
  
  if (hue < 1/6) {
    [newR, newG, newB] = [c, x, 0];
  } else if (hue < 2/6) {
    [newR, newG, newB] = [x, c, 0];
  } else if (hue < 3/6) {
    [newR, newG, newB] = [0, c, x];
  } else if (hue < 4/6) {
    [newR, newG, newB] = [0, x, c];
  } else if (hue < 5/6) {
    [newR, newG, newB] = [x, 0, c];
  } else {
    [newR, newG, newB] = [c, 0, x];
  }
  
  newR = Math.round((newR + m) * 255);
  newG = Math.round((newG + m) * 255);
  newB = Math.round((newB + m) * 255);
  
  return rgbToHex(newR, newG, newB);
}

// Median Cut Algorithm for better color extraction
function medianCut(colors: RgbColor[], depth: number = 0): RgbColor[] {
  if (depth >= 4 || colors.length <= 1) {
    // Return average color of this group
    const avg = colors.reduce(
      (acc, color) => ({
        r: acc.r + color.r,
        g: acc.g + color.g,
        b: acc.b + color.b,
      }),
      { r: 0, g: 0, b: 0 }
    );
    return [{
      r: Math.round(avg.r / colors.length),
      g: Math.round(avg.g / colors.length),
      b: Math.round(avg.b / colors.length),
    }];
  }

  // Find the color channel with the widest range
  const ranges = {
    r: Math.max(...colors.map(c => c.r)) - Math.min(...colors.map(c => c.r)),
    g: Math.max(...colors.map(c => c.g)) - Math.min(...colors.map(c => c.g)),
    b: Math.max(...colors.map(c => c.b)) - Math.min(...colors.map(c => c.b)),
  };

  const widestChannel = Object.keys(ranges).reduce((a, b) => 
    ranges[a as keyof typeof ranges] > ranges[b as keyof typeof ranges] ? a : b
  ) as keyof RgbColor;

  // Sort colors by the widest channel
  colors.sort((a, b) => a[widestChannel] - b[widestChannel]);

  // Split at median
  const median = Math.floor(colors.length / 2);
  const left = colors.slice(0, median);
  const right = colors.slice(median);

  // Recursively process both halves
  return [
    ...medianCut(left, depth + 1),
    ...medianCut(right, depth + 1)
  ];
}

export async function extractColorsFromImage(imageUrl: string): Promise<ColorPalette> {
  return new Promise((resolve) => {
    const img = new Image();
    
    // Only set crossOrigin for external URLs (R2), not for local development
    if (imageUrl.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(getDefaultPalette());
        return;
      }
      
      // Use optimal size for performance
      canvas.width = 200;
      canvas.height = 200;
      
      ctx.drawImage(img, 0, 0, 200, 200);
      
      try {
        const imageData = ctx.getImageData(0, 0, 200, 200);
        const data = imageData.data;
        
        const colors: RgbColor[] = [];
        
        // Extract colors with better sampling
        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          if (a < 200) continue; // Skip transparent pixels
          
          // Skip near-black and near-white colors
          const [, , l] = rgbToHsl(r, g, b);
          if (l < 5 || l > 95) continue;
          
          colors.push({ r, g, b });
        }
        
        if (colors.length === 0) {
          resolve(getDefaultPalette());
          return;
        }
        
        // Apply Median Cut algorithm to get representative palette
        const palette = medianCut(colors, 0);
        
        if (palette.length === 0) {
          resolve(getDefaultPalette());
          return;
        }
        
        // Analyze palette colors for roles
        const paletteWithMetrics = palette.map(color => {
          const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
          return {
            color,
            hex: rgbToHex(color.r, color.g, color.b),
            hsl: { h, s, l },
            vibrance: s * (l > 50 ? 100 - l : l) / 50 // Custom vibrance metric
          };
        });
        
        // Sort by vibrance for accent color
        const vibrantColors = [...paletteWithMetrics]
          .filter(c => c.hsl.s > 25 && c.hsl.l > 15 && c.hsl.l < 85)
          .sort((a, b) => b.vibrance - a.vibrance);
        
        // Sort by lightness for background
        const darkColors = [...paletteWithMetrics]
          .filter(c => c.hsl.l < 50)
          .sort((a, b) => a.hsl.l - b.hsl.l);
        
        // Pick accent color (most vibrant)
        const accentColor = vibrantColors[0] || paletteWithMetrics[0];
        const accentHex = accentColor.hex;
        
        // Pick background color (darkest available, or darken accent)
        let backgroundHex: string;
        if (darkColors.length > 0 && darkColors[0] !== accentColor) {
          backgroundHex = darkColors[0].hex;
          // Ensure it's dark enough
          if (darkColors[0].hsl.l > 30) {
            backgroundHex = adjustColorLightness(backgroundHex, -40);
          }
        } else {
          // Darken the accent color for background
          backgroundHex = adjustColorLightness(accentHex, -60);
        }
        
        // Pick muted color (mid-saturation, mid-lightness)
        const mutedColor = paletteWithMetrics.find(c => 
          c.hsl.s > 15 && c.hsl.s < 70 && 
          c.hsl.l > 30 && c.hsl.l < 70 &&
          c !== accentColor
        ) || paletteWithMetrics[1] || accentColor;
        
        const mutedHex = adjustColorLightness(mutedColor.hex, 
          mutedColor.hsl.l > 60 ? -20 : 0
        );
        
        resolve({
          background: backgroundHex,
          foreground: '#ffffff',
          accent: accentHex,
          muted: mutedHex,
        });
        
      } catch (error) {
        console.warn('Error extracting colors:', error);
        resolve(getDefaultPalette());
      }
    };
    
    img.onerror = () => {
      resolve(getDefaultPalette());
    };
    
    img.src = imageUrl;
  });
}

function getDefaultPalette(): ColorPalette {
  return {
    background: '#1a1a2e',
    foreground: '#ffffff',
    accent: '#0066cc',
    muted: '#666666',
  };
}

export type { ColorPalette };
