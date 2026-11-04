/**
 * The `story` block for each year's Wrapped (src/types/wrappedStory.ts): the year's
 * records flattened with what the chapters draw — UK time added, run time, discs and
 * weight, pressing colours, credits — plus the year's artists and their links in the
 * explore graph (public/explore/explore.json, built by generate-explore first).
 */
import fs from 'fs';
import path from 'path';
import { familyOf } from '../../src/lib/genreFamilyDefs';
import type { StoryArtist, StoryLink, StoryRelease, StoryVinyl, WrappedStory } from '../../src/types/wrappedStory';

const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'public');
const VOCAB = JSON.parse(fs.readFileSync(path.join(PUBLIC, '..', 'src', 'config', 'vinyl-colours.json'), 'utf-8'));
const EDITIONS = new Set(['Limited Edition', 'Reissue', 'Record Store Day', 'Remastered', 'Compilation', 'Deluxe Edition',
  'Numbered', 'Picture Disc', '45 RPM', 'Repress', 'Special Edition', 'Box Set']);
const UK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const readJson = (p: string) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
};

/** Discogs colour text to a disc look; null when it names no colour. */
export function vinyl(text: string): StoryVinyl | null {
  const low = text.toLowerCase();
  const words: string[] = low.match(/[a-z]+/g) ?? [];
  const glass = words.some(w => VOCAB.glass.includes(w));
  const see = glass || words.some(w => VOCAB.translucent.includes(w));
  const patterns = Object.entries(VOCAB.patterns as Record<string, string[]>);
  const pat = words.map(w => patterns.find(([, ps]) => ps.some(p => w.startsWith(p)))?.[0]).find(Boolean) ?? null;
  const hex: string[] = Object.entries(VOCAB.phrases as Record<string, string>).filter(([ph]) => low.includes(ph)).map(([, h]) => h);
  for (const w of words) if (w !== 'black' && VOCAB.colours[w]) hex.push(VOCAB.colours[w]);
  if (!hex.length && words.includes('black') && pat) hex.push(VOCAB.colours.black);
  if (!hex.length && !glass) return null;
  return { n: text, hex: hex.length ? hex.slice(0, 3) : ['#dfe6ea'], glass, see, pat };
}

export const secs = (d?: string) => {
  const m = /^(\d+):(\d\d)(?::(\d\d))?$/.exec(d ?? '');
  if (!m) return 0;
  return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
};

interface FormatDetail { name?: string; qty?: string | number; descriptions?: string[]; text?: string }

/** Discs, size and grams from Discogs format_details; 140 g a 12" when it doesn't say. */
export function pressing(fd: FormatDetail[] | undefined): { discs: number; size: string; grams: number } {
  let discs = 0, size = '12"', grams = 0;
  for (const f of fd ?? []) {
    if (!['vinyl', 'lp'].includes((f.name ?? '').toLowerCase())) continue;
    const q = parseInt(String(f.qty ?? '1').replace(/\D/g, ''), 10) || 1;
    const desc = `${(f.descriptions ?? []).join(' ')} ${f.text ?? ''}`;
    size = desc.includes('7"') ? '7"' : desc.includes('10"') ? '10"' : '12"';
    const g = /(\d{3})\s?g/.exec(desc);
    discs += q;
    grams += q * (g ? +g[1] : size === '7"' ? 42 : size === '10"' ? 100 : 140);
  }
  return { discs: discs || 1, size, grams: grams || 140 };
}

interface CollectionRelease {
  uri_release: string;
  date_added: string;
  artists: Array<{ name: string; uri_artist: string }>;
  genre_names: string[];
  lastfm_listeners?: number | null;
  boxset?: unknown;
}
interface YearRelease {
  release_name: string;
  release_artist: string;
  date_added: string;
  year_original?: number | null;
  genre_names: string[];
  slug: string;
  artists: Array<{ name: string; slug: string }>;
  colors?: StoryRelease['c'];
}

const slugOf = (uri: string) => uri.replace(/\/$/, '').split('/').pop() ?? '';

