/**
 * The Thread (/explore): an endless feed of hops through the collection.
 *
 * Every card is an artist or a record, and every card says how it connects to
 * the one before ("Tony Visconti produced "Heroes" and Electric Warrior",
 * "Also on Charisma"). This module is the pure part: the ways out of a card,
 * how they are ranked, and the trail of cards so far. The page
 * (src/components/explore/thread/) only draws it and moves through it.
 *
 * Everything random is seeded from a per-trail seed (`r` in the URL) and the
 * card's place in the trail, so a shared `?trail=…&r=…` link replays the same
 * cards, the same reasons and the same card types.
 */
import { colourTags, PATTERN_TAGS } from '@/lib/vinylLook';
import { creditVerb, type CreditKind } from './credits';
import { describeLink, reasonWeight, sortReasons, type Explore } from './data';
import type { ExploreAlbum, LinkReason } from './types';

// ---- seeded randomness ------------------------------------------------------------

/** FNV-1a, 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** mulberry32: a small, fast seeded generator in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator for one decision, keyed by the trail seed and what is being decided. */
export const rngFor = (seed: string, ...parts: (string | number)[]): Rng => mulberry32(hashString([seed, ...parts].join('|')));

export const newSeed = (): string => Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');

const pickWith = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
function shuffleWith<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- hops and cards ---------------------------------------------------------------

export type HopKind = 'a' | 'r';

/** Why a hop was made: an artist link reason, or a record-level link. */
export type HopType =
  | LinkReason['type']
  /** artist -> a record they guest on */
  | 'guestspot'
  /** artist -> one of their records */
  | 'record'
  /** artist -> one of their records, shown as its video */
  | 'video'
  /** record -> its artist */
  | 'artist'
  /** record -> another record with the same producer, player, writer, engineer or designer */
  | 'same-credit'
  | 'label'
  | 'colour'
  | 'style'
  | 'year'
  | 'seed'
  | 'jump';

export type Video = [id: string, title: string, kind: string];

export interface Hop {
  kind: HopKind;
  /** Artist or album index. */
  i: number;
  type: HopType;
  /** The connection line, in plain words. */
  text: string;
  /** How good a hop this is before jitter and penalties. */
  base: number;
  /** A hop that lands on a video card. */
  vid?: Video;
  /** The person the link runs through (their Discogs photo sits beside the line). */
  person?: number | null;
  /** Under the connection line on the first card. */
  sub?: string;
  /** Rank after jitter and penalties (set by computeOuts). */
  rank?: number;
}

export type CardView = 'fanart' | 'photo' | 'sleeve' | 'video';

export interface ThreadNode {
  /** Unique per node in a session; React key. */
  id: number;
  kind: HopKind;
  i: number;
  /** How we got here. */
  via: Hop;
  /** The previous card's ways out (the start's other starting points on the first card). */
  alts: Hop[];
  /** This card's place in `alts`. */
  alt: number;
  view: CardView;
  vid: Video | null;
  /** Ways out of this card, best first (computed on demand). */
  outs: Hop[] | null;
  /** Every candidate before the top few are kept, for replaying shared trails. */
  candidates: Hop[] | null;
}

export const MAX_WAYS_OUT = 7;

/** Where The Thread lives; The Galaxy (the map) is `/explore` and `/explore/<artist-slug>`. */
export const THREAD_PATH = '/explore/thread';
/** An artist on The Galaxy's map. */
export const galaxyPath = (artistSlug: string) => `/explore/${artistSlug}`;

const TYPE_LABEL: Record<HopType, string> = {
  bandmate: 'Shared member',
  member: 'Member',
  group: 'Was in',
  alias: 'Also known as',
  guest: 'Guest spot',
  credit: 'Credited on',
  'shared-credit': 'Same credit',
  guestspot: 'Guest spot',
  record: 'On the shelf',
  video: 'Video',
  artist: 'Artist',
  'same-credit': 'Same credit',
  label: 'Label',
  colour: 'Vinyl colour',
  style: 'Style',
  year: 'Year',
  seed: 'Start',
  jump: 'Jump',
};
/** A short label for the kind of hop, shown above the connection line. */
export const hopLabel = (hop: Hop): string => TYPE_LABEL[hop.type];

