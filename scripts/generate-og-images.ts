#!/usr/bin/env tsx
/**
 * Open Graph cards (1200×630 PNG) for every album, every artist and the site,
 * in the player design (shared pieces in scripts/lib/og-kit.ts):
 *
 *   album/<slug>/og-image.png    the record's listening room (the album page's
 *                                hero): the sleeve on its stand, the record on
 *                                the turntable, over a flood band with the
 *                                pressing line, title and artist
 *   artist/<slug>/og-image.png   the artist's fly-poster wall (the artist page's
 *                                hero) over a flood band with name and records
 *   og-image.png                 the /albums record-shop ledge with the newest
 *                                eight sleeves, over a band with the counts
 *
 *   pnpm run generate-og [outputDir] [--cache-dir dir] [--only album|artist|site] [--match text]
 *
 * Cards already in the target are kept (CI caches them) unless the target's
 * og-version.txt differs from OG_VERSION: bump it when the design changes and
 * every card is drawn again once.
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tvRoomFor } from '../src/lib/tv';
import { photoSourceFile, type PhotoNotes } from '../src/lib/artistPhotoSource';
import type { Album } from '../src/types/album';
import { condSize, cutoutScene, fitCover, h, kicker, latin, NEUTRAL, plural, publicDir, render, root, sceneCard, W, type Box, type Palette } from './lib/og-kit';

/** Bump when the card design changes, so cached cards are all drawn again. */
const OG_VERSION = 'player-2026-11';
const SCENE_H = 420;

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await fs.readFile(file, 'utf8'));

const collection = await readJson<Album[]>(path.join(publicDir, 'collection.json'));
const colours = await readJson<Record<string, Palette>>(path.join(publicDir, 'album-colors.json'));
const palette = (uri: string): Palette => colours[uri] ?? NEUTRAL;
const roomGeometry = await readJson<Record<string, { sleeve: Box; record: { x: number; y: number; rx: number; ry: number; cover: number; hole: number } }>>(path.join(root, 'src/config/release-rooms.json'));
const wallGeometry = await readJson<Record<string, { aspect: number; poster: Box }>>(path.join(root, 'src/config/artist-walls.json'));
const ledge = (await readJson<Record<string, { aspect: number; slots: Box[] }>>(path.join(root, 'src/config/index-headers.json'))).albums;
const skippedArtists = new Set((await readJson<{ artists?: string[] }>(path.join(root, 'scripts/og-skip.json'))).artists ?? []);

const slugOf = (uri: string) => uri.split('/')[2];
const exists = (file: string) => fs.access(file).then(() => true, () => false);
const byAdded = (a: Album, b: Album) => b.date_added.localeCompare(a.date_added);
/** Collection albums as /albums lists them (box set members live inside their box). */
const listed = collection.filter(a => !a.boxset);

/** A sleeve's hi-res file, or null when it has none on disk. */
async function coverFile(album: Album): Promise<string | null> {
  const slug = slugOf(album.uri_release);
  for (const name of [`${slug}-hi-res.jpg`, `${slug}-medium.jpg`]) {
    const file = path.join(publicDir, 'album', slug, name);
    if (await exists(file)) return file;
  }
  return null;
}

/** The room a record plays in: its TV channel's (as releaseRoomFor in src/lib/releaseRooms.ts). */
function roomOf(records: Array<Pick<Album, 'genre_names' | 'styles'>>): string {
  const counts = new Map<string, number>();
  for (const r of records) {
    const id = tvRoomFor(r.genre_names ?? [], r.styles ?? []);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Newest record's room first, and the sort is stable, so ties go to it.
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'shelves';
}

// ---------------------------------------------------------------------------
// Albums

/** The record on the platter: a black disc filling the photo's cut-out, the sleeve printed on its label. */
function recordLayer(cover: Buffer, hole: number) {
  return async (w: number, hgt: number) => {
    const rings = Array.from({ length: 7 }, (_, i) => {
      const k = 0.94 - i * 0.075;
      return `<ellipse cx="${w / 2}" cy="${hgt / 2}" rx="${(w / 2) * k}" ry="${(hgt / 2) * k}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>`;
    }).join('');
    const disc = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><defs><radialGradient id="s" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#0b0b0b"/></radialGradient></defs><ellipse cx="${w / 2}" cy="${hgt / 2}" rx="${w / 2}" ry="${hgt / 2}" fill="url(#s)"/>${rings}</svg>`,
      ),
    )
      .png()
      .toBuffer();
    const lw = Math.max(2, Math.round(w * hole));
    const lh = Math.max(2, Math.round(hgt * hole));
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lw}" height="${lh}"><ellipse cx="${lw / 2}" cy="${lh / 2}" rx="${lw / 2}" ry="${lh / 2}" fill="#fff"/></svg>`);
    const label = await sharp(await fitCover(cover, lw, lh)).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    return sharp(disc).composite([{ input: label, left: Math.round((w - lw) / 2), top: Math.round((hgt - lh) / 2) }]).png().toBuffer();
  };
}

