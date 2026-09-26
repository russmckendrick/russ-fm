#!/usr/bin/env node

/**
 * Sleeve colours for every album → public/album-colors.json.
 *
 * Works in OKLab so "colourful" and "light" match what the eye sees:
 *
 *   1. k-means over every pixel gives the sleeve's main swatches (with how much
 *      of the cover each one covers), its darkest area and its overall tint.
 *   2. A second k-means over only the colourful pixels finds flood candidates,
 *      so a small bright area (a red logo on black) is not averaged away. Each
 *      candidate is the more colourful half of its cluster, not the average.
 *   3. Apple Music's artwork colours join as candidates when they appear on
 *      the sleeve, so every page gets the same flood.
 *   4. Candidates are scored on colourfulness, lightness and coverage. The
 *      best one is the flood; with nothing good enough the flood is a pale
 *      neutral tinted with the sleeve's own cast.
 *
 * Everything the frontend needs is decided here (flood, ink, ground, glow,
 * secondary, hue, vividness), so pages just read it. The sleeve's main
 * swatches go to a separate file (album-swatches.json): only the album page
 * shows them, and they would double the size of the map every page loads.
 *
 * Usage: node scripts/generate-album-colors.js [--force]
 *   Albums already at the current VERSION are kept; --force redoes them all.
 *   Output order follows collection.json and albums no longer in the
 *   collection are dropped, so re-runs are deterministic.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Bump when the algorithm or output shape changes; older entries are redone. */
const VERSION = 2;

const INK = '#0e0d0c';
const CREAM = '#fbf7ef';
/** Minimum candidate score for a flood; below it the sleeve gets a tinted neutral. */
const VIVID_MIN = 0.3;
const SAMPLE_SIZE = 72;

// ---------------------------------------------------------------- colour maths

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToLab(r, g, b) {
  r = toLinear(r / 255);
  g = toLinear(g / 255);
  b = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB, unclamped (may be out of gamut). */
function labToLinearRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = rgb => rgb.every(c => c >= -1e-4 && c <= 1 + 1e-4);
const toLch = ([L, a, b]) => ({ L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 });
const fromLch = (L, C, h) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];

