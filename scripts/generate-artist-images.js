#!/usr/bin/env node

/**
 * Placement and colour notes for every artist photo, written next to it as
 * public/artist/<slug>/<slug>-image.json, so the artist page can place and
 * blend the portrait without sampling pixels in the browser.
 *
 *   - Faces, people and the main subject come from Apple's Vision framework
 *     (scripts/lib/vision-detect.swift, compiled on first run). macOS only:
 *     elsewhere existing files are left alone and new ones are skipped.
 *   - The backdrop (top and outer edges of the photo) and each edge are
 *     measured with sharp: average colour, luminance and how even it is. The
 *     left, right and top edges also get a smoothed colour profile along the
 *     edge, which the page draws as a soft gradient to carry the photo on past
 *     that edge without streaking whatever touches it.
 *   - How colourful the photo is (chroma, 0–1): the 95th percentile of each
 *     pixel's channel spread (max − min). A black-and-white photo is 0 or
 *     close to it (a toned print a little more); the page keeps those in
 *     plain greyscale rather than trying to bring their colour back.
 *   - The subject's matte (Vision's person segmentation, or for a photo with
 *     nobody in it the foreground mask, plus a spot for any face it missed),
 *     shrunk to MATTE px, and a wide blurred spill of it, each embedded as an
 *     alpha-only WebP data URI. The page lays the photo's own colour through
 *     the matte, so the people come back in colour while the backdrop stays
 *     printed in the flood, and through the spill when the backdrop suits it.
 *     Embedded rather than a file next to the photo: images are served from
 *     R2, and a CSS mask from another origin needs CORS.
 *   - Before any of that, letterbox or pillarbox bars (flat black or white
 *     bands a photo was pasted onto) are cut off the -hi-res.jpg itself
 *     (scripts/lib/letterbox.js), so the hero, the round avatars and the
 *     sizes built from it all get the photo without them.
 *
 * Only the artist page reads these, so nothing is added to the pages that
 * load collection-wide data.
 *
 * Usage: node scripts/generate-artist-images.js [--full] [--only <slug>]
 *   By default only photos without an -image.json are measured; the others
 *   aren't read at all. --full (alias --force) redoes every artist: use it
 *   after replacing photos or bumping VERSION. --only <slug> always redoes
 *   that one artist.
 */

import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { findBars } from './lib/letterbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTIST_DIR = path.join(ROOT, 'public', 'artist');
const HELPER_SRC = path.join(__dirname, 'lib', 'vision-detect.swift');
const HELPER_BIN = path.join(ROOT, 'node_modules', '.cache', 'russfm', 'vision-detect');

/** Bump when the measurements or output shape change; older files are redone. */
const VERSION = 4;
const SAMPLE = 48;
/** The embedded matte's longest side; the browser's upscale gives it a soft edge. */
const MATTE = 192;
/** The spill's longest side: it is all blur, so a tiny one is enough. */
const SPILL_SIZE = 48;
/** Colour stops down each side edge. */
const PROFILE_STOPS = 12;

const args = process.argv.slice(2);
const full = args.includes('--full') || args.includes('--force');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

const round = n => Math.round(n * 1000) / 1000;
const clamp01 = n => Math.min(1, Math.max(0, n));

