/**
 * The /stats data (src/types/stats.ts): counted from collection.json, every album and
 * artist JSON, album-colors.json and the explore graph. generate-stats.ts does the
 * reading; everything here is pure so it can be tested.
 */
import { familyOf, GENRE_FAMILIES } from '../../src/lib/genreFamilyDefs';
import type { StatsArtist, StatsData, StatsHolder, StatsPile, StatsRanked, StatsRecord } from '../../src/types/stats';
import { pressing, secs, vinyl } from './wrapped-story';

export interface CollectionEntry {
  release_name: string;
  release_artist: string;
  artists: Array<{ name: string; uri_artist: string }>;
  genre_names: string[];
  styles?: string[] | null;
  formats?: string[] | null;
  labels?: string[] | null;
  uri_release: string;
  date_added: string;
  date_release_year?: string | null;
  year_original?: number | null;
  boxset?: unknown;
}

interface Credit { name: string; role?: string }
export interface AlbumJson {
  tracklist?: Array<{ duration?: string; title?: string; extraartists?: Credit[] }>;
  credits?: Credit[];
  format_details?: Array<{ name?: string; qty?: string | number; descriptions?: string[]; text?: string }>;
  vinyl_colours?: string[];
  services?: Record<string, unknown>;
}

export interface ArtistJson {
  name?: string;
  raw_data?: { lastfm?: unknown; theaudiodb?: Record<string, unknown> | null };
}

export interface Colour { flood?: string; hue?: number; vivid?: number }

export interface StatsInput {
  collection: CollectionEntry[];
  albums: Map<string, AlbumJson>;
  artists: Map<string, ArtistJson>;
  colours: Record<string, Colour>;
  /** Explore graph home countries, by artist slug */
  cc: Map<string, string>;
  /** Today, YYYY-MM-DD (for the shelf's span) */
  today: string;
}

// shortcut: one sleeve is ~3.5 mm on the shelf; gatefolds and box sets run longer, so this undercounts a little.
const SLEEVE_M = 0.0035;
const STRIP = 14;

const slugOf = (uri: string) => uri.split('/').filter(Boolean).pop() ?? uri;
const hm = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
// Discogs disambiguates duplicate names with " (2)"; readers don't need that.
const clean = (n: string) => n.replace(/\s\(\d+\)$/, '').trim();
const num = (v: unknown) => (Number.isFinite(+(v as number)) && +(v as number) > 0 ? +(v as number) : null);

/** A field from the scrapper's Python-repr service strings, e.g. `LastFmData(playcount=24246137, …)`. */
export function reprField(text: unknown, key: string): string | null {
  if (typeof text !== 'string') return null;
  const m = new RegExp(`\\b${key}=(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|([^,)\\]]+))`).exec(text);
  const v = m ? (m[1] ?? m[2] ?? m[3]) : null;
  return v == null || v === 'None' ? null : v;
}

// Who owns the recording, from the ℗ line; the majors by their labels, else independent.
const OWNERS: Array<[string, RegExp]> = [
  ['Universal', /universal|\bumg\b|\bume\b|island records|polydor|virgin|\bemi\b|capitol|mercury|decca|interscope|geffen|a&m|motown|def jam|verve|deutsche grammophon|london records|fontana|vertigo/i],
  ['Sony', /sony|columbia|\brca\b|\bepic\b|arista|legacy recordings|\bjive\b|\bcbs\b|syco|magnetic north/i],
  ['Warner', /warner|rhino|atlantic|parlophone|elektra|reprise|\bsire\b|nonesuch|asylum|\bwea\b|east west|roadrunner|chrysalis records ltd/i],
  ['BMG', /\bbmg\b|sanctuary|chrysalis|infectious|rough trade publishing/i],
  ['Concord', /concord|craft recordings|fantasy records|rounder/i],
];
export function ownerOf(copyright: string): string {
  return OWNERS.find(([, rx]) => rx.test(copyright))?.[0] ?? 'Independent';
}

