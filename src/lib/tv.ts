import type { Album } from '@/types/album';

/**
 * russ.fm/tv: music videos from the collection as TV channels.
 *
 * The scrapper writes /tv.json next to collection.json (see
 * docs/data/schemas.md#tvjson): one entry per release that has videos, with
 * Discogs genres and styles and each video's id, cleaned title, kind and
 * duration. Channels are built here from those genres and styles, and every
 * channel runs on the wall clock like broadcast TV: its running order is a
 * fixed shuffle, so tuning in at 21:14 lands on whatever is on at 21:14, and
 * the guide shows the same thing to everyone.
 */

export type TvVideoKind = 'video' | 'live' | 'other';

export interface TvVideo {
  id: string;
  title: string;
  /** The performer, when it isn't the release's artist (compilations). */
  artist?: string;
  kind: TvVideoKind;
  /** Seconds; missing when Discogs doesn't know. */
  duration?: number;
}

export interface TvRelease {
  uri: string;
  /** Release name and artist credit, as in collection.json. */
  name: string;
  artist: string;
  date_added: string;
  genres: string[];
  styles: string[];
  videos: TvVideo[];
}

export interface TvData {
  version: number;
  releases: TvRelease[];
}

/** One slot in a channel's running order. */
export interface TvItem {
  id: string;
  title: string;
  /** Who is on screen: the video's own artist, else the release's. */
  artist: string;
  kind: TvVideoKind;
  /** Scheduled length in seconds (a default when the real one is unknown). */
  seconds: number;
  album: Album;
}

export interface TvChannel {
  slug: string;
  number: string;
  name: string;
  /** Default room for this channel (see TV_ROOMS). */
  room: TvRoomId;
  items: TvItem[];
  /** Prefix sums of `seconds`: starts[i] is item i's offset into the loop. */
  starts: number[];
  /** Length of one full loop in seconds. */
  loop: number;
}

// ---------------------------------------------------------------------------
// Rooms

export type TvRoomId =
  | 'shelves'
  | 'basement'
  | 'bedroom'
  | 'prog-art'
  | 'electronic'
  | 'metal'
  | 'post-punk'
  | 'punk'
  | 'hip-hop'
  | 'soul-funk'
  | 'folk'
  | 'pop'
  | 'soundtracks'
  | 'jazz-blues'
  | 'live';

export interface TvRoom {
  id: TvRoomId;
  name: string;
  /**
   * Where the (keyed-out) screen sits in the room image, as % of its width and
   * height. Measured from the chroma-green screen before it was cut out.
   */
  screen: { left: number; top: number; width: number; height: number };
}

/** Room photos in public/tv-rooms/, one per channel after fuzzbox.tv's per-genre backgrounds. */
export const TV_ROOMS: TvRoom[] = [
  { id: 'shelves', name: 'Living room', screen: { left: 39.13, top: 30.27, width: 18.72, height: 20.56 } },
  { id: 'bedroom', name: 'Bedroom', screen: { left: 36.46, top: 21.97, width: 23.44, height: 24.46 } },
  { id: 'prog-art', name: 'Study', screen: { left: 38.28, top: 31.64, width: 22.07, height: 23.39 } },
  { id: 'electronic', name: 'Loft', screen: { left: 41.6, top: 34.08, width: 16.76, height: 17.53 } },
  { id: 'metal', name: 'Garage', screen: { left: 38.25, top: 38.87, width: 20.48, height: 22.22 } },
  { id: 'post-punk', name: 'Bedsit', screen: { left: 38.77, top: 37.16, width: 21.13, height: 22.36 } },
  { id: 'punk', name: 'Squat', screen: { left: 36.04, top: 24.71, width: 27.6, height: 28.56 } },
  { id: 'hip-hop', name: 'Brooklyn flat', screen: { left: 37.27, top: 31.64, width: 25.13, height: 26.22 } },
  { id: 'soul-funk', name: 'Lounge', screen: { left: 37.37, top: 29.35, width: 21.97, height: 22.9 } },
  { id: 'folk', name: 'Cabin', screen: { left: 37.86, top: 30.81, width: 22.56, height: 23.54 } },
  { id: 'basement', name: 'Basement', screen: { left: 36.65, top: 26.95, width: 23.5, height: 25.63 } },
  { id: 'pop', name: 'Pink bedroom', screen: { left: 36.04, top: 29.69, width: 27.93, height: 29.98 } },
  { id: 'soundtracks', name: 'Home cinema', screen: { left: 35.81, top: 23.29, width: 24.61, height: 25.93 } },
  { id: 'jazz-blues', name: 'Late-night flat', screen: { left: 36.88, top: 32.52, width: 23.96, height: 26.46 } },
  { id: 'live', name: 'Backstage', screen: { left: 37.34, top: 29.49, width: 25.1, height: 27.69 } },
];