// ---------------------------------------------------------------- colour

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (r, g, b) => 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Average colour, relative luminance and evenness (1 = flat) of a set of pixels. */
function summarise(pixels) {
  let r = 0, g = 0, b = 0;
  const lums = pixels.map(([pr, pg, pb]) => {
    r += pr; g += pg; b += pb;
    return luminance(pr, pg, pb);
  });
  const n = pixels.length || 1;
  const mean = lums.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(lums.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  return { colour: hex(r / n, g / n, b / n), luminance: round(mean), even: round(clamp01(1 - sd * 3)) };
}

async function measureColour(file) {
  const { data } = await sharp(file).removeAlpha().resize(SAMPLE, SAMPLE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * SAMPLE + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const band = Math.round(SAMPLE * 0.08);
  const top = [], left = [], right = [], bottom = [], backdrop = [], all = [];
  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const p = px(x, y);
      all.push(p);
      if (y < band) top.push(p);
      if (y >= SAMPLE - band) bottom.push(p);
      if (x < band) left.push(p);
      if (x >= SAMPLE - band) right.push(p);
      // Top quarter plus the outer columns: where a backdrop shows (the same
      // region useBackdropTone samples in the browser).
      if (y < SAMPLE / 4 || x < band || x >= SAMPLE - band) backdrop.push(p);
    }
  }
  const back = summarise(backdrop);
  const spreadsOf = pixels => pixels.map(p => (Math.max(...p) - Math.min(...p)) / 255).sort((a, b) => a - b);
  const spreads = spreadsOf(all);
  const chroma = spreads[Math.floor(spreads.length * 0.95)];
  // Outer columns, averaged per row, smoothed over a few rows either side and
  // cut to a handful of stops so no hard shape survives.
  // `along` walks the edge; `depth` is how many pixels in from it to average.
  const profile = (at, depth) => {
    const rows = [];
    for (let a = 0; a < SAMPLE; a++) {
      const c = [0, 0, 0];
      for (let d = 0; d < depth; d++) at(a, d).forEach((v, i) => (c[i] += v / depth));
      rows.push(c);
    }
    const stops = [];
    for (let i = 0; i < PROFILE_STOPS; i++) {
      const centre = Math.round((i / (PROFILE_STOPS - 1)) * (SAMPLE - 1));
      const c = [0, 0, 0];
      let n = 0;
      for (let y = Math.max(0, centre - 4); y <= Math.min(SAMPLE - 1, centre + 4); y++) {
        rows[y].forEach((v, k) => (c[k] += v));
        n++;
      }
      stops.push(hex(c[0] / n, c[1] / n, c[2] / n));
    }
    return stops;
  };
  return {
    backdrop: { ...back, tone: back.luminance >= 0.214 ? 'light' : 'dark' },
    edges: {
      top: { ...summarise(top), profile: profile((x, d) => px(x, d), 2) },
      left: { ...summarise(left), profile: profile((y, d) => px(d, y), 2) },
      right: { ...summarise(right), profile: profile((y, d) => px(SAMPLE - 1 - d, y), 2) },
      bottom: summarise(bottom),
    },
    luminance: summarise(all).luminance,
    chroma: round(chroma),
  };
}

// ---------------------------------------------------------------- bars

/** Cut letterbox/pillarbox bars off a photo in place: the size change, or false. */
async function trimBars(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bars = findBars(data, info.width, info.height, info.channels);
  const width = info.width - bars.left - bars.right;
  const height = info.height - bars.top - bars.bottom;
  if (width === info.width && height === info.height) return false;
  const trimmed = await sharp(file)
    .extract({ left: bars.left, top: bars.top, width, height })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  await fs.writeFile(file, trimmed);
  return `${info.width}×${info.height} → ${width}×${height}`;
}

// ---------------------------------------------------------------- placement

/** Union of [x, y, w, h] boxes as [x0, y0, x1, y1], clamped to the photo. */
function union(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b[0]));
  const y0 = Math.min(...boxes.map(b => b[1]));
  const x1 = Math.max(...boxes.map(b => b[0] + b[2]));
  const y1 = Math.max(...boxes.map(b => b[1] + b[3]));
  return [x0, y0, x1, y1].map(v => round(clamp01(v)));
}

function placement(detected) {
  const faces = detected?.faces ?? [];
  const people = detected?.people ?? [];
  const salient = detected?.salient ?? [];
  const faceBox = union(faces);
  // People boxes cover whole figures; faces alone miss shoulders, so pad them.
  const padded = faces.map(([x, y, w, h]) => [x - w * 0.8, y - h * 0.4, w * 2.6, h * 4]);
  const subject = union(people.length ? [...people, ...faces] : faces.length ? padded : salient);
  const focus = faceBox
    ? [round((faceBox[0] + faceBox[2]) / 2), round((faceBox[1] + faceBox[3]) / 2)]
    : subject
      ? [round((subject[0] + subject[2]) / 2), round(subject[1] + (subject[3] - subject[1]) * 0.25)]
      : null;
  const boxes = list => list.map(b => b.map(round));
  return { faces: boxes(faces), people: boxes(people), subject, focus };
}

