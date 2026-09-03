#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color extraction utilities (Node.js version)
function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

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

function adjustColorLightness(hex, amount) {
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

  if (hue < 1 / 6) {
    [newR, newG, newB] = [c, x, 0];
  } else if (hue < 2 / 6) {
    [newR, newG, newB] = [x, c, 0];
  } else if (hue < 3 / 6) {
    [newR, newG, newB] = [0, c, x];
  } else if (hue < 4 / 6) {
    [newR, newG, newB] = [0, x, c];
  } else if (hue < 5 / 6) {
    [newR, newG, newB] = [x, 0, c];
  } else {
    [newR, newG, newB] = [c, 0, x];
  }

  newR = Math.round((newR + m) * 255);
  newG = Math.round((newG + m) * 255);
  newB = Math.round((newB + m) * 255);

  return rgbToHex(newR, newG, newB);
}

function medianCut(colors, depth = 0) {
  if (depth >= 4 || colors.length <= 1) {
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

  const ranges = {
    r: Math.max(...colors.map(c => c.r)) - Math.min(...colors.map(c => c.r)),
    g: Math.max(...colors.map(c => c.g)) - Math.min(...colors.map(c => c.g)),
    b: Math.max(...colors.map(c => c.b)) - Math.min(...colors.map(c => c.b)),
  };

  const widestChannel = Object.keys(ranges).reduce((a, b) =>
    ranges[a] > ranges[b] ? a : b
  );

  colors.sort((a, b) => a[widestChannel] - b[widestChannel]);

  const median = Math.floor(colors.length / 2);
  const left = colors.slice(0, median);
  const right = colors.slice(median);

  return [
    ...medianCut(left, depth + 1),
    ...medianCut(right, depth + 1)
  ];
}

async function extractColorsFromImage(imagePath) {
  try {
    // Use Sharp to resize and get raw pixel data
    const { data, info } = await sharp(imagePath)
      .resize(200, 200)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    const colors = [];

    // Extract colors with sampling (Sharp returns RGBA data)
    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 200) continue;

      const [, , l] = rgbToHsl(r, g, b);
      if (l < 5 || l > 95) continue;

      colors.push({ r, g, b });
    }

    if (colors.length === 0) {
      return getDefaultPalette();
    }

    const palette = medianCut(colors, 0);

    if (palette.length === 0) {
      return getDefaultPalette();
    }

    const paletteWithMetrics = palette.map(color => {
      const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
      return {
        color,
        hex: rgbToHex(color.r, color.g, color.b),
        hsl: { h, s, l },
        vibrance: s * (l > 50 ? 100 - l : l) / 50
      };
    });

    const vibrantColors = [...paletteWithMetrics]
      .filter(c => c.hsl.s > 25 && c.hsl.l > 15 && c.hsl.l < 85)
      .sort((a, b) => b.vibrance - a.vibrance);

    const darkColors = [...paletteWithMetrics]
      .filter(c => c.hsl.l < 50)
      .sort((a, b) => a.hsl.l - b.hsl.l);

    const accentColor = vibrantColors[0] || paletteWithMetrics[0];
    const accentHex = accentColor.hex;

    let backgroundHex;
    if (darkColors.length > 0 && darkColors[0] !== accentColor) {
      backgroundHex = darkColors[0].hex;
      if (darkColors[0].hsl.l > 30) {
        backgroundHex = adjustColorLightness(backgroundHex, -40);
      }
    } else {
      backgroundHex = adjustColorLightness(accentHex, -60);
    }

    const mutedColor = paletteWithMetrics.find(c =>
      c.hsl.s > 15 && c.hsl.s < 70 &&
      c.hsl.l > 30 && c.hsl.l < 70 &&
      c !== accentColor
    ) || paletteWithMetrics[1] || accentColor;

    const mutedHex = adjustColorLightness(mutedColor.hex,
      mutedColor.hsl.l > 60 ? -20 : 0
    );

    return {
      background: backgroundHex,
      foreground: '#ffffff',
      accent: accentHex,
      muted: mutedHex,
    };

  } catch (error) {
    console.warn(`Error extracting colors from ${imagePath}:`, error.message);
    return getDefaultPalette();
  }
}

