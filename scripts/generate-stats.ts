/**
 * Write public/stats/stats.json for /stats (src/types/stats.ts), and facts.json (its
 * shelf facts alone, for the home page), counted from
 * collection.json, every album and artist JSON, album-colors.json and the explore
 * graph (scripts/lib/stats-data.ts). Run after generate-colors and generate-explore;
 * without the explore graph the map falls back to TheAudioDB's country codes.
 *
 *   pnpm run generate-stats
 */
import fs from 'fs';
import path from 'path';
import { buildStats, type AlbumJson, type ArtistJson, type CollectionEntry } from './lib/stats-data';

const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const read = <T>(p: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(PUBLIC, p), 'utf-8')) as T; } catch { return null; }
};
const slugOf = (uri: string) => uri.split('/').filter(Boolean).pop() ?? uri;

const collection = read<CollectionEntry[]>('collection.json');
if (!collection) throw new Error('public/collection.json not found');
const albums = new Map<string, AlbumJson>();
const artists = new Map<string, ArtistJson>();
for (const r of collection) {
  const s = slugOf(r.uri_release);
  albums.set(s, read<AlbumJson>(`album/${s}/${s}.json`) ?? {});
  for (const a of r.artists) {
    const k = slugOf(a.uri_artist);
    if (!artists.has(k)) artists.set(k, read<ArtistJson>(`artist/${k}/${k}.json`) ?? {});
  }
}
const explore = read<{ artists: Array<{ slug: string; cc?: string }> }>('explore/explore.json');
if (!explore) console.warn('⚠ explore/explore.json not found; home countries come from TheAudioDB only (run generate-explore first)');

const stats = buildStats({
  collection,
  albums,
  artists,
  colours: read('album-colors.json') ?? {},
  cc: new Map((explore?.artists ?? []).filter(a => a.cc).map(a => [a.slug, a.cc!])),
  today: new Date().toISOString().slice(0, 10),
});
fs.mkdirSync(path.join(PUBLIC, 'stats'), { recursive: true });
fs.writeFileSync(path.join(PUBLIC, 'stats', 'stats.json'), JSON.stringify(stats));
// Just the shelf's facts, for the home page's pinned tags (a few KB, not the whole file).
fs.writeFileSync(path.join(PUBLIC, 'stats', 'facts.json'), JSON.stringify(stats.holders));
const t = stats.totals;
console.log(`✓ stats/stats.json: ${t.records} records, ${t.artists} artists, ${t.kg} kg, ${t.hours} h, ${(t.plays / 1e9).toFixed(1)}bn Last.fm plays`);
