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
 *     close to it (a toned print a little more); report-artist-images.js
 *     flags those, and the fanart pick avoids them.
 *   - The average colour of COLUMNS vertical strips across the photo: the
 *     desktop hero takes its flood from the strips where the photo fades out.
 *   - The artist's TheAudioDB fanart ({slug}-fanart01.jpg …, from the scrapper's
 *     backfill-fanart), when there is any: one of them is picked for the
 *     desktop hero (a colour photo unless they are all black and white;
 *     among those the first with faces and room beside them for the name) and
 *     written as
 *     `fanart`: its file, size, Vision's face / person / subject boxes, chroma
 *     and the average colour of COLUMNS vertical strips across it, which the
 *     page averages where the photo fades out for the hero's flood. Black-and-
 *     white fanart is left out when the artist's own photo is in colour. A hero
 *     or artist photo chosen in the scrapper (raw_data.overrides) wins; a chosen
 *     photo is measured instead of the -hi-res.jpg and named in `source`.
 *   - Before any of that, letterbox or pillarbox bars (flat black or white
 *     bands a photo was pasted onto) are cut off the -hi-res.jpg itself
 *     (scripts/lib/letterbox.js), so the hero, the round avatars and the
 *     sizes built from it all get the photo without them.
 *
 * Only the artist page reads these, so nothing is added to the pages that
 * load collection-wide data.
 *
 * Usage: node scripts/generate-artist-images.js [--full] [--only <slug>[,<slug>…]]
 *   By default only photos without an -image.json are measured; the others
 *   aren't read at all. --full (alias --force) redoes every artist: use it
 *   after replacing photos or bumping VERSION. --only always redoes the
 *   artists named: one slug or a comma-separated list, and it can be repeated
 *   (report-artist-images.js prints these commands ready to paste).
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
const VERSION = 5;
const SAMPLE = 48;
/** Colour stops down each side edge. */
const PROFILE_STOPS = 12;
/** Vertical strips across a fanart image, each averaged to one colour (the hero's photo flood). */
const COLUMNS = 32;
/** Below this chroma a photo is black and white (as MONO_CHROMA in src/lib/artistImage.ts). */
const MONO_CHROMA = 0.06;
const FANART = /-fanart\d\d\.jpg$/;

const args = process.argv.slice(2);
const full = args.includes('--full') || args.includes('--force');
// --only takes a slug or a comma-separated list, and can be repeated.
const only = new Set(args.flatMap((a, i) => (a === '--only' && args[i + 1] ? args[i + 1].split(',').filter(Boolean) : [])));

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

// ---------------------------------------------------------------- fanart

/** A photo's chroma (as measureColour) and the average colour of COLUMNS vertical strips across it. */
async function measureColumns(file) {
  const { data, info } = await sharp(file).removeAlpha().resize(COLUMNS * 2, SAMPLE / 2, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const spreads = [];
  const sums = Array.from({ length: COLUMNS }, () => [0, 0, 0, 0]);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const p = [data[i], data[i + 1], data[i + 2]];
      spreads.push((Math.max(...p) - Math.min(...p)) / 255);
      const c = sums[Math.floor((x / info.width) * COLUMNS)];
      c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; c[3]++;
    }
  }
  spreads.sort((a, b) => a - b);
  return {
    chroma: round(spreads[Math.floor(spreads.length * 0.95)]),
    columns: sums.map(([r, g, b, n]) => hex(r / n, g / n, b / n)),
  };
}

/** Faces, else people, else the subject: their [x0, x1] across the photo, or null. */
function across(f) {
  const boxes = f.faces.length ? f.faces : f.people.length ? f.people : f.salient ? [f.salient] : [];
  if (!boxes.length) return null;
  return [Math.min(...boxes.map(b => b[0])), Math.max(...boxes.map(b => b[0] + b[2]))];
}

/**
 * The fanart for the hero: colour photos only, unless every one is black and
 * white; among those TheAudioDB's own order, taking the first with faces and
 * a third of the photo clear beside them for the name, else the best scored
 * (faces, room beside them, bigger faces).
 */
function pickFanart(list) {
  const colour = list.filter(f => f.chroma >= MONO_CHROMA);
  const pool = colour.length ? colour : list;
  const room = f => {
    const a = across(f);
    return a ? Math.max(a[0], 1 - a[1]) : -1;
  };
  const roomy = pool.find(f => f.faces.length && room(f) >= 0.35);
  if (roomy) return roomy;
  const score = f => (room(f) < 0 ? -1 : (f.faces.length ? 1 : 0) + room(f) + 0.8 * Math.max(0, ...f.faces.map(b => b[3])));
  return pool.reduce((best, f) => (score(f) > score(best) ? f : best), pool[0]);
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

/** Photos per helper process: one process for thousands of photos runs out of memory and stops. */
const DETECT_BATCH = 300;

/**
 * Run every job through the helper, a batch per process; resolves path → result. Warns about any photo the helper
 * didn't answer for, which then gets no boxes.
 */
async function detectAll(bin, jobs) {
  const results = new Map();
  for (let i = 0; i < jobs.length; i += DETECT_BATCH) {
    for (const [file, result] of await detectBatch(bin, jobs.slice(i, i + DETECT_BATCH))) results.set(file, result);
  }
  const missing = jobs.filter(j => !results.has(j.file)).length;
  if (missing) console.warn(`⚠️  Vision returned nothing for ${missing} photo(s); they have no face or subject boxes`);
  return results;
}

/** One helper process for a batch of jobs; resolves path → result. */
function detectBatch(bin, jobs) {
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
    child.stdin.end(jobs.map(j => j.file).join('\n') + '\n');
  });
}