/** Room images are 3:2. */
export const TV_ROOM_ASPECT = 3 / 2;

// ---------------------------------------------------------------------------
// Channels

interface ChannelDef {
  slug: string;
  name: string;
  room: TvRoomId;
  /** Discogs styles that put a release on this channel (lower case). */
  styles?: string[];
  /** Discogs genres that put a release on this channel (lower case). */
  genres?: string[];
}

/** Genre channels, after fuzzbox.tv's playlists. A release can be on several. */
const GENRE_CHANNELS: ChannelDef[] = [
  { slug: 'alt-indie', name: 'Alternative & Indie', room: 'bedroom', styles: ['alternative rock', 'indie rock', 'indie pop', 'britpop', 'grunge', 'lo-fi', 'shoegaze'] },
  { slug: 'prog-art', name: 'Prog & Art Rock', room: 'prog-art', styles: ['prog rock', 'art rock', 'symphonic rock', 'krautrock', 'post rock'] },
  { slug: 'electronic', name: 'Electronic', room: 'electronic', styles: ['synth-pop', 'new wave', 'electro', 'ambient', 'idm', 'trip hop', 'downtempo', 'house', 'techno', 'drum n bass', 'leftfield', 'big beat'], genres: ['electronic'] },
  { slug: 'metal', name: 'Metal & Hard Rock', room: 'metal', styles: ['heavy metal', 'hard rock', 'thrash', 'death metal', 'black metal', 'doom metal', 'stoner rock'] },
  { slug: 'post-punk', name: 'Post-Punk & Goth', room: 'post-punk', styles: ['post-punk', 'goth rock', 'darkwave', 'coldwave', 'no wave'] },
  { slug: 'punk', name: 'Punk & Ska', room: 'punk', styles: ['punk', 'hardcore', 'oi', 'pop punk', 'ska'] },
  { slug: 'hip-hop', name: 'Hip Hop', room: 'hip-hop', genres: ['hip hop'] },
  { slug: 'soul-funk', name: 'Soul & Funk', room: 'soul-funk', styles: ['soul', 'funk', 'disco', 'r&b'], genres: ['funk / soul'] },
  { slug: 'folk', name: 'Folk & Country', room: 'folk', styles: ['folk rock', 'folk', 'acoustic', 'country'], genres: ['folk, world, & country'] },
  { slug: 'classic-rock', name: 'Classic Rock', room: 'basement', styles: ['classic rock', 'blues rock', 'psychedelic rock', 'southern rock', 'garage rock'] },
  { slug: 'pop', name: 'Pop', room: 'pop', styles: ['pop rock'], genres: ['pop'] },
  { slug: 'soundtracks', name: 'Soundtracks', room: 'soundtracks', styles: ['soundtrack'], genres: ['stage & screen'] },
  { slug: 'jazz-blues', name: 'Jazz & Blues', room: 'jazz-blues', genres: ['jazz', 'blues'] },
];