export const nodeKey = (n: { kind: HopKind; i: number }) => `${n.kind}:${n.i}`;

/** "Rhino Records (2)" is how Discogs tells labels apart; nobody needs to see it. */
export const labelName = (l: string | null | undefined) => String(l ?? '').replace(/\s*\(\d+\)$/, '');

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Strip "Artist - " and "(Official Video)" from a YouTube title. */
export function cleanVideoTitle(title: string, names: (string | null | undefined)[] = []): string {
  let s = title || '';
  for (const n of names) {
    if (!n) continue;
    const re = new RegExp(`^\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–—:.]\\s*`, 'i');
    s = s.replace(re, '');
  }
  s = s
    .replace(/\s*[([](official|music|lyric|hd|hq|remaster|audio|video|4k|visuali)[^)\]]*[)\]]/gi, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  return s || title || 'Untitled';
}

// ---- per-graph lookups ------------------------------------------------------------

export interface ThreadIndex {
  various: number | null;
  /** Artists with four or more links: starting points. */
  wellConnected: number[];
  /** Person name -> person index, for member/group links that only carry a name. */
  personByName: Map<string, number>;
  /** Vinyl colour family ("Red", "Clear"…) -> album indexes. */
  byVinylFamily: Map<string, number[]>;
}

const indexes = new WeakMap<Explore, ThreadIndex>();

/** The colour family a pressing is filed under (Red, Clear, Gold & silver…), ignoring patterns. */
export function vinylFamily(vc: string | null | undefined): string | null {
  return colourTags(vc).find(t => !PATTERN_TAGS.includes(t)) ?? null;
}

export function threadIndex(d: Explore): ThreadIndex {
  let ix = indexes.get(d);
  if (ix) return ix;
  const various = d.artistBySlug.get('various') ?? null;
  const byVinylFamily = new Map<string, number[]>();
  d.albums.forEach((r, i) => {
    const f = vinylFamily(r.vc);
    if (!f) return;
    const list = byVinylFamily.get(f);
    if (list) list.push(i);
    else byVinylFamily.set(f, [i]);
  });
  const everyone = d.artists.map((_, i) => i).filter(i => i !== various && d.artists[i].records.length);
  const well = everyone.filter(i => d.neighbours[i].length >= 4);
  // Never empty: a small graph falls back to anyone with a link, then anyone at all.
  const linked = well.length ? well : everyone.some(i => d.neighbours[i].length) ? everyone.filter(i => d.neighbours[i].length) : everyone;
  ix = {
    various,
    // Prefer artists with a fanart hero, so the first card is a photo.
    wellConnected: linked.some(i => d.artists[i].fanart) ? linked.filter(i => d.artists[i].fanart) : linked,
    personByName: new Map(d.people.map((p, i) => [p.name, i])),
    byVinylFamily,
  };
  indexes.set(d, ix);
  return ix;
}

// ---- ways out ---------------------------------------------------------------------

const shareArtist = (d: Explore, j: number, r: ExploreAlbum) => d.albums[j].a.some(x => r.a.includes(x));

const curly = (t: string) => t.replace(/"([^"]*)"/g, '“$1”');
/** describeLink with typographic quotes. */
const linkText = (d: Explore, w: LinkReason, from: number, to: number) => curly(describeLink(d, w, from, to));

function personOf(ix: ThreadIndex, w: LinkReason): number | null {
  if ('person' in w) return w.person;
  if (w.type === 'member' || w.type === 'group') return ix.personByName.get(w.who) ?? null;
  return null;
}

/** Hop weight for an artist link, on the same scale as the record-level ones. */
const linkBase = (w: LinkReason) => 1 + reasonWeight(w) * 0.45;

const KIND_WEIGHT: Record<CreditKind, number> = { produced: 3.3, played: 3.2, wrote: 2.8, engineered: 2.6, designed: 2.5 };