// ---------------------------------------------------------------- main

/**
 * The artist's hand-set choices from `raw_data.overrides` in its <slug>.json
 * (set in the scrapper; files on disk are never changed for them):
 *   - fanart: which fanart files may be used — blank for all, `off`, or the
 *     numbers to use (`1,2`); every file stays on disk, this decides which count;
 *   - hero: the desktop hero's image — auto, `photo`, or a fanart (`fanart02`);
 *   - photo: a fanart to use as the artist photo (avatar, cards, phone hero)
 *     instead of the downloaded -hi-res.jpg.
 */
async function artistChoices(slug) {
  let overrides = {};
  try {
    const artist = JSON.parse(await fs.readFile(path.join(ARTIST_DIR, slug, `${slug}.json`), 'utf8'));
    overrides = artist.raw_data?.overrides ?? {};
  } catch {
    // No artist JSON: everything automatic.
  }
  const text = key => String(overrides[key] ?? '').trim().toLowerCase();
  const fanartFile = value => {
    const n = Number(/^(?:fanart)?(\d{1,2})$/.exec(value)?.[1]);
    return n >= 1 && n <= 4 ? `${slug}-fanart${String(n).padStart(2, '0')}.jpg` : null;
  };
  const keepText = text('fanart');
  const keep = new Set(keepText.split(/[\s,]+/).map(Number).filter(Boolean));
  const allowed = !keepText
    ? () => true
    : ['off', 'none', 'no', 'false'].includes(keepText)
      ? () => false
      : file => keep.has(Number(/-fanart(\d\d)\.jpg$/.exec(file)?.[1]));
  const hero = text('hero');
  return {
    allowed,
    hero: hero === 'photo' ? 'photo' : fanartFile(hero),
    photo: fanartFile(text('photo')),
  };
}

/** Measure every fanart image of an artist. */
async function measureAllFanart(job, detected) {
  const measured = [];
  for (const name of job.fanart) {
    const file = path.join(ARTIST_DIR, job.slug, name);
    try {
      const meta = await sharp(file).metadata();
      const found = detected.get(file);
      const boxes = list => (list ?? []).map(b => b.map(round));
      const salient = union(found?.salient ?? []);
      measured.push({
        file: name,
        width: meta.width,
        height: meta.height,
        faces: boxes(found?.faces),
        people: boxes(found?.people),
        salient: salient ? [salient[0], salient[1], round(salient[2] - salient[0]), round(salient[3] - salient[1])] : null,
        ...(await measureColumns(file)),
      });
    } catch (err) {
      console.warn(`⚠️  ${job.slug}: ${name}: ${err.message}`);
    }
  }
  return measured;
}

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
    .filter(d => d.isDirectory() && (!only.size || only.has(d.name)))
    .map(d => d.name)
    .sort();

  const redoAll = full || only.size > 0;
  const jobs = [];
  let skipped = 0;
  for (const slug of slugs) {
    const choices = await artistChoices(slug);
    const fanart = (await fs.readdir(path.join(ARTIST_DIR, slug))).filter(f => FANART.test(f) && choices.allowed(f)).sort();
    // The artist photo: a chosen fanart (measured as it is), else the downloaded photo.
    const source = choices.photo && fanart.includes(choices.photo) ? choices.photo : null;
    const file = path.join(ARTIST_DIR, slug, source ?? `${slug}-hi-res.jpg`);
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
      if (!source) {
        const trimmed = await trimBars(file);
        if (trimmed) console.log(`✂️  ${slug}: cut bars, ${trimmed}`);
      }
      bytes = await fs.readFile(file);
    } catch {
      continue;
    }
    const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16);
    jobs.push({ slug, file, out, hash, fanart, source, hero: choices.hero });
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
  const fanartFile = (job, name) => path.join(ARTIST_DIR, job.slug, name);
  const fanartJobs = jobs.flatMap(j => j.fanart.map(name => ({ file: fanartFile(j, name) })));
  const detected = await detectAll(bin, [...jobs, ...fanartJobs]);

  let written = 0;
  const limit = Math.max(2, os.cpus().length - 1);
  for (let i = 0; i < jobs.length; i += limit) {
    await Promise.all(
      jobs.slice(i, i + limit).map(async job => {
        const meta = await sharp(job.file).metadata();
        const colour = await measureColour(job.file);
        const { columns } = await measureColumns(job.file);
        const found = detected.get(job.file);
        if (found?.error) console.warn(`⚠️  ${job.slug}: ${found.error}`);
        const measured = job.fanart.length ? await measureAllFanart(job, detected) : [];
        const picked = measured.length ? pickFanart(measured) : undefined;
        // A hand-picked hero wins; otherwise colour first across both: black-and-white
        // fanart only beats a black-and-white photo.
        const fanart =
          job.hero === 'photo'
            ? undefined
            : job.hero
              ? (measured.find(f => f.file === job.hero) ?? picked)
              : picked && picked.chroma < MONO_CHROMA && colour.chroma >= MONO_CHROMA
                ? undefined
                : picked;
        const data = {
          v: VERSION,
          ...(job.source ? { source: job.source } : {}),
          hash: job.hash,
          width: meta.width,
          height: meta.height,
          ...placement(found),
          ...colour,
          columns,
          ...(fanart ? { fanart } : {}),
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