// Pressing details worth a card, matched against a record's format text.
const SPECS: Array<[string, RegExp]> = [
  ['180 g', /\b18\d\s?(g|gram|gr)\b/i],
  ['200 g', /\b200\s?(g|gram|gr)\b/i],
  ['45 RPM', /\b45 RPM\b/i],
  ['Gatefold', /gatefold/i],
  ['Numbered', /numbered/i],
  ['Record Store Day', /record store day|\bRSD\b/i],
  ['Half-speed', /half[- ]speed/i],
  ['Mono', /\bmono\b/i],
  ['Etched', /etched/i],
  ['Single sided', /single sided/i],
  ['Picture disc', /picture disc/i],
  ['Test pressing', /test pressing/i],
  ['Signed', /\bsigned\b|autograph/i],
  ['Box set', /box set/i],
  ['Limited edition', /limited edition/i],
  ['Deluxe edition', /deluxe/i],
];
export function specsOf(a: AlbumJson, formats: string[] = []): string[] {
  const text = [...formats, ...(a.format_details ?? []).flatMap(f => [f.name ?? '', ...(f.descriptions ?? []), f.text ?? ''])].join(' · ');
  return SPECS.filter(([, rx]) => rx.test(text)).map(([name]) => name);
}

const ROLES: Array<[keyof StatsData['boards'] | 'design' | 'photo', RegExp]> = [
  ['written', /written|composed|songwriter|lyrics|music by/i],
  ['produced', /^(co-)?producer|produced by/i],
  ['engineered', /recorded by|^engineer|mixed by|^mixed/i],
  ['mastered', /mastered by|^mastering|remastered by/i],
  ['cut', /lacquer cut/i],
  ['design', /design|artwork|art direction|illustration|^cover|layout|painting/i],
  ['photo', /photograph/i],
];

class Tally {
  private m = new Map<string, { recs: string[]; songs: number }>();
  add(name: string, slug: string, songs = 0) {
    const n = clean(name);
    if (!n || /^(various|traditional|unknown|anonymous)\b/i.test(n)) return;
    const e = this.m.get(n) ?? { recs: [], songs: 0 };
    if (!e.recs.includes(slug)) e.recs.push(slug);
    e.songs += songs;
    this.m.set(n, e);
  }
  top(k: number, songs = false): StatsRanked[] {
    // Songwriters rank by songs written, everyone else by records.
    const by = (e: { recs: string[]; songs: number }) => (songs ? e.songs : e.recs.length);
    return [...this.m].sort((a, b) => by(b[1]) - by(a[1]) || b[1].recs.length - a[1].recs.length || a[0].localeCompare(b[0])).slice(0, k)
      .map(([name, e]) => ({ name, n: e.recs.length, s: e.recs.slice(-STRIP).reverse(), ...(songs ? { songs: e.songs } : {}) }));
  }
}

/** One colour per genre family, from that family's most vivid sleeves, kept apart in hue (as Wrapped's). */
function familyColours(recs: Array<{ fam: string; c: Colour }>) {
  const used: number[] = [];
  const fallback = ['#e9a23b', '#c8553d', '#3c7bd8', '#5aa469', '#b05fc4', '#d9c24a', '#2fb5b0', '#e2708a', '#8b8f94', '#6f8fd8', '#c9a24a', '#7ac77a'];
  return GENRE_FAMILIES.map((f, i) => {
    const pick = recs.filter(r => r.fam === f.key && r.c.flood && (r.c.vivid ?? 0) > 0.45).sort((a, b) => (b.c.vivid ?? 0) - (a.c.vivid ?? 0))
      .find(r => used.every(h => Math.min(Math.abs(h - (r.c.hue ?? 0)), 1 - Math.abs(h - (r.c.hue ?? 0))) > 0.05));
    if (pick) used.push(pick.c.hue ?? 0);
    return { key: f.key, name: f.name, colour: pick?.c.flood ?? fallback[i] };
  });
}