export function artistOuts(d: Explore, ix: ThreadIndex, ai: number, rng: Rng): Hop[] {
  const a = d.artists[ai];
  const out: Hop[] = [];
  for (const { other, why } of d.neighbours[ai]) {
    if (other === ix.various) continue;
    const w = sortReasons(why)[0];
    out.push({ kind: 'a', i: other, type: w.type, text: linkText(d, w, ai, other), base: linkBase(w), person: personOf(ix, w) });
    for (const g of why) {
      if (g.type === 'guest' && g.guest === ai) {
        out.push({ kind: 'r', i: g.album, type: 'guestspot', text: linkText(d, g, ai, other), base: 2.6 });
      } else if (g.type === 'credit' && !d.albums[g.album].a.includes(ai)) {
        // This artist is the one credited: hop to the record they are on.
        out.push({ kind: 'r', i: g.album, type: 'credit', text: linkText(d, g, ai, other), base: 3.1, person: g.person });
      } else if (g.type === 'shared-credit') {
        const theirs = g.albums.find(x => !d.albums[x].a.includes(ai));
        if (theirs != null) out.push({ kind: 'r', i: theirs, type: 'shared-credit', text: linkText(d, g, ai, other), base: 2.5, person: g.person });
      }
    }
  }
  const recs = a.records;
  for (const ri of shuffleWith(rng, recs).slice(0, 4)) {
    out.push({ kind: 'r', i: ri, type: 'record', text: recordText(d, ai), base: 1.7 + Math.min(1, (d.albums[ri].lis || 0) / 400000) * 0.4 });
  }
  const withVideo = recs.filter(ri => d.albums[ri].v.length);
  if (withVideo.length) {
    const ri = pickWith(rng, withVideo);
    const r = d.albums[ri];
    const v = r.v.find(x => x[2] === 'video') ?? r.v.find(x => x[2] === 'live') ?? r.v[0];
    out.push({ kind: 'r', i: ri, type: 'video', vid: v, text: `${a.name} on film: “${videoTitle(d, v, r)}”, from ${r.t}`, base: 2.2 });
  }
  return out;
}

const recordText = (d: Explore, ai: number) => {
  const a = d.artists[ai];
  const n = a.records.length;
  return n > 1 ? `One of ${n} ${a.name} records in the collection` : `The only ${a.name} record in the collection`;
};

export const videoTitle = (d: Explore, v: Video, r: ExploreAlbum) => cleanVideoTitle(v[1], [r.by, ...r.a.map(i => d.artists[i].name)]);

/** "Tony Visconti produced "Heroes" and Electric Warrior" for two records. */
function sameCreditText(name: string, kindA: CreditKind, roleA: string, titleA: string, kindB: CreditKind, roleB: string, titleB: string) {
  const va = creditVerb(kindA, roleA);
  const vb = creditVerb(kindB, roleB);
  return curly(va === vb ? `${name} ${va} ${titleA} and ${titleB}` : `${name} ${va} ${titleA} and ${vb} ${titleB}`);
}