/** How many of the newest records (that have videos) feed Latest additions. */
const LATEST_RECORDS = 100;
/** Assumed length of a video Discogs has no duration for. */
const DEFAULT_SECONDS = 240;
/** Longer than this is a full concert or film: kept for the Live channel only. */
const MAX_SECONDS = 12 * 60;
const MAX_LIVE_SECONDS = 90 * 60;
/** Schedules count from here, so the running order is the same for everyone. */
const EPOCH = Date.UTC(2026, 0, 1);

export const TV_LATEST = 'latest';

function genreChannelsFor(release: TvRelease): string[] {
  const genres = release.genres.map(g => g.toLowerCase());
  const styles = release.styles.map(s => s.toLowerCase());
  const hits: string[] = [];
  let popByStyle = false;
  for (const def of GENRE_CHANNELS) {
    const byStyle = !!def.styles?.some(s => styles.includes(s));
    const byGenre = !!def.genres?.some(g => genres.includes(g));
    if (byStyle || byGenre) {
      hits.push(def.slug);
      if (def.slug === 'pop') popByStyle = byStyle;
    }
  }
  // Discogs tags half the collection "Pop"; only keep it as a channel when it is
  // the release's only match or a style says so.
  if (hits.length > 1 && hits.includes('pop') && !popByStyle) hits.splice(hits.indexOf('pop'), 1);
  return hits;
}

/** A small seeded PRNG, so a channel's shuffle is the same on every visit. */
function seeded(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle, then pull apart videos from the same record that landed side by side. */
function runningOrder(items: TvItem[], seed: string): TvItem[] {
  const rand = seeded(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i].album.uri_release !== out[i - 1].album.uri_release) continue;
    for (let k = i + 1; k < out.length; k++) {
      if (out[k].album.uri_release !== out[i - 1].album.uri_release) {
        [out[i], out[k]] = [out[k], out[i]];
        break;
      }
    }
  }
  return out;
}

function channel(slug: string, number: number, name: string, room: TvRoomId, items: TvItem[]): TvChannel {
  const ordered = runningOrder(items, slug);
  const starts: number[] = [];
  let t = 0;
  for (const item of ordered) {
    starts.push(t);
    t += item.seconds;
  }
  return { slug, number: String(number).padStart(2, '0'), name, room, items: ordered, starts, loop: t };
}

/**
 * Build every channel from tv.json and the collection. Releases missing from
 * the collection (a stale tv.json) are skipped; a video on several releases
 * airs once per channel.
 */
export function buildChannels(tv: TvData, albums: Album[]): TvChannel[] {
  const byUri = new Map(albums.map(a => [a.uri_release, a]));
  const latest: TvItem[] = [];
  const live: TvItem[] = [];
  const genre = new Map<string, TvItem[]>(GENRE_CHANNELS.map(c => [c.slug, []]));
  const other: TvItem[] = [];
  const seen = { latest: new Set<string>(), live: new Set<string>(), other: new Set<string>(), genre: new Map<string, Set<string>>() };

  const push = (list: TvItem[], ids: Set<string>, item: TvItem) => {
    if (ids.has(item.id)) return;
    ids.add(item.id);
    list.push(item);
  };

  // tv.json is newest first.
  let latestRecords = 0;
  for (const release of tv.releases) {
    const album = byUri.get(release.uri);
    if (!album) continue;
    const slugs = genreChannelsFor(release);
    const isLatest = latestRecords < LATEST_RECORDS;
    let used = false;
    for (const v of release.videos) {
      const seconds = v.duration && v.duration > 0 ? v.duration : DEFAULT_SECONDS;
      const item: TvItem = { id: v.id, title: v.title, artist: v.artist ?? album.release_artist, kind: v.kind, seconds, album };
      if (v.kind === 'live' && seconds <= MAX_LIVE_SECONDS) push(live, seen.live, item);
      if (seconds > MAX_SECONDS) continue;
      used = true;
      if (isLatest) push(latest, seen.latest, item);
      if (slugs.length === 0) push(other, seen.other, item);
      for (const slug of slugs) {
        let ids = seen.genre.get(slug);
        if (!ids) seen.genre.set(slug, (ids = new Set()));
        push(genre.get(slug)!, ids, item);
      }
    }
    if (used && isLatest) latestRecords++;
  }

  const channels: TvChannel[] = [];
  let n = 1;
  channels.push(channel(TV_LATEST, n++, 'Latest additions', 'shelves', latest));
  for (const def of GENRE_CHANNELS) {
    const items = genre.get(def.slug) ?? [];
    if (items.length) channels.push(channel(def.slug, n++, def.name, def.room, items));
  }
  if (live.length) channels.push(channel('live', n++, 'Live', 'live', live));
  if (other.length) channels.push(channel('everything-else', n++, 'Everything Else', 'shelves', other));
  return channels.filter(c => c.items.length > 0);
}