/** OKLCH → #hex, reducing chroma until the colour fits sRGB. */
function lchToHex(L, C, h) {
  let rgb = labToLinearRgb(fromLch(L, C, h));
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(labToLinearRgb(fromLch(L, mid, h)))) lo = mid;
      else hi = mid;
    }
    rgb = labToLinearRgb(fromLch(L, lo, h));
  }
  const byte = c => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255);
  return `#${rgb.map(c => byte(c).toString(16).padStart(2, '0')).join('')}`;
}

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexToLab = hex => rgbToLab(...hexToRgb(hex));
const labToHex = lab => {
  const { L, C, h } = toLch(lab);
  return lchToHex(L, C, h);
};
const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(c => toLinear(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dark ink or cream, whichever reads better on the background. */
const inkOn = bg => (contrast(bg, INK) >= contrast(bg, CREAM) ? INK : CREAM);

/** Lighten a colour (keeping its hue) until it reaches `target` contrast on `against`. */
function liftUntil(hex, against, target) {
  const { L, C, h } = toLch(hexToLab(hex));
  let out = hex;
  for (let t = 0.01; t <= 0.7 && contrast(out, against) < target; t += 0.01) {
    out = lchToHex(Math.min(0.98, L + t), C, h);
  }
  return out;
}

// -------------------------------------------------------------------- k-means

/** Seeded PRNG so the same sleeve always gives the same palette. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** k-means++ in OKLab; returns centroids with their share of the pixels. */
function kmeans(pixels, k, seed) {
  const random = mulberry32(seed);
  const n = pixels.length;
  const centres = [pixels[Math.floor(random() * n)].slice()];
  const weights = new Float64Array(n);
  while (centres.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let nearest = Infinity;
      for (const c of centres) nearest = Math.min(nearest, distance(pixels[i], c) ** 2);
      weights[i] = nearest;
      sum += nearest;
    }
    if (sum === 0) break;
    let r = random() * sum;
    let i = 0;
    for (; i < n - 1 && r > weights[i]; i++) r -= weights[i];
    centres.push(pixels[i].slice());
  }

  const assignment = new Int32Array(n);
  for (let iteration = 0; iteration < 14; iteration++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDistance = Infinity;
      for (let j = 0; j < centres.length; j++) {
        const d = distance(pixels[i], centres[j]);
        if (d < bestDistance) {
          bestDistance = d;
          best = j;
        }
      }
      assignment[i] = best;
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[assignment[i]];
      s[0] += pixels[i][0];
      s[1] += pixels[i][1];
      s[2] += pixels[i][2];
      s[3]++;
    }
    sums.forEach((s, j) => {
      if (s[3]) centres[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }

  const counts = centres.map(() => 0);
  for (let i = 0; i < n; i++) counts[assignment[i]]++;
  return centres.map((lab, j) => ({ lab, share: counts[j] / n })).filter(c => c.share > 0);
}

/** Merge clusters that are practically the same colour; largest first. */
function mergeClose(clusters, tolerance = 0.045) {
  const out = [];
  for (const c of [...clusters].sort((a, b) => b.share - a.share)) {
    const hit = out.find(o => distance(o.lab, c.lab) < tolerance);
    if (hit) {
      const total = hit.share + c.share;
      hit.lab = hit.lab.map((v, i) => (v * hit.share + c.lab[i] * c.share) / total);
      hit.share = total;
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/** Mean of the more colourful half of a cluster: the colour you see, not the average. */
function colourfulCore(pixels, centre) {
  const members = pixels
    .filter(p => distance(p, centre) < 0.1)
    .map(p => ({ p, C: Math.hypot(p[1], p[2]) }))
    .sort((a, b) => b.C - a.C);
  if (!members.length) return centre;
  const top = members.slice(0, Math.ceil(members.length / 2));
  return [0, 1, 2].map(i => top.reduce((s, m) => s + m.p[i], 0) / top.length);
}

/** Share of the sleeve within a small OKLab distance of a colour. */
function coverage(pixels, lab, tolerance = 0.08) {
  let n = 0;
  for (const p of pixels) if (distance(p, lab) < tolerance) n++;
  return n / pixels.length;
}

// -------------------------------------------------------------------- scoring

/** How good a colour is as a flood: 0 (unusable) to about 2.6 (bold, mid-light, large). */
function floodScore({ L, C }, share) {
  if (L < 0.33 || L > 0.94 || C < 0.05) return 0;
  // Small areas only count when they are properly colourful (a red logo on black).
  if (share < 0.03 && C < 0.12) return 0;
  const chroma = Math.min(C, 0.26) / 0.13;
  const light = L < 0.45 ? 0.5 + (0.5 * (L - 0.33)) / 0.12 : L > 0.8 ? 1 - (0.5 * (L - 0.8)) / 0.14 : 1;
  const cover = Math.min(1, Math.sqrt(share / 0.15));
  return chroma * light * (0.4 + 0.6 * cover);
}

function paletteFromPixels(pixels, appleColours) {
  const meanL = pixels.reduce((s, p) => s + p[0], 0) / pixels.length;
  const clusters = mergeClose(kmeans(pixels, 8, 1234567)).map(c => ({ ...c, ...toLch(c.lab), hex: labToHex(c.lab) }));
  const swatches = clusters
    .filter(c => c.share >= 0.02)
    .slice(0, 6)
    .map(c => [c.hex, Math.round(c.share * 100)]);

  // Flood candidates from the colourful pixels only.
  const candidates = [];
  const colourful = pixels.filter(p => Math.hypot(p[1], p[2]) >= 0.05 && p[0] >= 0.3 && p[0] <= 0.95);
  if (colourful.length >= pixels.length * 0.01) {
    for (const c of mergeClose(kmeans(colourful, 6, 7654321), 0.06)) {
      const share = (c.share * colourful.length) / pixels.length;
      if (share < 0.01) continue;
      const lab = colourfulCore(colourful, c.lab);
      const lch = toLch(lab);
      candidates.push({ lab, ...lch, hex: lchToHex(lch.L, lch.C, lch.h), score: floodScore(lch, share) });
    }
  }
  // Apple's artwork colours, when they are actually on the sleeve.
  for (const hex of appleColours) {
    const lab = hexToLab(hex);
    const share = coverage(pixels, lab);
    if (share < 0.01) continue;
    const lch = toLch(lab);
    candidates.push({ lab, ...lch, hex, score: floodScore(lch, share) * 1.1 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]?.score >= VIVID_MIN ? candidates[0] : null;

  let flood;
  let floodLch;
  if (best) {
    flood = best.hex;
    floodLch = toLch(best.lab);
  } else {
    // Pale neutral in the sleeve's own cast: paper, stone, slate.
    const tint = clusters.filter(c => c.share >= 0.05 && c.C >= 0.015).sort((a, b) => b.C - a.C)[0];
    floodLch = {
      L: 0.84 + 0.08 * meanL,
      C: tint ? Math.min(0.022, Math.max(0.008, tint.C * 0.5)) : 0.01,
      h: tint ? tint.h : 75,
    };
    flood = lchToHex(floodLch.L, floodLch.C, floodLch.h);
  }

  // Ground: the sleeve's own dark area, kept dark enough for cream text, never pure black.
  const dark = clusters.filter(c => c.share >= 0.05 && c.L < 0.45).sort((a, b) => a.L - b.L)[0];
  const ground = dark
    ? lchToHex(Math.min(0.24, Math.max(0.17, dark.L)), Math.min(0.045, dark.C), dark.h)
    : lchToHex(0.2, Math.min(0.04, floodLch.C * 0.3), floodLch.h);

  const secondary = best
    ? candidates.find(c =>
        c !== best &&
        c.score >= VIVID_MIN * 0.6 &&
        c.C >= 0.05 &&
        (hueGap(c.h, floodLch.h) >= 40 || Math.abs(c.L - floodLch.L) >= 0.18))
    : null;

  const palette = {
    v: VERSION,
    flood,
    ink: inkOn(flood),
    ground,
    glow: contrast(flood, ground) >= 3 ? flood : liftUntil(flood, ground, 3),
    secondary: secondary ? secondary.hex : null,
    hue: +(floodLch.h / 360).toFixed(3),
    vivid: best ? +best.score.toFixed(2) : 0,
  };
  return { palette, swatches };
}

/** For albums without artwork: the site's neutral flood on its dark ground. */
function defaultPalette() {
  return { v: VERSION, flood: '#e8e2d6', ink: INK, ground: '#1c1916', glow: '#e8e2d6', secondary: null, hue: 0.12, vivid: 0 };
}

// ---------------------------------------------------------------------- inputs

async function readPixels(imagePath) {
  const { data } = await sharp(imagePath)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i < data.length; i += 3) pixels.push(rgbToLab(data[i], data[i + 1], data[i + 2]));
  return pixels;
}

/** Apple Music artwork colours from the album's detail JSON, as #hex. */
async function readAppleColours(detailPath) {
  try {
    const detail = JSON.parse(await fs.readFile(detailPath, 'utf8'));
    const artwork = detail?.services?.apple_music?.raw_attributes?.artwork;
    if (!artwork) return [];
    return ['bgColor', 'textColor1', 'textColor2']
      .map(key => artwork[key])
      .filter(v => typeof v === 'string' && /^[a-f\d]{6}$/i.test(v))
      .map(v => `#${v.toLowerCase()}`);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------------ run

/** One album per line: small diffs, readable, and deterministic. */
async function writeOnePerLine(file, map) {
  const lines = Object.entries(map).map(([uri, value]) => `  ${JSON.stringify(uri)}: ${JSON.stringify(value)}`);
  await fs.writeFile(file, `{\n${lines.join(',\n')}\n}\n`);
}

async function generateAlbumColors() {
  const force = process.argv.includes('--force');
  console.log(`🎨 Generating album colour palettes (v${VERSION}${force ? ', forced' : ''})...`);

  const publicDir = path.join(__dirname, '..', 'public');
  const jsonPath = path.join(publicDir, 'album-colors.json');
  const swatchesPath = path.join(publicDir, 'album-swatches.json');

  try {
    const collection = JSON.parse(await fs.readFile(path.join(publicDir, 'collection.json'), 'utf8'));

    let existing = {};
    let existingSwatches = {};
    try {
      existing = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      existingSwatches = JSON.parse(await fs.readFile(swatchesPath, 'utf8'));
      console.log(`📦 Loaded ${Object.keys(existing).length} existing palettes`);
    } catch {
      console.warn('⚠️  No existing palettes, starting fresh');
    }

    const colours = {};
    const swatches = {};
    let processed = 0;
    let missing = 0;
    const started = Date.now();

    for (const album of collection) {
      const uri = album.uri_release;
      const kept = existing[uri];
      if (!force && kept?.v === VERSION && existingSwatches[uri]) {
        colours[uri] = kept;
        swatches[uri] = existingSwatches[uri];
        continue;
      }

      const slug = uri.replace('/album/', '').replace('/', '');
      const imagePath = path.join(publicDir, 'album', slug, `${slug}-hi-res.jpg`);
      try {
        await fs.access(imagePath);
      } catch {
        colours[uri] = defaultPalette();
        swatches[uri] = [];
        missing++;
        continue;
      }

      const apple = await readAppleColours(path.join(publicDir, 'album', slug, `${slug}.json`));
      const extracted = paletteFromPixels(await readPixels(imagePath), apple);
      colours[uri] = extracted.palette;
      swatches[uri] = extracted.swatches;
      processed++;
      if (processed % 250 === 0) {
        console.log(`📸 ${processed} sleeves (${Math.round((Date.now() - started) / 1000)}s)...`);
      }
    }

    await writeOnePerLine(jsonPath, colours);
    await writeOnePerLine(swatchesPath, swatches);

    const dropped = Object.keys(existing).filter(uri => !(uri in colours)).length;
    console.log(`✅ ${processed} sleeves extracted, ${missing} without artwork, ${dropped} removed albums dropped`);
    console.log(`📋 ${jsonPath}\n📋 ${swatchesPath}`);
  } catch (error) {
    console.error('❌ Error generating album colours:', error);
    process.exit(1);
  }
}

generateAlbumColors();