export function albumOuts(d: Explore, ix: ThreadIndex, ri: number, rng: Rng): Hop[] {
  const r = d.albums[ri];
  const out: Hop[] = [];

  // guests on this record
  for (const ai of r.a) {
    for (const { other, why } of d.neighbours[ai]) {
      for (const w of why) {
        if (w.type === 'guest' && w.album === ri && w.host === ai) out.push({ kind: 'a', i: w.guest, type: 'guest', text: linkText(d, w, ai, other), base: 3.3 });
      }
    }
  }

  // people credited on it: the collection artists among them, and their other records
  const credited: Hop[] = [];
  const seenPeople = new Set<number>();
  for (const { person, role } of d.creditsOn.get(ri) ?? []) {
    if (seenPeople.has(person)) continue;
    const p = d.people[person];
    const mine = p.credits.find(c => c[0] === ri && c[1] === role) ?? p.credits.find(c => c[0] === ri);
    if (!mine) continue;
    seenPeople.add(person);
    const kind = mine[2];
    if (p.artist != null && !r.a.includes(p.artist) && p.artist !== ix.various) {
      out.push({ kind: 'a', i: p.artist, type: 'credit', text: curly(`${p.name} ${creditVerb(kind, role)} ${r.t}`), base: 3.4, person });
    }
    const others = p.credits.filter(c => c[0] !== ri && !shareArtist(d, c[0], r));
    if (!others.length) continue;
    const same = others.filter(c => c[2] === kind);
    const [q, qRole, qKind] = pickWith(rng, same.length ? same : others);
    credited.push({
      kind: 'r', i: q, type: 'same-credit', person,
      text: sameCreditText(p.name, kind, role, r.t, qKind, qRole, d.albums[q].t),
      base: KIND_WEIGHT[kind] - (same.length ? 0 : 0.3),
    });
  }
  out.push(...credited.sort((x, y) => y.base - x.base).slice(0, 3));

  for (const ai of r.a) if (ai !== ix.various) out.push({ kind: 'a', i: ai, type: 'artist', text: `${r.t} is by ${d.artists[ai].name}`, base: 2.1 });

  const labels: Hop[] = [];
  for (const l of new Set(r.l)) {
    const list = (d.byLabel.get(l) ?? []).filter(j => j !== ri && !shareArtist(d, j, r));
    if (!list.length) continue;
    const same = list.filter(j => r.y && d.albums[j].y === r.y);
    const j = pickWith(rng, same.length ? same : list);
    labels.push({
      kind: 'r', i: j, type: 'label',
      text: same.length ? `Same label, same year: ${labelName(l)}, ${r.y}` : `Also on ${labelName(l)}`,
      base: 2.7 - Math.log10(list.length + 1) * 0.45 + (same.length ? 0.4 : 0),
    });
  }
  out.push(...labels.sort((x, y) => y.base - x.base).slice(0, 2));

  const fam = vinylFamily(r.vc);
  if (fam && r.vc) {
    const exact = (d.byColour.get(r.vc) ?? []).filter(j => j !== ri && !shareArtist(d, j, r));
    const loose = (ix.byVinylFamily.get(fam) ?? []).filter(j => j !== ri && !shareArtist(d, j, r));
    if (exact.length && r.vc.toLowerCase() !== fam.toLowerCase()) out.push({ kind: 'r', i: pickWith(rng, exact), type: 'colour', text: `Also on ${r.vc.toLowerCase()} vinyl`, base: 2.4 });
    else if (loose.length) out.push({ kind: 'r', i: pickWith(rng, loose), type: 'colour', text: `Also on ${fam.toLowerCase()} vinyl`, base: 2.2 });
  }

  const styles = r.s
    .map(s => [s, (d.byStyle.get(s) ?? []).filter(j => j !== ri && !shareArtist(d, j, r))] as const)
    .filter(([, list]) => list.length)
    .sort((x, y) => x[1].length - y[1].length);
  for (const [s, list] of styles.slice(0, 2)) out.push({ kind: 'r', i: pickWith(rng, list), type: 'style', text: `Also filed under ${s}`, base: 2.3 - Math.log10(list.length + 1) * 0.35 });

  if (r.y) {
    const year = (d.byYear.get(r.y) ?? []).filter(j => j !== ri && !shareArtist(d, j, r));
    const family = year.filter(j => d.albums[j].fam === r.fam);
    const famName = d.families.find(f => f.key === r.fam)?.name;
    if (family.length && famName) out.push({ kind: 'r', i: pickWith(rng, family), type: 'year', text: `Also from ${r.y}, also ${famName}`, base: 1.6 });
    else if (year.length) out.push({ kind: 'r', i: pickWith(rng, year), type: 'year', text: `Also from ${r.y}`, base: 1.2 });
  }
  return out;
}

const jumpText = (d: Explore, i: number) => `Nothing new links from here, so a jump to ${d.artists[i].name}`;

/**
 * The reason for a hop that wasn't generated (a record picked from the details
 * panel, or a shared trail whose hop isn't among the candidates).
 */
