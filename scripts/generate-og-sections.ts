#!/usr/bin/env tsx
/**
 * Open Graph cards (1200×630 JPEG) for the TV section and the genre pages,
 * written to public/og/ (gitignored; built in CI before the worker bundle):
 *
 *   og/tv/index.jpg, og/tv/guide.jpg, og/tv/<channel>.jpg
 *   og/genres.jpg, og/genre/<slug>.jpg
 *   og/manifest.json   channel list for scripts/generate-static-meta.mjs
 *
 * Cards use the player design: a sleeve's colours, Archivo condensed and
 * extended display type (static instances in scripts/og-fonts/), and records
 * as objects. TV cards put a sleeve on the set of the channel's room.
 *
 *   pnpm run generate-og-sections            # everything
 *   pnpm run generate-og-sections -- --only tv|genres
 */
import satori from 'satori';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChannels, slotsBetween, TV_ROOM_ASPECT, TV_ROOMS, type TvChannel, type TvData } from '../src/lib/tv';
import type { Album } from '../src/types/album';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(publicDir, 'og');
const W = 1200;
const H = 630;

const INK = '#0e0d0c';
const CREAM = '#fbf7ef';
const NEUTRAL = { flood: '#e8e2d6', ink: INK, ground: '#1c1916', glow: '#e8e2d6', secondary: null as string | null, vivid: 0 };

type Palette = typeof NEUTRAL;
type Node = { type: string; props: Record<string, unknown> };

const font = (file: string) => fs.readFile(path.join(root, 'scripts/og-fonts', file));
const fonts = [
  { name: 'Cond', data: await font('archivo-condensed-black.ttf'), weight: 900 as const, style: 'normal' as const },
  { name: 'Ext', data: await font('archivo-extended-black.ttf'), weight: 900 as const, style: 'normal' as const },
  { name: 'Semi', data: await font('archivo-semiexpanded-extrabold.ttf'), weight: 800 as const, style: 'normal' as const },
  { name: 'Mono', data: await font('jetbrains-mono-medium.ttf'), weight: 500 as const, style: 'normal' as const },
  { name: 'Grot', data: await font('hanken-grotesk-semibold.ttf'), weight: 600 as const, style: 'normal' as const },
];

