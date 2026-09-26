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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARTIST_DIR = path.join(ROOT, 'public', 'artist');
const HELPER_SRC = path.join(__dirname, 'lib', 'vision-detect.swift');
const HELPER_BIN = path.join(ROOT, 'node_modules', '.cache', 'russfm', 'vision-detect');

/** Bump when the measurements or output shape change; older files are redone. */
const VERSION = 3;
const SAMPLE = 48;
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
  };
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

/** Run every path through the helper in one process; resolves path → result. */
function detectAll(bin, files) {
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
    child.stdin.end(files.join('\n') + '\n');
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
  const detected = await detectAll(bin, jobs.map(j => j.file));

  let written = 0;
  const limit = Math.max(2, os.cpus().length - 1);
  for (let i = 0; i < jobs.length; i += limit) {
    await Promise.all(
      jobs.slice(i, i + limit).map(async job => {
        const meta = await sharp(job.file).metadata();
        const colour = await measureColour(job.file);
        const found = detected.get(job.file);
        if (found?.error) console.warn(`⚠️  ${job.slug}: ${found.error}`);
        const data = {
          v: VERSION,
          hash: job.hash,
          width: meta.width,
          height: meta.height,
          ...placement(found),
          ...colour,
        };
        await fs.writeFile(job.out, JSON.stringify(data) + '\n');
        written++;
      }),
    );
  }
  console.log(`✅ Wrote ${written} artist image files`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