export function connect(d: Explore, ix: ThreadIndex, prev: { kind: HopKind; i: number }, kind: HopKind, i: number): Hop {
  const pi = prev.i;
  if (prev.kind === 'a' && kind === 'a') {
    const n = d.neighbours[pi].find(x => x.other === i);
    if (n) {
      const w = sortReasons(n.why)[0];
      return { kind, i, type: w.type, text: linkText(d, w, pi, i), base: 3, person: personOf(ix, w) };
    }
  }
  if (prev.kind === 'a' && kind === 'r') {
    const why = d.neighbours[pi].flatMap(x => x.why);
    const g = why.find(w => w.type === 'guest' && w.guest === pi && w.album === i);
    if (g) return { kind, i, type: 'guestspot', text: linkText(d, g, pi, i), base: 3 };
    const c = why.find(w => w.type === 'credit' && w.album === i && !d.albums[i].a.includes(pi));
    if (c && c.type === 'credit') return { kind, i, type: 'credit', text: linkText(d, c, pi, i), base: 3, person: c.person };
    if (d.albums[i].a.includes(pi)) return { kind, i, type: 'record', text: recordText(d, pi), base: 2 };
  }
  if (prev.kind === 'r' && kind === 'a') {
    const r = d.albums[pi];
    if (r.a.includes(i)) return { kind, i, type: 'artist', text: `${r.t} is by ${d.artists[i].name}`, base: 2 };
    for (const ai of r.a) {
      const n = d.neighbours[ai].find(x => x.other === i);
      const g = n?.why.find(w => w.type === 'guest' && w.album === pi);
      if (g) return { kind, i, type: 'guest', text: linkText(d, g, ai, i), base: 3 };
    }
    const c = (d.creditsOn.get(pi) ?? []).find(x => d.people[x.person].artist === i);
    if (c) {
      const kindOf = d.people[c.person].credits.find(x => x[0] === pi)?.[2] ?? 'played';
      return { kind, i, type: 'credit', text: curly(`${d.people[c.person].name} ${creditVerb(kindOf, c.role)} ${r.t}`), base: 3, person: c.person };
    }
  }
  if (prev.kind === 'r' && kind === 'r') {
    const r = d.albums[pi];
    const q = d.albums[i];
    if (shareArtist(d, i, r)) return { kind, i, type: 'record', text: `Also by ${q.by}`, base: 1 };
    for (const { person, role } of d.creditsOn.get(pi) ?? []) {
      const p = d.people[person];
      const theirs = p.credits.find(c => c[0] === i);
      const mine = p.credits.find(c => c[0] === pi && c[1] === role);
      if (theirs && mine) return { kind, i, type: 'same-credit', person, text: sameCreditText(p.name, mine[2], mine[1], r.t, theirs[2], theirs[1], q.t), base: 3 };
    }
    const l = r.l.find(x => q.l.includes(x));
    if (l) return { kind, i, type: 'label', text: r.y && r.y === q.y ? `Same label, same year: ${labelName(l)}, ${r.y}` : `Also on ${labelName(l)}`, base: 2 };
    const fam = vinylFamily(r.vc);
    if (fam && fam === vinylFamily(q.vc)) return { kind, i, type: 'colour', text: `Also on ${fam.toLowerCase()} vinyl`, base: 2 };
    const s = r.s.filter(x => q.s.includes(x)).sort((x, y) => (d.byStyle.get(x)?.length ?? 0) - (d.byStyle.get(y)?.length ?? 0))[0];
    if (s) return { kind, i, type: 'style', text: `Also filed under ${s}`, base: 2 };
    if (r.y && r.y === q.y) return { kind, i, type: 'year', text: `Also from ${r.y}`, base: 1 };
  }
  if (kind === 'a') return { kind, i, type: 'jump', text: jumpText(d, i), base: 0 };
  return { kind, i, type: 'jump', text: `A jump: no direct link from the last card`, base: 0 };
}

// ---- the trail --------------------------------------------------------------------

export interface StartParams {
  /** Slugs of artists and records, in order. */
  trail?: string[];
  /** Artist slug to start from. */
  seed?: string | null;
  /** Album slug to start from. */
  album?: string | null;
}