/** A satori element. Every div gets flex so multi-child boxes lay out. */
function h(type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node {
  const s = type === 'div' ? { display: 'flex', ...style } : style;
  return { type, props: { style: s, children, ...extra } };
}

async function render(node: Node, file: string) {
  const svg = await satori(node as never, { width: W, height: H, fonts });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
}

// ---------------------------------------------------------------------------
// Data

const collection: Album[] = JSON.parse(await fs.readFile(path.join(publicDir, 'collection.json'), 'utf8'));
const colours: Record<string, Palette> = JSON.parse(await fs.readFile(path.join(publicDir, 'album-colors.json'), 'utf8'));
const palette = (uri: string): Palette => colours[uri] ?? NEUTRAL;

/** The most vivid of the first few records, else the first (as the site's page bands). */
function leadOf(albums: Album[], count = 3): Album {
  const first = albums.slice(0, count);
  return first.reduce((best, a) => (palette(a.uri_release).vivid > palette(best.uri_release).vivid ? a : best), first[0]);
}

const imageCache = new Map<string, string>();
/** A sleeve as a JPEG data URI at `size` px, or null when the file is missing. */
async function sleeve(album: Album, size: number): Promise<string | null> {
  const slug = album.uri_release.split('/')[2];
  const key = `${slug}@${size}`;
  if (imageCache.has(key)) return imageCache.get(key)!;
  for (const name of [`${slug}-hi-res.jpg`, `${slug}-medium.jpg`]) {
    try {
      const buf = await sharp(path.join(publicDir, 'album', slug, name)).resize(size, size, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
      const uri = `data:image/jpeg;base64,${buf.toString('base64')}`;
      imageCache.set(key, uri);
      return uri;
    } catch {
      // try the next size
    }
  }
  return null;
}

async function firstWithSleeve(albums: Album[]): Promise<Album | null> {
  for (const a of albums) if (await sleeve(a, 400)) return a;
  return null;
}

// ---------------------------------------------------------------------------
// Shared pieces

const wordmark = (colour: string, size = 26) => h('div', { fontFamily: 'Ext', fontSize: size, color: colour, letterSpacing: -0.5 }, 'RUSS.FM');

const kicker = (text: string, colour: string, size = 20) =>
  h('div', { fontFamily: 'Mono', fontSize: size, color: colour, opacity: 0.75, letterSpacing: 2, textTransform: 'uppercase' }, text);

/** Condensed display size for text in a box: the longest word fits the width. */
function condSize(text: string, width: number, max: number, min = 56) {
  const longest = Math.max(...text.toUpperCase().split(/\s+/).map(w => w.length), 1);
  // Archivo condensed black caps run about 0.56em wide (hyphens and W/M wider).
  const em = 0.56;
  let size = Math.min(max, width / (longest * em));
  // Three lines at most: shrink when the whole title would need more.
  if ((text.length * em * size) / width > 3) size = (width * 3) / (text.length * em);
  return Math.max(min, Math.floor(size));
}

/** A record: the sleeve with its disc slid out to the right, label in the sleeve's ground. */
function record(src: string, size: number, p: Palette, left: number, top: number): Node {
  const disc = size * 0.96;
  const label = disc * 0.36;
  const ring = (inset: number) =>
    h('div', { position: 'absolute', left: inset, top: inset, width: disc - inset * 2, height: disc - inset * 2, borderRadius: disc, border: '1px solid rgba(251,247,239,0.07)' });
  return h('div', { position: 'absolute', left, top, width: size + disc * 0.34, height: size }, [
    h(
      'div',
      { position: 'absolute', left: size * 0.36, top: (size - disc) / 2, width: disc, height: disc, borderRadius: disc, backgroundColor: '#111', border: '2px solid rgba(251,247,239,0.18)', alignItems: 'center', justifyContent: 'center' },
      [
        ring(disc * 0.08),
        ring(disc * 0.16),
        ring(disc * 0.24),
        h('div', { width: label, height: label, borderRadius: label, backgroundColor: p.ground, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, [
          h('img', { width: label * 1.45, height: label * 1.45 }, undefined, { src, width: label * 1.45, height: label * 1.45 }),
        ]),
      ],
    ),
    h('img', { position: 'absolute', left: 0, top: 0, width: size, height: size }, undefined, { src, width: size, height: size }),
  ]);
}

// ---------------------------------------------------------------------------
// Genres

function slugify(value: string) {
  // Same as generate-static-meta.mjs, so the card matches the page's slug.
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface GenreGroup {
  name: string;
  albums: Album[];
  artists: Set<string>;
  first: number;
  last: number;
}

function genreGroups(): Map<string, GenreGroup> {
  const groups = new Map<string, GenreGroup>();
  for (const album of collection) {
    for (const name of new Set([...(album.genre_names ?? []), ...(album.styles ?? [])])) {
      const slug = slugify(name);
      if (!slug) continue;
      let g = groups.get(slug);
      if (!g) groups.set(slug, (g = { name, albums: [], artists: new Set(), first: Infinity, last: 0 }));
      g.albums.push(album);
      for (const a of album.artists?.length ? album.artists : [{ name: album.release_artist }]) {
        if (a.name && a.name.toLowerCase() !== 'various') g.artists.add(a.name);
      }
      const y = Number.parseInt(String(album.year_original ?? album.date_release_year).slice(0, 4), 10);
      if (Number.isFinite(y) && y >= 1900) {
        g.first = Math.min(g.first, y);
        g.last = Math.max(g.last, y);
      }
    }
  }
  return groups;
}

/** Drop characters the Latin font subsets can't draw (they render as boxes). */
const latin = (text: string) => text.replace(/[^\u0020-\u024f\u2018-\u201d\u2013\u2014\u2026]/g, '').trim();

const plural = (n: number, word: string) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;

async function genreCard(slug: string, g: GenreGroup) {
  const lead = leadOf(g.albums);
  const p = palette(lead.uri_release);
  const withArt = [lead, ...g.albums.filter(a => a !== lead)];
  const front = await firstWithSleeve(withArt);
  const back = (await Promise.all(withArt.filter(a => a !== front).slice(0, 6).map(async a => ((await sleeve(a, 400)) ? a : null)))).filter(Boolean).slice(0, 2) as Album[];

  const title = latin(g.name).toUpperCase();
  const size = condSize(title, 540, 190);
  const range = g.last ? (g.first === g.last ? ` · ${g.first}` : ` · ${g.first}–${g.last}`) : '';
  const art: Node[] = [];
  const rot = [-7, 6];
  for (const [i, a] of back.entries()) {
    const src = (await sleeve(a, 400))!;
    art.push(h('img', { position: 'absolute', left: 690 + i * 70, top: 96 - i * 8, width: 330, height: 330, transform: `rotate(${rot[i]}deg)`, opacity: 0.95 }, undefined, { src, width: 330, height: 330 }));
  }
  if (front) art.push(record((await sleeve(front, 400))!, 380, palette(front.uri_release), 640, 150));

  await render(
    h('div', { width: W, height: H, backgroundColor: p.flood, color: p.ink, position: 'relative', overflow: 'hidden' }, [
      ...art,
      h('div', { position: 'absolute', left: 64, top: 56, width: 560, height: H - 112, flexDirection: 'column', justifyContent: 'space-between' }, [
        h('div', { flexDirection: 'column', gap: 14 }, [wordmark(p.ink), kicker('Genre', p.ink)]),
        h('div', { fontFamily: 'Cond', fontSize: size, lineHeight: 0.86, color: p.ink, flexWrap: 'wrap' }, title),
        h('div', { fontFamily: 'Mono', fontSize: 22, color: p.ink, opacity: 0.85 }, `${plural(g.albums.length, 'record')} · ${plural(g.artists.size, 'artist')}${range}`),
      ]),
    ]),
    path.join(outDir, 'genre', `${slug}.jpg`),
  );
}

async function genresIndexCard(groups: Map<string, GenreGroup>) {
  const lead = leadOf(collection);
  const p = palette(lead.uri_release);
  const top = [...groups.values()].sort((a, b) => b.albums.length - a.albums.length).slice(0, 14);
  const chips = top.map(g => {
    const cp = palette(leadOf(g.albums).uri_release);
    return h('div', { backgroundColor: cp.flood, color: cp.ink, padding: '10px 18px', borderRadius: 999, alignItems: 'baseline', gap: 10, border: `2px solid ${p.ink === INK ? 'rgba(14,13,12,.25)' : 'rgba(251,247,239,.25)'}` }, [
      h('div', { fontFamily: 'Semi', fontSize: 24 }, latin(g.name)),
      h('div', { fontFamily: 'Mono', fontSize: 16, opacity: 0.75 }, g.albums.length.toLocaleString('en-GB')),
    ]);
  });
  await render(
    h('div', { width: W, height: H, backgroundColor: p.flood, color: p.ink, flexDirection: 'column', padding: '56px 64px', justifyContent: 'space-between' }, [
      h('div', { justifyContent: 'space-between', alignItems: 'center' }, [wordmark(p.ink), kicker(`${groups.size} genres and styles`, p.ink)]),
      h('div', { fontFamily: 'Ext', fontSize: 150, lineHeight: 0.9, letterSpacing: -3 }, 'GENRES'),
      h('div', { flexWrap: 'wrap', gap: 12 }, chips),
    ]),
    path.join(outDir, 'genres.jpg'),
  );
}

// ---------------------------------------------------------------------------
// TV

const ROOM_H = 440;
const hexRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/**
 * The channel's room with a sleeve playing on the set, tinted with the
 * sleeve's colour, cropped to the card's top band. JPEG data URI.
 */
async function roomShot(roomId: string, album: Album | null, p: Palette): Promise<string> {
  const room = TV_ROOMS.find(r => r.id === roomId) ?? TV_ROOMS[0];
  const s = room.screen;
  const target = 300;
  const iw = Math.round(Math.max(target / (s.width / 100), W, ROOM_H * TV_ROOM_ASPECT));
  const ih = Math.round(iw / TV_ROOM_ASPECT);
  const cx = ((s.left + s.width / 2) / 100) * iw;
  const cy = ((s.top + s.height / 2) / 100) * ih;
  const left = Math.round(Math.min(0, Math.max(W - iw, W / 2 - cx)));
  const top = Math.round(Math.min(0, Math.max(ROOM_H - ih, ROOM_H * 0.5 - cy)));

  const roomBuf = await sharp(path.join(publicDir, 'tv-rooms', `${room.id}-hi-res.webp`)).resize(iw, ih).png().toBuffer();
  const tint = await sharp({ create: { width: iw, height: ih, channels: 4, background: { ...hexRgb(p.flood), alpha: 0.4 } } }).png().toBuffer();
  const tinted = await sharp(roomBuf)
    .composite([
      { input: tint, blend: 'soft-light' },
      { input: roomBuf, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  const layers: sharp.OverlayOptions[] = [];
  const sx = Math.round((s.left / 100) * iw) - 3;
  const sy = Math.round((s.top / 100) * ih) - 3;
  const sw = Math.round((s.width / 100) * iw) + 6;
  const sh = Math.round((s.height / 100) * ih) + 6;
  const slug = album?.uri_release.split('/')[2];
  if (slug) {
    for (const name of [`${slug}-hi-res.jpg`, `${slug}-medium.jpg`]) {
      try {
        const cover = await sharp(path.join(publicDir, 'album', slug, name)).resize(sw, sh, { fit: 'cover' }).modulate({ brightness: 0.92 }).toBuffer();
        layers.push({ input: cover, left: sx, top: sy });
        break;
      } catch {
        // next
      }
    }
  }
  layers.push({ input: tinted, left: 0, top: 0 });
  // sharp extracts before it composites, so flatten first, then crop.
  const full = await sharp({ create: { width: iw, height: ih, channels: 3, background: '#000' } }).composite(layers).png().toBuffer();
  const shot = await sharp(full).extract({ left: -left, top: -top, width: W, height: ROOM_H }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${shot.toString('base64')}`;
}

/** The record a channel card shows: its newest bold sleeve that has artwork. */
async function channelLead(ch: TvChannel): Promise<Album> {
  const seen = new Set<string>();
  const albums = [...ch.items]
    .map(i => i.album)
    .filter(a => (seen.has(a.uri_release) ? false : (seen.add(a.uri_release), true)))
    .sort((a, b) => b.date_added.localeCompare(a.date_added));
  const bold = albums.filter(a => palette(a.uri_release).vivid >= 0.5);
  return (await firstWithSleeve(bold.slice(0, 30))) ?? (await firstWithSleeve(albums)) ?? albums[0];
}

async function tvCard({ file, room, album, number, title, note }: { file: string; room: string; album: Album; number?: string; title: string; note: string }) {
  const p = palette(album.uri_release);
  const shot = await roomShot(room, album, p);
  const titleSize = title.length > 16 ? 58 : 76;
  await render(
    h('div', { width: W, height: H, backgroundColor: p.flood, color: p.ink, flexDirection: 'column' }, [
      h('img', { width: W, height: ROOM_H }, undefined, { src: shot, width: W, height: ROOM_H }),
      h('div', { flex: 1, alignItems: 'center', padding: '0 56px', gap: 30 }, [
        number ? h('div', { fontFamily: 'Cond', fontSize: 150, lineHeight: 1 }, number) : null,
        h('div', { flexDirection: 'column', gap: 10, flex: 1 }, [
          h('div', { fontFamily: 'Ext', fontSize: titleSize, lineHeight: 0.95, letterSpacing: -1 }, title.toUpperCase()),
          h('div', { fontFamily: 'Mono', fontSize: 20, opacity: 0.8 }, note),
        ]),
        h('div', { flexDirection: 'column', alignItems: 'flex-end', gap: 6 }, [wordmark(p.ink, 24), h('div', { fontFamily: 'Mono', fontSize: 18, opacity: 0.75 }, '/tv')]),
      ].filter(Boolean)),
    ]),
    file,
  );
}

async function guideCard(channels: TvChannel[], videos: number) {
  const lead = await channelLead(channels[0]);
  const p = palette(lead.uri_release);
  const from = Date.UTC(2026, 0, 1, 21, 0);
  const to = from + 30 * 60_000;
  const rowW = W - 64 * 2 - 70;
  const rows = channels.slice(0, 7).map(ch => {
    const blocks = slotsBetween(ch, from, to).map(s => {
      const bp = palette(s.item.album.uri_release);
      const l = Math.max(0, (s.start - from) / (to - from)) * rowW;
      const r = Math.min(1, (s.end - from) / (to - from)) * rowW;
      const w = Math.max(0, r - l - 4);
      return h('div', { position: 'absolute', left: l, top: 0, width: w, height: 44, backgroundColor: bp.flood, color: bp.ink, padding: '0 10px', alignItems: 'center', overflow: 'hidden' }, w > 120 ? h('div', { fontFamily: 'Cond', fontSize: 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: w - 20 }, latin(s.item.title).toUpperCase()) : undefined);
    });
    return h('div', { alignItems: 'center', gap: 16, height: 44 }, [
      h('div', { fontFamily: 'Cond', fontSize: 34, width: 54, color: CREAM }, ch.number),
      h('div', { position: 'relative', width: rowW, height: 44, overflow: 'hidden' }, blocks),
    ]);
  });
  await render(
    h('div', { width: W, height: H, backgroundColor: p.ground, flexDirection: 'column' }, [
      h('div', { backgroundColor: p.flood, color: p.ink, height: 190, padding: '0 64px', alignItems: 'center', justifyContent: 'space-between' }, [
        h('div', { flexDirection: 'column', gap: 8 }, [
          h('div', { fontFamily: 'Ext', fontSize: 104, lineHeight: 0.9, letterSpacing: -2 }, 'GUIDE'),
          h('div', { fontFamily: 'Mono', fontSize: 20, opacity: 0.8 }, `${channels.length} channels · ${videos.toLocaleString('en-GB')} videos`),
        ]),
        h('div', { flexDirection: 'column', alignItems: 'flex-end', gap: 6 }, [wordmark(p.ink, 26), h('div', { fontFamily: 'Mono', fontSize: 18, opacity: 0.75 }, '/tv')]),
      ]),
      h('div', { flexDirection: 'column', gap: 10, padding: '28px 64px' }, rows),
    ]),
    path.join(outDir, 'tv', 'guide.jpg'),
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const manifest: Record<string, unknown> = {};

  if (!only || only === 'tv') {
    const tv: TvData = JSON.parse(await fs.readFile(path.join(publicDir, 'tv.json'), 'utf8'));
    const channels = buildChannels(tv, collection);
    const videos = new Set(channels.flatMap(c => c.items.map(i => i.id))).size;
    console.log(`📺 TV: ${channels.length} channels, ${videos} videos`);
    const latest = await channelLead(channels[0]);
    await tvCard({ file: path.join(outDir, 'tv', 'index.jpg'), room: channels[0].room, album: latest, title: 'russ.fm/tv', note: `${channels.length} channels · ${videos.toLocaleString('en-GB')} videos from the collection` });
    await guideCard(channels, videos);
    for (const ch of channels) {
      await tvCard({ file: path.join(outDir, 'tv', `${ch.slug}.jpg`), room: ch.room, album: await channelLead(ch), number: ch.number, title: ch.name, note: `${ch.items.length.toLocaleString('en-GB')} videos · music TV from the collection` });
      process.stdout.write('.');
    }
    console.log(' done');
    manifest.tv = { videos, channels: channels.map(c => ({ slug: c.slug, number: c.number, name: c.name, videos: c.items.length })) };
  }

  if (!only || only === 'genres') {
    const groups = genreGroups();
    console.log(`🎸 Genres: ${groups.size}`);
    await genresIndexCard(groups);
    let n = 0;
    for (const [slug, g] of groups) {
      await genreCard(slug, g);
      if (++n % 25 === 0) process.stdout.write(`${n} `);
    }
    console.log('done');
    manifest.genres = { count: groups.size };
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const previous = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
  await fs.writeFile(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2));
  console.log(`✓ Wrote ${path.relative(root, outDir)}/`);
}

await main();