/** Distinct videos across all channels (for the "N videos" count). */
export function countVideos(channels: TvChannel[]): number {
  const ids = new Set<string>();
  for (const c of channels) for (const i of c.items) ids.add(i.id);
  return ids.size;
}

// ---------------------------------------------------------------------------
// Schedule

/** What a channel is airing at `now`: the item index and how far into it we are. */
export function onAir(ch: TvChannel, now: number = Date.now()): { index: number; offset: number } {
  if (!ch.loop) return { index: 0, offset: 0 };
  const pos = (((now - EPOCH) / 1000) % ch.loop + ch.loop) % ch.loop;
  let lo = 0;
  let hi = ch.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ch.starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return { index: lo, offset: pos - ch.starts[lo] };
}

export interface TvSlot {
  item: TvItem;
  index: number;
  /** Epoch ms. */
  start: number;
  end: number;
}

/** Every slot on a channel that overlaps [from, to) (epoch ms). */
export function slotsBetween(ch: TvChannel, from: number, to: number): TvSlot[] {
  if (!ch.items.length) return [];
  const { index, offset } = onAir(ch, from);
  const out: TvSlot[] = [];
  let i = index;
  let start = from - offset * 1000;
  while (start < to && out.length < 200) {
    const item = ch.items[i];
    const end = start + item.seconds * 1000;
    out.push({ item, index: i, start, end });
    start = end;
    i = (i + 1) % ch.items.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading

let tvPromise: Promise<TvData> | null = null;

/** Cached fetch of /tv.json (about a megabyte, so once per tab). */
export function loadTv(): Promise<TvData> {
  if (!tvPromise) {
    tvPromise = fetch('/tv.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load tv.json: ${res.status}`);
        return res.json() as Promise<TvData>;
      })
      .catch(err => {
        tvPromise = null;
        throw err;
      });
  }
  return tvPromise;
}

// ---------------------------------------------------------------------------
// URLs

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * The shareable address of a video on a channel:
 * `/tv/electronic/6-underground-2eBZqmL8ehg`. The words are for people; the
 * last 11 characters are the YouTube id, which is all `videoIdFromParam` reads.
 */
export function videoPath(channelSlug: string, item: Pick<TvItem, 'id' | 'title' | 'artist'>): string {
  const words = slugify(`${item.artist} ${item.title}`);
  return `/tv/${channelSlug}/${words ? `${words}-` : ''}${item.id}`;
}

/** The YouTube id at the end of a `/tv/:channel/:video` segment, or null. */
export function videoIdFromParam(param: string | undefined): string | null {
  if (!param || param.length < 11) return null;
  const id = param.slice(-11);
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** m:ss (or h:mm:ss). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** YouTube's still for a video (external; not one of our assets). */
export function youTubeThumb(id: string, size: 'mq' | 'hq' | 'maxres' = 'mq'): string {
  return `https://i.ytimg.com/vi/${id}/${size === 'maxres' ? 'maxresdefault' : `${size}default`}.jpg`;
}