/** `?trail=a,b,c&seed=…&album=…&r=…` -> start parameters and the trail seed. */
export function parseThreadParams(params: URLSearchParams): StartParams & { r: string | null } {
  const trail = (params.get('trail') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return { trail, seed: params.get('seed'), album: params.get('album'), r: params.get('r') };
}

export class Thread {
  trail: ThreadNode[] = [];
  cur = 0;
  /** The furthest card visited; the trail strip and the URL go this far. */
  maxSeen = 0;
  readonly seen = new Set<string>();
  readonly usedText = new Set<string>();
  readonly ix: ThreadIndex;
  private nextId = 1;
  private nodes = new WeakMap<Hop, ThreadNode>();

  readonly d: Explore;
  /** Seeds every random choice, so `?trail=…&r=seed` replays the same cards. */
  readonly seed: string;

  constructor(d: Explore, seed: string = newSeed()) {
    this.d = d;
    this.seed = seed;
    this.ix = threadIndex(d);
  }

  get current(): ThreadNode {
    return this.trail[this.cur];
  }

  private entity(slug: string): { kind: HopKind; i: number } | null {
    const r = this.d.albumBySlug.get(slug);
    if (r != null) return { kind: 'r', i: r };
    const a = this.d.artistBySlug.get(slug);
    return a != null ? { kind: 'a', i: a } : null;
  }

  private startHops(first: { kind: HopKind; i: number }, picked: boolean): Hop[] {
    const { d, ix } = this;
    const rng = rngFor(this.seed, 'starts', nodeKey(first));
    const others = shuffleWith(rng, ix.wellConnected.filter(i => !(first.kind === 'a' && i === first.i))).slice(0, 5);
    const artistStart = (i: number, random: boolean): Hop => {
      const a = d.artists[i];
      const n = d.neighbours[i].length;
      const sub = n ? `${a.name} has ${plural(n, 'link')} to other artists in the collection` : `${plural(a.records.length, 'record')} in the collection`;
      return { kind: 'a', i, type: 'seed', text: `Start: ${a.name}`, sub: random ? `Picked at random: ${sub}` : sub, base: 0 };
    };
    let lead: Hop;
    if (first.kind === 'a') lead = artistStart(first.i, !picked);
    else {
      const r = d.albums[first.i];
      lead = { kind: 'r', i: first.i, type: 'seed', text: `Start: ${r.t}`, sub: [`${r.t} by ${r.by}`, r.y].filter(Boolean).join(', '), base: 0 };
    }
    return [lead, ...others.map(i => artistStart(i, true))];
  }

  /** Start from URL parameters: a shared trail, a seed artist, a record, or a random well-connected artist. */
  start(params: StartParams): this {
    const { d, ix } = this;
    this.trail = [];
    const ents = (params.trail ?? []).map(s => this.entity(s)).filter((e): e is { kind: HopKind; i: number } => !!e);
    let picked = ents.length > 0;
    if (!ents.length) {
      const album = params.album ? d.albumBySlug.get(params.album) : undefined;
      const artist = params.seed ? d.artistBySlug.get(params.seed) : undefined;
      if (album != null) ents.push({ kind: 'r', i: album });
      else if (artist != null) ents.push({ kind: 'a', i: artist });
      if (ents.length) picked = true;
      else ents.push({ kind: 'a', i: pickWith(rngFor(this.seed, 'first'), ix.wellConnected) });
    }
    const alts = this.startHops(ents[0], picked);
    const first = this.nodeFor(alts[0], alts, 0, null, 0);
    // The first card is always the plain card: the artist's photo or the sleeve.
    first.vid = null;
    first.view = first.kind === 'r' ? 'sleeve' : d.artists[first.i].fanart ? 'fanart' : 'photo';
    this.trail.push(first);
    for (let k = 1; k < ents.length; k++) {
      const outs = this.computeOuts(k - 1);
      const node = this.trail[k - 1];
      const { kind, i } = ents[k];
      let j = outs.findIndex(e => e.kind === kind && e.i === i);
      if (j < 0) {
        const cand = node.candidates?.find(e => e.kind === kind && e.i === i);
        const hop = cand ?? connect(d, ix, node, kind, i);
        if (outs.length >= MAX_WAYS_OUT) outs.pop();
        outs.unshift(hop);
        j = 0;
      }
      this.trail.push(this.nodeAt(k, j));
    }
    for (const n of this.trail) this.markSeen(n);
    this.cur = this.maxSeen = this.trail.length - 1;
    this.ensureAhead();
    return this;
  }

  /** The node for `hop`, made once so cycling back to a branch keeps its card. */
  private nodeFor(hop: Hop, alts: Hop[], alt: number, prev: ThreadNode | null, k: number): ThreadNode {
    let n = this.nodes.get(hop);
    if (n) return n;
    n = { id: this.nextId++, kind: hop.kind, i: hop.i, via: hop, alts, alt, view: 'sleeve', vid: null, outs: null, candidates: null };
    this.chooseView(n, prev, k);
    this.nodes.set(hop, n);
    return n;
  }

  /** The node for way out `j` into position `k`. */
  nodeAt(k: number, j: number): ThreadNode {
    const alts = k === 0 ? this.trail[0].alts : this.trail[k - 1].outs ?? this.computeOuts(k - 1);
    return this.nodeFor(alts[j], alts, j, k === 0 ? null : this.trail[k - 1], k);
  }

  /** Video now and then for rhythm, never two in a row; seeded so shared trails replay. */
  private chooseView(n: ThreadNode, prev: ThreadNode | null, k: number) {
    const { d } = this;
    const rng = rngFor(this.seed, 'view', k, nodeKey(n), n.via.type);
    const prevVideo = prev?.view === 'video';
    n.vid = null;
    if (n.kind === 'r') {
      const r = d.albums[n.i];
      if (n.via.vid) {
        n.view = 'video';
        n.vid = n.via.vid;
        return;
      }
      const v = r.v.find(x => x[2] === 'video') ?? r.v.find(x => x[2] === 'live');
      if (v && !prevVideo && rng() < 0.3) {
        n.view = 'video';
        n.vid = v;
        return;
      }
      n.view = 'sleeve';
      return;
    }
    const a = d.artists[n.i];
    if (a.videos.length && !prevVideo && rng() < (a.fanart ? 0.18 : 0.4)) {
      const v = pickWith(rng, a.videos);
      n.view = 'video';
      n.vid = [v[0], v[1], v[2]];
      return;
    }
    n.view = a.fanart ? 'fanart' : 'photo';
  }

  /** Rank the ways out of card `k`: real links first, varied, nothing already on the trail. */
  computeOuts(k: number): Hop[] {
    const { d, ix } = this;
    const node = this.trail[k];
    const key = nodeKey(node);
    const rng = rngFor(this.seed, 'outs', k, key);
    const jitter = rngFor(this.seed, 'rank', k, key);
    const inTrail = new Set(this.trail.slice(0, k + 1).map(nodeKey));
    const kinds = this.trail.slice(Math.max(0, k - 1), k + 1).map(n => n.kind);
    const recent = this.trail.slice(Math.max(1, k - 2), k + 1).map(n => n.via.type);
    const raw = node.kind === 'a' ? artistOuts(d, ix, node.i, rng) : albumOuts(d, ix, node.i, rng);
    const best = new Map<string, Hop>();
    for (const e of raw) {
      const kk = nodeKey(e);
      if (inTrail.has(kk) || e.text === node.via.text) continue;
      let s = e.base + jitter() * 1.1;
      if (recent.includes(e.type)) s -= 1.1;
      if (this.seen.has(kk)) s -= 2.5;
      if (this.usedText.has(e.text)) s -= 1.5;
      if (kinds.length === 2 && kinds.every(x => x === e.kind)) s -= 1.3;
      e.rank = s;
      const had = best.get(kk);
      if (!had || (had.rank ?? 0) < s) best.set(kk, e);
    }
    const candidates = [...best.values()].sort((x, y) => (y.rank ?? 0) - (x.rank ?? 0));
    let outs = candidates.slice(0, MAX_WAYS_OUT);
    if (outs.length < 2 && node.kind === 'a') {
      // A lone artist: carry on through their records' credits, labels, styles and colours.
      for (const ri of shuffleWith(rng, d.artists[node.i].records).slice(0, 2)) {
        for (const e of albumOuts(d, ix, ri, rng)) {
          if (e.kind !== 'r' || inTrail.has(nodeKey(e)) || outs.some(o => o.kind === e.kind && o.i === e.i)) continue;
          const text = e.type === 'same-credit' ? e.text : `${d.albums[ri].t}: ${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`;
          outs.push({ ...e, text, rank: e.base });
        }
      }
      outs = outs.sort((x, y) => (y.rank ?? 0) - (x.rank ?? 0)).slice(0, MAX_WAYS_OUT - 1);
      candidates.push(...outs.filter(o => !candidates.includes(o)));
    }
    if (!outs.length) {
      const pool = ix.wellConnected.filter(i => !inTrail.has(`a:${i}`) && !this.seen.has(`a:${i}`));
      const j = pickWith(rng, pool.length ? pool : ix.wellConnected);
      outs = [{ kind: 'a', i: j, type: 'jump', text: jumpText(d, j), base: 0 }];
      candidates.push(outs[0]);
    }
    node.outs = outs;
    node.candidates = candidates;
    return outs;
  }

  /** Keep two cards ahead of the current one, so the next swipe has something to show. */
  ensureAhead() {
    while (this.trail.length <= this.cur + 2) {
      const last = this.trail.length - 1;
      const outs = this.trail[last].outs ?? this.computeOuts(last);
      this.trail.push(this.nodeFor(outs[0], outs, 0, this.trail[last], last + 1));
    }
  }

  /** Move to card `k` (back along the trail or forward into the feed). */
  go(k: number): number {
    this.cur = Math.max(0, Math.min(k, this.trail.length - 1));
    this.maxSeen = Math.max(this.maxSeen, this.cur);
    this.ensureAhead();
    return this.cur;
  }

  /** The other ways out of the previous card, either side of the current one. */
  siblings(): { left: ThreadNode | null; right: ThreadNode | null } {
    const n = this.current;
    const len = n.alts.length;
    if (len < 2) return { left: null, right: null };
    return { left: this.nodeAt(this.cur, (n.alt - 1 + len) % len), right: this.nodeAt(this.cur, (n.alt + 1) % len) };
  }

  /** Swap the current card for the next (dir 1) or previous (-1) way out of the card before. */
  branch(dir: 1 | -1): ThreadNode | null {
    const n = this.current;
    const len = n.alts.length;
    if (len < 2) return null;
    const next = this.nodeAt(this.cur, (n.alt + dir + len) % len);
    next.outs = next.candidates = null;
    this.trail.length = this.cur;
    this.trail.push(next);
    this.maxSeen = this.cur;
    this.ensureAhead();
    return next;
  }

  /** Make `hop` the next card after the current one (from the details panel). Call go(cur + 1) after. */
  setNext(hop: Hop): ThreadNode {
    const outs = this.current.outs ?? this.computeOuts(this.cur);
    let j = outs.findIndex(e => e.kind === hop.kind && e.i === hop.i && (e.vid?.[0] ?? null) === (hop.vid?.[0] ?? null));
    if (j < 0) {
      outs.push(hop);
      j = outs.length - 1;
    }
    this.trail.length = this.cur + 1;
    const n = this.nodeAt(this.cur + 1, j);
    n.outs = n.candidates = null;
    this.trail.push(n);
    this.maxSeen = this.cur;
    return n;
  }

  /** A hop from the current card to any artist or record, with the best reason we can find. */
  connectFromCurrent(kind: HopKind, i: number): Hop {
    const outs = this.current.outs ?? this.computeOuts(this.cur);
    return outs.find(e => e.kind === kind && e.i === i && !e.vid) ?? this.current.candidates?.find(e => e.kind === kind && e.i === i && !e.vid) ?? connect(this.d, this.ix, this.current, kind, i);
  }

  markSeen(n: ThreadNode) {
    this.seen.add(nodeKey(n));
    this.usedText.add(n.via.text);
  }

  /** Slugs of the trail so far, for `?trail=`. */
  slugs(): string[] {
    return this.trail.slice(0, this.maxSeen + 1).map(n => (n.kind === 'a' ? this.d.artists[n.i] : this.d.albums[n.i]).slug);
  }

  /** The URL search for this trail: `trail=a,b,c&r=seed` (commas left readable). */
  search(): string {
    return `trail=${this.slugs().map(encodeURIComponent).join(',')}&r=${encodeURIComponent(this.seed)}`;
  }
}