function getDefaultPalette() {
  return {
    background: '#1a1a2e',
    foreground: '#ffffff',
    accent: '#0066cc',
    muted: '#666666',
  };
}

function sanitizeSlugForCSS(slug) {
  // Replace invalid CSS characters with dashes and ensure it starts with a letter
  return slug.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^[^a-zA-Z]/, 'a');
}

async function generateAlbumColors() {
  console.log('🎨 Generating album color palettes...');

  const publicDir = path.join(__dirname, '..', 'public');
  const collectionPath = path.join(publicDir, 'collection.json');
  const jsonPath = path.join(publicDir, 'album-colors.json');

  try {
    const collectionData = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
    const cssRules = [];
    const colorMap = {};

    let processed = 0;
    const total = collectionData.length;

    let existingColors = {};
    try {
      if (await fs.stat(jsonPath).catch(() => false)) {
        existingColors = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
        console.log(`📦 Loaded ${Object.keys(existingColors).length} existing color palettes`);
      }
    } catch (e) {
      console.warn('⚠️  Could not load existing colors, starting fresh');
    }

    // Merge existing into the new map
    // We will overwrite if we re-process, but we populate first to allow skipping
    Object.assign(colorMap, existingColors);

    // Add existing colors to CSS rules to preserve them even if we skip
    // Actually, we'll just regenerate the CSS at the end from the full map

    for (const album of collectionData) {
      // Check if we already have colors for this album
      if (existingColors[album.uri_release]) {
        // We still need to generate the CSS rule for this cached item
        const palette = existingColors[album.uri_release];
        const slug = album.uri_release.replace('/album/', '').replace('/', '');
        const cssSlug = sanitizeSlugForCSS(slug);

        cssRules.push(`
.album-${cssSlug} {
  --album-bg: ${palette.background};
  --album-fg: ${palette.foreground};
  --album-accent: ${palette.accent};
  --album-muted: ${palette.muted};
}`);
        // Already in colorMap via Object.assign
        continue;
      }

      const slug = album.uri_release.replace('/album/', '').replace('/', '');

      const imagePath = path.join(publicDir, 'album', slug, `${slug}-hi-res.jpg`);

      try {
        await fs.access(imagePath);
        const palette = await extractColorsFromImage(imagePath);
        const cssSlug = sanitizeSlugForCSS(slug);

        // Generate CSS custom properties
        cssRules.push(`
.album-${cssSlug} {
  --album-bg: ${palette.background};
  --album-fg: ${palette.foreground};
  --album-accent: ${palette.accent};
  --album-muted: ${palette.muted};
}`);

        // Store in color map for JavaScript access
        colorMap[album.uri_release] = palette;

        processed++;
        if (processed % 50 === 0) {
          console.log(`📸 Processed ${processed}/${total} albums...`);
        }
      } catch (error) {
        // Image file doesn't exist, use default palette
        const palette = getDefaultPalette();
        const cssSlug = sanitizeSlugForCSS(slug);

        cssRules.push(`
.album-${cssSlug} {
  --album-bg: ${palette.background};
  --album-fg: ${palette.foreground};
  --album-accent: ${palette.accent};
  --album-muted: ${palette.muted};
}`);

        colorMap[album.uri_release] = palette;
      }
    }

    // Write CSS file
    // No timestamp: output must be deterministic so re-running the script
    // with no new albums leaves the committed files untouched.
    const cssContent = `/* Auto-generated album color palettes */
${cssRules.join('\n')}`;

    const cssPath = path.join(publicDir, 'album-colors.css');
    await fs.writeFile(cssPath, cssContent);

    // Write JSON color map for JavaScript access
    await fs.writeFile(jsonPath, JSON.stringify(colorMap, null, 2));

    console.log(`✅ Generated colors for ${processed} albums`);
    console.log(`📝 CSS file: ${cssPath}`);
    console.log(`📋 JSON file: ${jsonPath}`);

  } catch (error) {
    console.error('❌ Error generating album colors:', error);
    process.exit(1);
  }
}

generateAlbumColors();