export function buildStory(year: number, releases: YearRelease[], collection: CollectionRelease[]): WrappedStory {
  const shelf = [...collection.filter(r => r.boxset == null)].sort((a, b) => a.date_added.localeCompare(b.date_added));
  const perYear: Record<string, number> = {};
  const perMonth: Record<string, number[]> = {};
  const firstYear = new Map<string, number>();
  const listeners = new Map<string, number | null>();
  for (const r of shelf) {
    const y = +r.date_added.slice(0, 4);
    perYear[y] = (perYear[y] ?? 0) + 1;
    (perMonth[y] ??= Array(12).fill(0))[+r.date_added.slice(5, 7) - 1]++;
    listeners.set(slugOf(r.uri_release), r.lastfm_listeners ?? null);
    for (const a of r.artists) {
      const s = slugOf(a.uri_artist);
      firstYear.set(s, Math.min(firstYear.get(s) ?? 9999, y));
    }
  }

  const counts = new Map<string, { name: string; n: number }>();
  const out: StoryRelease[] = releases.map(r => {
    const d = readJson(path.join(PUBLIC, 'album', r.slug, `${r.slug}.json`)) ?? {};
    let h: number | null = null, wd: number | null = null;
    if (typeof d.date_added === 'string' && d.date_added.includes('T')) {
      const parts = Object.fromEntries(UK.formatToParts(new Date(d.date_added)).map(p => [p.type, p.value]));
      h = Math.round((+parts.hour + +parts.minute / 60) * 100) / 100;
      wd = WEEKDAYS.indexOf(parts.weekday);
    }
    const tracks: Array<{ duration?: string }> = d.tracklist ?? [];
    const timed = tracks.map(t => secs(t.duration));
    const rt = tracks.length && timed.filter(Boolean).length >= tracks.length * 0.6 ? timed.reduce((a, b) => a + b, 0) : null;
    const { discs, size, grams } = pressing(d.format_details);
    const credits: Array<{ name: string; role?: string }> = d.credits ?? [];
    const role = (...names: string[]) => [...new Set(credits.filter(c => names.some(n => (c.role ?? '').includes(n))).map(c => c.name))].sort();
    for (const a of r.artists) counts.set(a.slug, { name: a.name, n: (counts.get(a.slug)?.n ?? 0) + 1 });
    const styles: string[] = d.styles ?? [];
    const c = r.colors ?? {};
    return {
      s: r.slug, t: r.release_name, by: r.release_artist, a: r.artists.map(a => a.slug),
      d: r.date_added, h, wd,
      y: r.year_original ?? (Number.isInteger(+d.year) && +d.year > 0 ? +d.year : null),
      g: r.genre_names, st: styles, fam: familyOf({ styles, genre_names: r.genre_names }),
      c: { flood: c.flood, ink: c.ink, ground: c.ground, secondary: c.secondary, hue: c.hue, vivid: c.vivid },
      rt, tracks: tracks.length, discs, size, g_wt: grams,
      vc: ((d.vinyl_colours ?? []) as string[]).map(vinyl).filter((v): v is StoryVinyl => !!v),
      ed: [...new Set(((d.format_details ?? []) as FormatDetail[]).flatMap(f => f.descriptions ?? []))].filter(x => EDITIONS.has(x)).sort(),
      lab: d.labels?.[0] ?? null, ctry: d.country ?? null,
      cut: role('Lacquer Cut'), mas: role('Mastered', 'Remastered'), prod: role('Producer'),
      lis: listeners.get(r.slug) ?? null,
    };
  });

  const explore = readJson(path.join(PUBLIC, 'explore', 'explore.json'));
  if (!explore) console.warn('⚠ explore/explore.json not found; Wrapped connections will be empty (run generate-explore first)');
  const exArtists: Array<{ slug: string; name: string; from?: string; formed?: number; cc?: string }> = explore?.artists ?? [];
  const exIndex = new Map(exArtists.map((a, i) => [a.slug, i]));

  const artists: StoryArtist[] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).map(([s, { name, n }]) => {
    const meta = readJson(path.join(PUBLIC, 'artist', s, `${s}-image.json`)) ?? {};
    const info = exArtists[exIndex.get(s) ?? -1];
    return {
      s, name, n, new: firstYear.get(s) === year,
      fanart: meta.fanart?.file ?? null, focus: meta.focus ?? null,
      from: info?.from ?? null, formed: info?.formed ?? null, cc: info?.cc ?? null,
    };
  });

  // Every link inside the year, plus the 40 older artists most tied into it.
  const mine = new Set(artists.map(a => exIndex.get(a.s)).filter((i): i is number => i != null));
  const touching: Array<{ a: number; b: number; why: Array<{ type: string; who?: string }> }> =
    (explore?.links ?? []).filter((l: { a: number; b: number }) => mine.has(l.a) || mine.has(l.b));
  const reach = new Map<number, number>();
  for (const l of touching) for (const x of [l.a, l.b]) if (!mine.has(x)) reach.set(x, (reach.get(x) ?? 0) + 1);
  const keep = new Set([...reach.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([i]) => i));
  const links: StoryLink[] = [];
  const seen = new Set<string>();
  for (const l of touching) {
    const key = [l.a, l.b].sort((x, y) => x - y).join('-');
    if (seen.has(key) || ![l.a, l.b].every(x => mine.has(x) || keep.has(x))) continue;
    seen.add(key);
    links.push({ a: exArtists[l.a].slug, b: exArtists[l.b].slug, type: l.why[0]?.type ?? 'credit', who: l.why[0]?.who ?? null });
  }
  const inYear = new Set(artists.map(a => a.s));
  const outside = [...new Set(links.flatMap(l => [l.a, l.b]))].filter(s => !inYear.has(s)).sort()
    .map(s => ({ s, name: exArtists[exIndex.get(s)!].name }));

  // The latest year stops at its last month, so a year in progress doesn't trail off to zero.
  const latest = shelf.at(-1)?.date_added;
  if (latest) perMonth[latest.slice(0, 4)] = perMonth[latest.slice(0, 4)].slice(0, +latest.slice(5, 7));

  return { releases: out, artists, links, outside, perYear, perMonth };
}