/** Raw pixels as a small alpha-only WebP data URI (black, with them as alpha). */
async function alphaDataUri(data, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = data[i];
  const webp = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ quality: 60, alphaQuality: 80 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString('base64')}`;
}

/**
 * The matte and its spill, from Vision's greyscale matte PNG, as alpha-only
 * WebP data URIs.
 *   - matte: the people, steepened (over about 72% solid, filling soft patches
 *     inside a figure), then feathered inside the silhouette: the colour is
 *     full a few pixels in and gone by the outline, so it fades into the
 *     greyscale print of the person and never shows a rim of backdrop. Plus a
 *     head-and-shoulders spot (faceSpots) for each face the segmentation
 *     missed: it drops people in tight groups (the back row, someone out of
 *     focus), face detection rarely does.
 *   - spill: the same shape blurred wide at SPILL_SIZE px, a spotlight's glow
 *     of the photo's own backdrop round the people. The page shows it only
 *     when that backdrop is about as light as the flood; a white or black
 *     backdrop against a mid flood would be a halo.
 */
async function matteDataUris(file, faces = []) {
  const shrunk = sharp(file).greyscale().resize(MATTE, MATTE, { fit: 'inside' });
  const raw = img => img.raw().toBuffer({ resolveWithObject: true });
  const core = await raw(shrunk.clone().linear(2, -0.45 * 255).blur(1.4).linear(2, -1.0 * 255));
  const { width, height, channels } = core.info;
  const at = i => core.data[i * channels];
  const covered = ([fx, fy, fw, fh]) => {
    let sum = 0, n = 0;
    for (let y = Math.floor(fy * height); y < Math.ceil((fy + fh) * height); y++) {
      for (let x = Math.floor(fx * width); x < Math.ceil((fx + fw) * width); x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          sum += at(y * width + x);
          n++;
        }
      }
    }
    return n > 0 && sum / n > 128;
  };
  const spots = faceSpots(faces.filter(f => !covered(f)), width, height);
  const matte = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) matte[i] = Math.max(at(i), spots[i]);

  const spill = await raw(shrunk.clone().blur(MATTE * 0.07).resize(SPILL_SIZE, SPILL_SIZE, { fit: 'inside' }));
  const spillPixels = Uint8Array.from({ length: spill.info.width * spill.info.height }, (_, i) => spill.data[i * spill.info.channels]);
  return {
    matte: await alphaDataUri(matte, width, height),
    spill: await alphaDataUri(spillPixels, spill.info.width, spill.info.height),
  };
}

/**
 * A head-and-shoulders ellipse per face, 0–255 at matte size: centred just
 * below the face, wide enough for the shoulders and tall enough for the hair,
 * solid to 60% of the way out and easing to nothing at the rim.
 */
function faceSpots(faces, width, height) {
  const out = new Uint8Array(width * height);
  for (const [fx, fy, fw, fh] of faces) {
    const cx = (fx + fw / 2) * width;
    const cy = (fy + fh * 1.1) * height;
    const rx = fw * 1.1 * width;
    const ry = fh * 1.9 * height;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, Math.ceil(cy + ry)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(width, Math.ceil(cx + rx)); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const t = clamp01((1 - d) / 0.4);
        const v = Math.round(255 * t * t * (3 - 2 * t));
        if (v > out[y * width + x]) out[y * width + x] = v;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- vision helper

async function visionHelper() {
  if (process.platform !== 'darwin') return null;
  try {
    let stale = true;
    try {
      const [src, bin] = await Promise.all([fs.stat(HELPER_SRC), fs.stat(HELPER_BIN)]);
      stale = src.mtimeMs > bin.mtimeMs;
    } catch {
      // Not built yet.
    }
    if (stale) {
      console.log('🔧 Compiling Vision helper…');
      await fs.mkdir(path.dirname(HELPER_BIN), { recursive: true });
      execFileSync('swiftc', ['-O', HELPER_SRC, '-o', HELPER_BIN], { stdio: 'inherit' });
    }
    return HELPER_BIN;
  } catch (err) {
    console.warn('⚠️  Vision helper unavailable:', err.message);
    return null;
  }
}

/** Run every job through the helper in one process (asking for its matte); resolves path → result. */
function detectAll(bin, jobs) {
  return new Promise((resolve, reject) => {
    const results = new Map();
    const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        results.set(parsed.path, parsed);
      }
    });
    child.on('error', reject);
    child.on('close', () => resolve(results));
    child.stdin.end(jobs.map(j => `${j.file}\t${j.matte}`).join('\n') + '\n');
  });
}

// ---------------------------------------------------------------- main

/** Existing notes written by an older VERSION (cheap: reads only the JSON). */
async function countStale(slugs) {
  let n = 0;
  for (const slug of slugs) {
    try {
      const existing = JSON.parse(await fs.readFile(path.join(ARTIST_DIR, slug, `${slug}-image.json`), 'utf8'));
      if (existing.v !== VERSION) n++;
    } catch {
      // Missing or unreadable: measured this run anyway.
    }
  }
  return n;
}

async function main() {
  const slugs = (await fs.readdir(ARTIST_DIR, { withFileTypes: true }))
    .filter(d => d.isDirectory() && (!only || d.name === only))
    .map(d => d.name)
    .sort();

  const redoAll = full || !!only;
  const jobs = [];
  let skipped = 0;
  for (const slug of slugs) {
    const file = path.join(ARTIST_DIR, slug, `${slug}-hi-res.jpg`);
    const out = path.join(ARTIST_DIR, slug, `${slug}-image.json`);
    // Default: only photos that have no notes yet.
    if (!redoAll) {
      try {
        await fs.access(out);
        skipped++;
        continue;
      } catch {
        // No notes yet: measure it.
      }
    }
    let bytes;
    try {
      const trimmed = await trimBars(file);
      if (trimmed) console.log(`✂️  ${slug}: cut bars, ${trimmed}`);
      bytes = await fs.readFile(file);
    } catch {
      continue;
    }
    const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16);
    jobs.push({ slug, file, out, hash });
  }

  const stale = redoAll ? 0 : await countStale(slugs);
  console.log(`🖼️  Artist images: ${jobs.length} to measure, ${skipped} already done${full ? '' : ' (--full redoes all)'}`);
  if (stale) console.log(`ℹ️  ${stale} existing files are from an older VERSION; run with --full to update them`);
  if (!jobs.length) return;

  const bin = await visionHelper();
  if (!bin) {
    console.warn('⚠️  Face and subject detection needs macOS (Vision). Nothing written.');
    return;
  }
  const matteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'russfm-matte-'));
  jobs.forEach(j => (j.matte = path.join(matteDir, `${j.slug}.png`)));
  const detected = await detectAll(bin, jobs);

  let written = 0;
  const limit = Math.max(2, os.cpus().length - 1);
  for (let i = 0; i < jobs.length; i += limit) {
    await Promise.all(
      jobs.slice(i, i + limit).map(async job => {
        const meta = await sharp(job.file).metadata();
        const colour = await measureColour(job.file);
        const found = detected.get(job.file);
        if (found?.error) console.warn(`⚠️  ${job.slug}: ${found.error}`);
        const mattes = found?.matte ? await matteDataUris(job.matte, found.faces) : undefined;
        const data = {
          v: VERSION,
          hash: job.hash,
          width: meta.width,
          height: meta.height,
          ...placement(found),
          ...colour,
          ...mattes,
        };
        await fs.writeFile(job.out, JSON.stringify(data) + '\n');
        written++;
      }),
    );
  }
  await fs.rm(matteDir, { recursive: true, force: true });
  console.log(`✅ Wrote ${written} artist image files`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