async function albumCard(album: Album, file: string): Promise<boolean> {
  const coverPath = await coverFile(album);
  if (!coverPath) return false;
  const cover = await sharp(coverPath).rotate().jpeg({ quality: 92 }).toBuffer();
  const p = palette(album.uri_release);
  const roomId = roomGeometry[roomOf([album])] ? roomOf([album]) : 'shelves';
  const room = roomGeometry[roomId];
  const s = room.sleeve;
  const d = room.record;
  // The record: a circle round the spindle, big enough to fill the cut-out (the
  // photo hides the rest), squashed into the turntable's perspective.
  const recordBox: Box = { left: d.x - d.cover * d.rx, top: d.y - d.cover * d.ry, width: 2 * d.cover * d.rx, height: 2 * d.cover * d.ry };
  // Frame the stand and the turntable together across most of the card.
  const span = d.x + d.rx - s.left;
  const shot = await cutoutScene({
    photo: path.join(publicDir, 'release-rooms', `${roomId}-hi-res.webp`),
    aspect: 1.5,
    layers: [
      { box: s, input: cover, bleed: 3 },
      { box: recordBox, input: recordLayer(cover, d.hole / d.cover) },
    ],
    tint: p.flood,
    // …and the sleeve no taller than three quarters of the scene, so the stand shows whole.
    scale: Math.min((W * 0.8) / (span / 100), ((SCENE_H * 0.74) / (s.height / 100)) * 1.5),
    centre: [(s.left + d.x + d.rx) / 2, s.top + s.height * 0.5],
    height: SCENE_H,
  });

  const title = latin(album.release_name).toUpperCase() || 'UNTITLED';
  const size = condSize(title, 860, 78, 34, 2);
  const year = album.year_original ?? Number.parseInt(album.date_release_year?.slice(0, 4) ?? '', 10);
  const line = [Number.isFinite(year) && year > 1900 ? String(year) : null, album.labels?.[0]?.replace(/\s*\(\d+\)$/, ''), album.format_primary].filter(Boolean).join(' · ');
  await render(
    sceneCard(shot, SCENE_H, p, [
      line ? kicker(latin(line), p.ink, 18) : null,
      h('div', { fontFamily: 'Cond', fontSize: size, lineHeight: 0.9, flexWrap: 'wrap', maxHeight: size * 1.8, overflow: 'hidden' }, title),
      h('div', { fontFamily: 'Semi', fontSize: 26, opacity: 0.9 }, latin(album.release_artist)),
    ].filter(Boolean) as never),
    file,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Artists

interface ImageNotes extends PhotoNotes {
  fanart?: { file: string; width: number; height: number; faces?: number[][]; people?: number[][] };
}

/** The middle of the faces (else people, else the focus) as 0–1 of the photo. */
function focusOf(n: { faces?: number[][]; people?: number[][]; focus?: [number, number] | null } | undefined): [number, number] {
  const boxes = n?.faces?.length ? n.faces : n?.people?.length ? n.people : null;
  if (boxes) {
    const x0 = Math.min(...boxes.map(b => b[0]));
    const x1 = Math.max(...boxes.map(b => b[0] + b[2]));
    const y0 = Math.min(...boxes.map(b => b[1]));
    const y1 = Math.max(...boxes.map(b => b[1] + b[3]));
    // A little below the faces, so the poster frames heads and shoulders.
    return [(x0 + x1) / 2, Math.min(1, (y0 + y1) / 2 + (y1 - y0) * 0.4)];
  }
  return n?.focus ?? [0.5, 0.4];
}

/** The poster's photo, as the artist page picks it: their fanart, else their own photo, else their newest sleeve. */
async function artistPhoto(slug: string, records: Album[]): Promise<{ file: string; focus: [number, number] } | null> {
  const dir = path.join(publicDir, 'artist', slug);
  const notes = await readJson<ImageNotes>(path.join(dir, `${slug}-image.json`)).catch(() => null);
  if (notes?.fanart?.file && (await exists(path.join(dir, notes.fanart.file)))) return { file: path.join(dir, notes.fanart.file), focus: focusOf(notes.fanart) };
  const own = path.join(dir, photoSourceFile(slug, notes));
  if (await exists(own)) return { file: own, focus: focusOf(notes ?? undefined) };
  for (const r of records) {
    const cover = await coverFile(r);
    if (cover) return { file: cover, focus: [0.5, 0.5] };
  }
  return null;
}

async function artistCard(artist: { name: string; uri: string }, records: Album[], file: string): Promise<boolean> {
  const slug = slugOf(artist.uri);
  const photo = await artistPhoto(slug, records);
  if (!photo) return false;
  const p = palette(records[0].uri_release);
  const wallId = wallGeometry[roomOf(records)] ? roomOf(records) : 'shelves';
  const wall = wallGeometry[wallId];
  const poster = wall.poster;
  const shot = await cutoutScene({
    photo: path.join(publicDir, 'artist-walls', `${wallId}-hi-res.webp`),
    aspect: wall.aspect,
    layers: [{ box: poster, input: await sharp(photo.file).rotate().jpeg({ quality: 92 }).toBuffer(), bleed: 3, focus: photo.focus }],
    shade: { file: path.join(publicDir, 'artist-walls', `${wallId}-shade.webp`), box: poster },
    tint: p.flood,
    // The wall fills the card's width (the walls are 4:3, so that's as far out as
    // it goes): the poster across the middle half, its foot running off the scene.
    scale: W,
    centre: [poster.left + poster.width / 2, poster.top + poster.height / 2],
    height: SCENE_H,
  });

  // Their most common style (Prog Rock says more than Rock), else genre.
  const top = (pick: (r: Album) => string[] | undefined) => {
    const counts = new Map<string, number>();
    for (const r of records) for (const g of pick(r) ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const topGenre = top(r => r.styles) ?? top(r => r.genre_names);
  const name = latin(artist.name).toUpperCase() || 'ARTIST';
  const size = condSize(name, 860, 92, 36, 2);
  await render(
    sceneCard(shot, SCENE_H, p, [
      kicker(['Artist', plural(records.length, 'record'), topGenre].filter(Boolean).join(' · '), p.ink, 18),
      h('div', { fontFamily: 'Cond', fontSize: size, lineHeight: 0.9, flexWrap: 'wrap', maxHeight: size * 1.8, overflow: 'hidden' }, name),
    ]),
    file,
  );
  return true;
}

// ---------------------------------------------------------------------------
// The site

async function siteCard(file: string): Promise<boolean> {
  const newest = [...listed].sort(byAdded);
  const shelf: Array<{ album: Album; cover: string }> = [];
  for (const a of newest) {
    const cover = await coverFile(a);
    if (cover) shelf.push({ album: a, cover });
    if (shelf.length === ledge.slots.length) break;
  }
  if (shelf.length < ledge.slots.length) return false;
  // The page band's colour: the most vivid of the first three.
  const lead = shelf.slice(0, 3).reduce((best, s) => (palette(s.album.uri_release).vivid > palette(best.album.uri_release).vivid ? s : best), shelf[0]);
  const p = palette(lead.album.uri_release);
  const slots = ledge.slots;
  const shot = await cutoutScene({
    photo: path.join(publicDir, 'index-headers', 'albums-hi-res.webp'),
    aspect: ledge.aspect,
    layers: await Promise.all(slots.map(async (box, i) => ({ box, input: await sharp(shelf[i].cover).rotate().jpeg({ quality: 92 }).toBuffer(), bleed: 3 }))),
    shade: { file: path.join(publicDir, 'index-headers', 'albums-shade.webp') },
    tint: p.flood,
    scale: W,
    centre: [50, slots[0].top + slots[0].height * 0.6],
    height: SCENE_H,
  });
  const artists = new Set(listed.flatMap(a => (a.artists ?? []).map(x => x.uri_artist)));
  await render(
    sceneCard(
      shot,
      SCENE_H,
      p,
      [kicker('A record collection', p.ink, 18), h('div', { fontFamily: 'Ext', fontSize: 96, lineHeight: 0.9, letterSpacing: -2 }, 'RUSS.FM')],
      h('div', { flexDirection: 'column', alignItems: 'flex-end', gap: 6, fontFamily: 'Mono', fontSize: 22 }, [
        h('div', {}, plural(listed.length, 'record')),
        h('div', { opacity: 0.8 }, plural(artists.size, 'artist')),
      ]),
    ),
    file,
  );
  return true;
}

// ---------------------------------------------------------------------------

// `pnpm run generate-og -- …` passes the `--` through; drop it.
const argv = process.argv.slice(2).filter(a => a !== '--');

function arg(name: string): string | null {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

async function main() {
  const first = argv[0];
  const outputDir = first && !first.startsWith('--') ? path.resolve(first) : path.join(root, 'dist');
  const cacheDir = arg('--cache-dir');
  const target = cacheDir ? path.resolve(cacheDir) : outputDir;
  const only = arg('--only');
  const match = arg('--match')?.toLowerCase() ?? null;
  await fs.mkdir(target, { recursive: true });

  // A design change redraws everything once: cached cards from an older version don't count.
  const versionFile = path.join(target, 'og-version.txt');
  const current = (await fs.readFile(versionFile, 'utf8').catch(() => '')).trim() === OG_VERSION;
  const keep = async (file: string) => current && !match && (await exists(file));
  console.log(`🎨 OG cards → ${target}${current ? '' : ` (new design ${OG_VERSION}: drawing every card)`}`);

  let made = 0;
  let kept = 0;
  let failed = 0;
  const run = async (label: string, file: string, draw: () => Promise<boolean>) => {
    if (await keep(file)) {
      kept++;
      return;
    }
    try {
      if (await draw()) {
        made++;
        if (made % 100 === 0) console.log(`  … ${made} drawn`);
      } else {
        failed++;
        console.log(`  ⚠️  ${label}: no artwork`);
      }
    } catch (error) {
      failed++;
      console.error(`  ✗ ${label}: ${(error as Error).message}`);
    }
  };

  if (!only || only === 'album') {
    console.log('📀 Albums');
    for (const album of collection) {
      if (match && !`${album.release_name} ${album.release_artist} ${album.uri_release}`.toLowerCase().includes(match)) continue;
      await run(album.release_name, path.join(target, 'album', slugOf(album.uri_release), 'og-image.png'), () => albumCard(album, path.join(target, 'album', slugOf(album.uri_release), 'og-image.png')));
    }
  }

  if (!only || only === 'artist') {
    console.log('🎤 Artists');
    const artists = new Map<string, { name: string; uri: string; records: Album[] }>();
    for (const album of [...collection].sort(byAdded)) {
      for (const a of album.artists ?? []) {
        if (!a.uri_artist) continue;
        const entry = artists.get(a.uri_artist) ?? { name: a.name, uri: a.uri_artist, records: [] };
        entry.records.push(album);
        artists.set(a.uri_artist, entry);
      }
    }
    for (const artist of artists.values()) {
      // Count records as /albums does (box set members inside their box), unless that leaves none.
      const own = artist.records.filter(r => !r.boxset);
      if (own.length) artist.records = own;
      const slug = slugOf(artist.uri);
      if (skippedArtists.has(slug)) continue;
      if (match && !`${artist.name} ${artist.uri}`.toLowerCase().includes(match)) continue;
      const file = path.join(target, 'artist', slug, 'og-image.png');
      await run(artist.name, file, () => artistCard(artist, artist.records, file));
    }
  }

  if (!only || only === 'site') {
    console.log('🌐 Site');
    // Always redrawn: it shows the newest records.
    const file = path.join(target, 'og-image.png');
    try {
      if (await siteCard(file)) made++;
      else failed++;
    } catch (error) {
      failed++;
      console.error(`  ✗ site card: ${(error as Error).message}`);
    }
  }

  if (!only && !match) await fs.writeFile(versionFile, OG_VERSION);
  console.log(`✨ ${made} drawn, ${kept} kept from cache, ${failed} failed`);
  if (cacheDir) {
    console.log(`📂 Copying ${target} → ${outputDir}`);
    await copyDir(target, outputDir);
  }
}

await main();