export function buildStats(input: StatsInput): StatsData {
  const shelf = input.collection.filter(r => r.boxset == null).sort((a, b) => a.date_added.localeCompare(b.date_added));
  if (!shelf.length) throw new Error('The collection is empty');

  const records: StatsRecord[] = [];
  const colourOf = new Map<string, Colour>();
  const tallies = Object.fromEntries(ROLES.map(([k]) => [k, new Tally()])) as Record<(typeof ROLES)[number][0], Tally>;
  const labels = new Tally(), owners = new Tally(), specs = new Tally();
  const piles = new Map<string, StatsPile & { heavyG: number }>();
  const artistRecs = new Map<string, { name: string; recs: StatsRecord[] }>();
  let kgG = 0, runtime = 0, discs = 0, tracks = 0, coloured = 0, ownersKnown = 0;
  const longestTrack = new Map<string, number>();
  const trackCount = new Map<string, number>();
  let latestColoured: string | null = null;
  const weights = new Map<string, number>();

  for (const r of shelf) {
    const s = slugOf(r.uri_release);
    const a = input.albums.get(s) ?? {};
    const c = input.colours[r.uri_release] ?? input.colours[`/album/${s}/`] ?? {};
    colourOf.set(s, c);
    const lastfm = a.services?.lastfm;
    const rec: StatsRecord = {
      s, t: r.release_name, by: r.release_artist, a: r.artists.map(x => slugOf(x.uri_artist)), d: r.date_added.slice(0, 10),
      y: num(r.year_original), p: num(r.date_release_year?.slice(0, 4)), f: c.flood ?? null,
      fam: familyOf({ styles: r.styles, genre_names: r.genre_names }),
      lis: num(reprField(lastfm, 'listeners')),
    };
    records.push(rec);
    const names = new Set(r.artists.map(x => x.name.toLowerCase()));
    for (const x of r.artists) {
      const k = slugOf(x.uri_artist);
      const e = artistRecs.get(k) ?? { name: x.name, recs: [] };
      e.recs.push(rec);
      artistRecs.set(k, e);
    }

    // Weight, discs, run time, the longest track.
    const p = pressing(a.format_details);
    kgG += p.grams; discs += p.discs; weights.set(s, p.grams);
    const list = a.tracklist ?? [];
    tracks += list.length;
    trackCount.set(s, list.length);
    const timed = list.map(t => secs(t.duration));
    const rt = list.length && timed.filter(Boolean).length >= list.length * 0.6 ? timed.reduce((x, y) => x + y, 0) : 0;
    runtime += rt;
    if (timed.length) longestTrack.set(s, Math.max(...timed));
    const vc = (a.vinyl_colours ?? []).map(vinyl).filter(v => !!v);
    if (vc.length) { coloured++; latestColoured = s; }

    const yr = rec.d.slice(0, 4);
    const pile = piles.get(yr) ?? { yr, records: 0, kg: 0, hours: 0, coloured: 0, heaviest: s, heavyG: 0, last: s, discs: [] };
    pile.records++; pile.kg += p.grams / 1000; pile.hours += rt / 3600; pile.last = s;
    if (vc.length) pile.coloured++;
    if (p.grams > pile.heavyG) { pile.heavyG = p.grams; pile.heaviest = s; }
    for (let i = 0; i < p.discs; i++) {
      const v = vc[i % Math.max(1, vc.length)];
      pile.discs.push([p.size, v ? v.hex[i % v.hex.length] : null]);
    }
    piles.set(yr, pile);

    // Credits: the release's own and every track's.
    const credits: Array<Credit & { songs: number }> = [
      ...(a.credits ?? []).map(x => ({ ...x, songs: 0 })),
      ...list.flatMap(t => (t.extraartists ?? []).map(x => ({ ...x, songs: 1 }))),
    ];
    for (const x of credits) {
      for (const [k, rx] of ROLES) {
        if (!rx.test(x.role ?? '')) continue;
        if (k === 'produced' && names.has(clean(x.name).toLowerCase())) continue;
        tallies[k].add(x.name, s, k === 'written' ? x.songs : 0);
      }
    }
    if (r.labels?.[0]) labels.add(r.labels[0], s);
    const cp = reprField(a.services?.apple_music, 'copyright');
    if (cp) { ownersKnown++; owners.add(ownerOf(cp), s); }
    for (const sp of specsOf(a, r.formats ?? [])) specs.add(sp, s);
    if (vc.length) specs.add('Coloured vinyl', s);
  }

  const artists: StatsArtist[] = [...artistRecs].filter(([k]) => k !== 'various').map(([k, e]) => {
    const j = input.artists.get(k);
    const t = j?.raw_data?.theaudiodb ?? {};
    const vivid = [...e.recs].sort((x, y) => (colourOf.get(y.s)?.vivid ?? 0) - (colourOf.get(x.s)?.vivid ?? 0))[0];
    return {
      s: k, name: j?.name ?? e.name, n: e.recs.length, first: e.recs[0].d, f: vivid?.f ?? null,
      cc: input.cc.get(k) ?? (typeof t.country_code === 'string' && t.country_code ? t.country_code.toUpperCase() : null),
      formed: num(t.formed_year), born: num(t.born_year), split: t.disbanded === true, died: num(t.died_year),
      mood: typeof t.mood === 'string' && t.mood ? t.mood : null,
      gender: typeof t.gender === 'string' && t.gender ? t.gender : null,
    };
  }).sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));

  const perYear: Record<string, number> = {};
  for (const r of records) perYear[r.d.slice(0, 4)] = (perYear[r.d.slice(0, 4)] ?? 0) + 1;
  const years = records.filter(r => r.y).map(r => r.y!);
  const totals: StatsData['totals'] = {
    records: records.length,
    artists: artists.length,
    kg: Math.round(kgG / 1000),
    hours: Math.round(runtime / 3600),
    discs, tracks, coloured,
    metres: Math.round(records.length * SLEEVE_M * 10) / 10,
    oldest: Math.min(...years),
    newest: Math.max(...years),
    since: records[0].d,
  };
  const boards: StatsData['boards'] = {
    written: tallies.written.top(8, true),
    produced: tallies.produced.top(8),
    engineered: tallies.engineered.top(8),
    mastered: tallies.mastered.top(8),
    cut: tallies.cut.top(8),
    labels: labels.top(8),
  };
  const sleeves = { design: tallies.design.top(10), photo: tallies.photo.top(10) };
  const ownership = { known: ownersKnown, groups: owners.top(10) };
  const specList = specs.top(20);

  return {
    generated: input.today,
    totals,
    holders: holderPool({ records, artists, totals, boards, sleeves, owners: ownership, specs: specList, weights, longestTrack, trackCount, latestColoured }),
    families: familyColours(records.map(r => ({ fam: r.fam, c: colourOf.get(r.s) ?? {} }))),
    perYear,
    records,
    artists,
    piles: [...piles.values()].map(p => ({ yr: p.yr, records: p.records, kg: Math.round(p.kg * 10) / 10, hours: Math.round(p.hours), coloured: p.coloured, heaviest: p.heaviest, last: p.last, discs: p.discs })),
    boards,
    sleeves,
    owners: ownership,
    specs: specList,
  };
}

interface PoolInput {
  records: StatsRecord[];
  artists: StatsArtist[];
  totals: StatsData['totals'];
  boards: StatsData['boards'];
  sleeves: StatsData['sleeves'];
  owners: StatsData['owners'];
  specs: StatsRanked[];
  weights: Map<string, number>;
  longestTrack: Map<string, number>;
  trackCount: Map<string, number>;
  latestColoured: string | null;
}

const SPEC_LABEL: Record<string, string> = {
  '180 g': '180 g pressings', '200 g': '200 g pressings', '45 RPM': 'cut at 45 RPM', Gatefold: 'gatefold sleeves', Numbered: 'numbered copies',
  'Record Store Day': 'Record Store Day releases', 'Half-speed': 'half-speed masters', Mono: 'mono pressings', Etched: 'etched sides',
  'Single sided': 'single-sided records', 'Picture disc': 'picture discs', 'Signed': 'signed copies', 'Box set': 'box sets',
  'Limited edition': 'limited editions', 'Deluxe edition': 'deluxe editions',
};
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Facts for the shelf's tags: a collection figure, what it counts, and a record that goes
 * with it. The page shows six at random, each on a different record, so the pool holds
 * far more than it needs.
 */
export function holderPool(x: PoolInput): StatsHolder[] {
  const t = x.totals, out: StatsHolder[] = [];
  const by = new Map(x.records.map(r => [r.s, r]));
  const add = (stat: string, label: string, r: StatsRecord | string | undefined | null, note: string) => {
    const rec = typeof r === 'string' ? by.get(r) : r;
    if (rec) out.push({ stat, label, s: rec.s, note });
  };
  const max = <T>(list: T[], f: (v: T) => number) => list.reduce<T | undefined>((a, b) => (a === undefined || f(b) > f(a) ? b : a), undefined);
  const min = <T>(list: T[], f: (v: T) => number) => max(list, v => -f(v));
  const n = (v: number) => v.toLocaleString('en-GB');
  const dated = x.records.filter((r): r is StatsRecord & { y: number } => !!r.y);
  const latestBy = (s: string) => [...x.records].reverse().find(r => r.a.includes(s));

  // The shelves as a whole.
  const heavy = max(x.records, r => x.weights.get(r.s) ?? 0);
  if (heavy) add(`${n(t.kg)} kg`, 'of vinyl', heavy, `Heaviest: ${((x.weights.get(heavy.s) ?? 0) / 1000).toFixed(1)} kg`);
  const long = max(x.records.filter(r => x.longestTrack.get(r.s)), r => x.longestTrack.get(r.s)!);
  if (long) add(`${n(t.hours)} h`, 'of music', long, `Longest track: ${hm(x.longestTrack.get(long.s)!)}`);
  const most_tracks = max(x.records, r => x.trackCount.get(r.s) ?? 0);
  if (most_tracks) add(n(t.tracks), 'tracks', most_tracks, `Most tracks: ${x.trackCount.get(most_tracks.s)}`);
  add(n(t.discs), 'discs', x.records.at(-1), 'The latest in');
  add(`${t.metres} m`, 'of shelf', x.records[0], 'The first in');
  const oldest = min(dated, r => r.y);
  if (oldest) add(`${t.newest - t.oldest} years`, `of records, ${t.oldest}–${t.newest}`, oldest, `Oldest: first out in ${oldest.y}`);
  add(n(t.coloured), 'coloured pressings', x.latestColoured, 'The latest coloured pressing');
  const half = Math.floor(x.records.length / 2);
  if (x.records[half]) add(n(t.records), 'records', x.records[half], `The halfway mark: record ${n(half + 1)}`);

  // Artists.
  const top = x.artists[0];
  if (top) add(n(top.n), `by ${top.name}`, latestBy(top.s), 'The most collected artist');
  const newest = x.artists.reduce<StatsArtist | undefined>((a, b) => (a === undefined || b.first > a.first ? b : a), undefined);
  if (newest) add(n(t.artists), 'artists', latestBy(newest.s), `The newest name: ${newest.name}`);
  const ccs = [...new Set(x.artists.map(a => a.cc).filter((c): c is string => !!c))];
  const rareCc = min(ccs, cc => x.artists.filter(a => a.cc === cc).length);
  const rare = rareCc ? x.artists.find(a => a.cc === rareCc) : undefined;
  if (rare) add(n(ccs.length), 'home countries', latestBy(rare.s), `The rarest: ${rare.name}`);
  const gone = x.artists.filter(a => a.split || a.died);
  if (gone.length) add(n(gone.length), 'acts no longer going', latestBy(gone[0].s), `Including ${gone[0].name}`);

  // Credits.
  const w = x.boards.written[0];
  // Their own record if there is one, not somebody's cover of their song.
  if (w) add(n(w.songs ?? w.n), `songs by ${w.name}`, w.s.find(s => by.get(s)?.by === w.name) ?? w.s[0], `Written by ${w.name}`);
  for (const [k, verb] of [['mastered', 'mastered by'], ['cut', 'cut by'], ['produced', 'produced by'], ['engineered', 'mixed or recorded by']] as const) {
    const r = x.boards[k][0];
    if (r) add(n(r.n), `${verb} ${r.name}`, r.s[0], `The latest ${verb} ${r.name}`);
  }
  const label = x.boards.labels[0];
  if (label) add(n(label.n), `on ${label.name}`, label.s[0], `The latest on ${label.name}`);
  const designer = x.sleeves.design[0], photographer = x.sleeves.photo[0];
  if (designer) add(n(designer.n), `sleeves by ${designer.name}`, designer.s[0], `Designed by ${designer.name}`);
  if (photographer) add(n(photographer.n), `shot by ${photographer.name}`, photographer.s[0], `Photographed by ${photographer.name}`);

  // Ownership and pressings.
  const indie = x.owners.groups.find(g => g.name === 'Independent');
  if (indie && x.owners.known) add(`${Math.round((indie.n / x.owners.known) * 100)}%`, 'independent', indie.s[0], 'Owned outside the majors');
  for (const sp of x.specs) {
    if (sp.n < 5 || !SPEC_LABEL[sp.name]) continue;
    add(n(sp.n), SPEC_LABEL[sp.name], sp.s[0], `The latest of the ${SPEC_LABEL[sp.name]}`);
  }

  // Reissues and years.
  const gap = max(dated.filter(r => r.p && r.p >= r.y), r => r.p! - r.y);
  if (gap) add(`${gap.p! - gap.y} years`, 'first out to pressing', gap, `First out ${gap.y}, pressed ${gap.p}`);
  const sameYear = dated.filter(r => r.p === r.y);
  if (sameYear.length) add(n(sameYear.length), 'bought new', sameYear.at(-1), 'Pressed the year it came out');
  const mid = [...dated].sort((a, b) => a.y - b.y)[Math.floor(dated.length / 2)];
  if (mid) add(String(mid.y), 'the median year', [...dated].reverse().find(r => r.y === mid.y), `First out in ${mid.y}`);
  const months = new Map<string, StatsRecord[]>();
  for (const r of x.records) months.set(r.d.slice(0, 7), [...(months.get(r.d.slice(0, 7)) ?? []), r]);
  const busiest = max([...months], m => m[1].length);
  if (busiest) add(n(busiest[1].length), `added ${MONTH[+busiest[0].slice(5, 7) - 1].slice(0, 3)} ${busiest[0].slice(0, 4)}`, max(busiest[1], r => r.lis ?? 0), 'The busiest month');
  return out;
}
