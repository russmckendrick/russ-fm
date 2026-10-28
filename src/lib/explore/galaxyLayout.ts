/**
 * The Galaxy's data preparation and the pure maths behind its interactions:
 * each artist's family, star size and colour, the kind of light trail for
 * each link, nebula centres, orbit rings for the focused artist's records,
 * pinning off-screen labels to the screen edge, and the hop path. No Three.js
 * here, so the page can use it without loading the scene.
 */
import type { VinylLook } from '@/lib/vinylLook';
import { describeLink, reasonWeight, sortReasons } from './data';
import type { ForceJob } from './galaxyForce';
import type { ExploreData, ExploreLink, LinkReason } from './types';

export type RGB = [number, number, number];

// ---- colour -----------------------------------------------------------------------

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const x = ((t % 1) + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

// ---- trails -----------------------------------------------------------------------

/** The kinds of light trail, strongest first. `alpha` is how bright the trail is before anyone is focused. */
export const TRAIL_KINDS = [
  { key: 'member', label: 'Member or group', colour: '#A9C1EC', alpha: 0.2 },
  { key: 'bandmate', label: 'Shared member', colour: '#F2A93B', alpha: 0.2 },
  { key: 'guest', label: 'Guest spot', colour: '#E07F98', alpha: 0.2 },
  { key: 'credit', label: 'Credited on a record', colour: '#62D0B0', alpha: 0.15 },
  { key: 'shared', label: 'Shared credit', colour: '#A89BE0', alpha: 0.01, note: 'The same producer, player, writer, engineer or designer on both artists’ records' },
] as const;
export type TrailKind = 0 | 1 | 2 | 3 | 4;

export function reasonKind(why: LinkReason): TrailKind {
  switch (why.type) {
    case 'member':
    case 'group':
    case 'alias':
      return 0;
    case 'bandmate':
      return 1;
    case 'guest':
      return 2;
    case 'credit':
      return 3;
    case 'shared-credit':
      return 4;
  }
}

/** A link's trail kind: that of its strongest reason. */
export const linkKind = (link: ExploreLink): TrailKind => reasonKind(sortReasons(link.why)[0]);

/** How hard a link pulls its two artists together in the layout, 0–1.3. */
export function linkStrength(link: ExploreLink): number {
  const top = Math.max(...link.why.map(reasonWeight));
  return (top / 6) * Math.min(1.3, 1 + 0.08 * (link.why.length - 1));
}

// ---- preparation --------------------------------------------------------------------

export interface GalaxyPrep {
  n: number;
  /** Artists left off the map: "Various" and anyone with no records. */
  hidden: Uint8Array;
  visible: number;
  /** Family index per artist: the family most of their records are filed in. */
  fam: Uint8Array;
  /** Star radius in world units, by record count. */
  size: Float32Array;
  /** Glow colour per artist (r, g, b, 0–1): their sleeves' average, lifted. */
  colour: Float32Array;
  famCount: number[];
  famColour: RGB[];
  /** Links between visible artists, their trail kind and layout strength. */
  links: ExploreLink[];
  kind: Uint8Array;
  strength: Float32Array;
  /** Artist index -> indexes into `links`. */
  linksOf: number[][];
  centres: [number, number, number][];
  radii: number[];
}

export const starSize = (records: number) => (records ? Math.min(21, 2.4 + 2.3 * Math.sqrt(records)) : 0);

/** Nebula centres along one spiral arm, in family order (neighbouring families sit next to each other). */
export function familyCentres(count: number): [number, number, number][] {
  return Array.from({ length: count }, (_, k) => {
    const th = 0.3 + k * 0.72;
    const r = 600 + k * 190;
    return [Math.cos(th) * r, Math.sin(k * 1.7) * 90, Math.sin(th) * r];
  });
}

export const familyRadius = (artists: number) => 50 + 30 * Math.cbrt(artists);

export function prepareGalaxy(d: ExploreData): GalaxyPrep {
  const n = d.artists.length;
  const NF = d.families.length;
  const famIdx = new Map(d.families.map((f, i) => [f.key, i]));
  const hidden = new Uint8Array(n);
  const fam = new Uint8Array(n);
  const size = new Float32Array(n);
  const colour = new Float32Array(n * 3);
  const famCount = new Array<number>(NF).fill(0);
  d.artists.forEach((a, i) => {
    if (a.slug === 'various' || !a.records.length) hidden[i] = 1;
    const count = new Array<number>(NF).fill(0);
    let r = 0;
    let g = 0;
    let b = 0;
    for (const ri of a.records) {
      const al = d.albums[ri];
      const k = famIdx.get(al.fam);
      if (k != null) count[k]++;
      const c = hexToRgb(al.fl);
      r += c[0];
      g += c[1];
      b += c[2];
    }
    let best = famIdx.get(d.albums[a.records[0]]?.fam ?? '') ?? 0;
    count.forEach((c, k) => {
      if (c > count[best]) best = k;
    });
    fam[i] = best;
    if (!hidden[i]) famCount[best]++;
    const m = Math.max(1, a.records.length);
    const [h, s, l] = rgbToHsl([r / m, g / m, b / m]);
    const lifted = hslToRgb(h, Math.min(0.92, s * 1.45 + 0.12), Math.min(0.7, Math.max(0.52, l)));
    colour.set(lifted, i * 3);
    size[i] = hidden[i] ? 0 : starSize(a.records.length);
  });

  // A family's colour: the average hue of its more colourful sleeves.
  const famColour = d.families.map(f => {
    let x = 0;
    let y = 0;
    for (const al of d.albums) {
      if (al.fam !== f.key) continue;
      const [h, s, l] = rgbToHsl(hexToRgb(al.fl));
      const w = s * (1 - Math.abs(l - 0.5) * 2);
      x += Math.cos(h * Math.PI * 2) * w;
      y += Math.sin(h * Math.PI * 2) * w;
    }
    const h = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    return hslToRgb(h, 0.5, 0.64);
  });

  const links = d.links.filter(l => !hidden[l.a] && !hidden[l.b]);
  const kind = Uint8Array.from(links, linkKind);
  const strength = Float32Array.from(links, linkStrength);
  const linksOf: number[][] = d.artists.map(() => []);
  links.forEach((l, k) => {
    linksOf[l.a].push(k);
    linksOf[l.b].push(k);
  });
  return {
    n,
    hidden,
    visible: n - hidden.reduce((s, v) => s + v, 0),
    fam,
    size,
    colour,
    famCount,
    famColour,
    links,
    kind,
    strength,
    linksOf,
    centres: familyCentres(NF),
    radii: famCount.map(familyRadius),
  };
}

/**
 * The layout job. Springs are weakened for well-connected artists (by the
 * smaller end's degree, as d3-force does) and for shared credits, which far
 * outnumber band links and would otherwise pull every nebula into one blob.
 */
export function forceJob(p: GalaxyPrep, iters = 320): ForceJob {
  const ends = new Int32Array(p.links.length * 2);
  const strength = new Float32Array(p.links.length);
  p.links.forEach((l, k) => {
    ends[k * 2] = l.a;
    ends[k * 2 + 1] = l.b;
    const deg = Math.min(p.linksOf[l.a].length, p.linksOf[l.b].length);
    strength[k] = (p.strength[k] * (p.kind[k] === 4 ? 0.25 : 1)) / Math.sqrt(Math.max(1, deg));
  });
  return { n: p.n, fam: p.fam, size: p.size, hidden: p.hidden, links: ends, strength, centres: p.centres, radii: p.radii, iters };
}

/**
 * The texture window for an artist's medium photo: the avatar's square
 * (`crop`, fractions of the photo, cut round the faces) or, without one, the
 * centre square for the photo's real aspect. [u, v, width, height], v from the top.
 */
export function cropWindow(crop: [number, number, number, number] | null | undefined, aspect: number): [number, number, number, number] {
  if (crop && crop[2] > 0 && crop[3] > 0) return [crop[0], crop[1], crop[2], crop[3]];
  if (!(aspect > 0) || Math.abs(aspect - 1) < 1e-3) return [0, 0, 1, 1];
  return aspect > 1 ? [(1 - 1 / aspect) / 2, 0, 1 / aspect, 1] : [0, (1 - aspect) / 2, 1, aspect];
}

/**
 * Which stars get a sharp photo: those at least `threshold` px in radius on
 * screen, biggest first, at most `pool`. `px[i]` is the on-screen radius (0 when off screen).
 */
export function closeUps(px: ArrayLike<number>, threshold: number, pool: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < px.length; i++) if (px[i] >= threshold) out.push(i);
  return out.sort((a, b) => px[b] - px[a]).slice(0, pool);
}

/** localStorage key for a cached layout: changes whenever the data is rebuilt. */
export const layoutCacheKey = (d: Pick<ExploreData, 'generated' | 'artists' | 'links' | 'albums'>) =>
  `russfm:galaxy-layout:v2:${d.generated}:${d.artists.length}:${d.links.length}:${d.albums.length}`;

export const otherEnd = (link: ExploreLink, i: number) => (link.a === i ? link.b : link.a);

/** The link between artists a and b, as an index into prep.links, or -1. */
export function linkBetween(p: GalaxyPrep, a: number, b: number): number {
  return p.linksOf[a]?.find(k => otherEnd(p.links[k], a) === b) ?? -1;
}

/** The hop path after visiting i: going back to an artist already on it cuts the path there. */
export function pathAfterVisit(path: number[], i: number, max = 12): number[] {
  const at = path.indexOf(i);
  if (at >= 0) return path.slice(0, at + 1);
  return [...path, i].slice(-max);
}

const norm = (s: string | null | undefined) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the\s+/, '')
    .trim();

/** Artists whose names contain the query, names that start with it first, then by records held. */
export function searchArtists(d: ExploreData, p: GalaxyPrep, query: string, limit = 8): number[] {
  const q = norm(query);
  if (!q) return [];
  const hits: { i: number; starts: boolean }[] = [];
  d.artists.forEach((a, i) => {
    if (p.hidden[i]) return;
    const n = norm(a.name);
    if (n.includes(q)) hits.push({ i, starts: n.startsWith(q) });
  });
  hits.sort((x, y) => Number(y.starts) - Number(x.starts) || d.artists[y.i].records.length - d.artists[x.i].records.length);
  return hits.slice(0, limit).map(h => h.i);
}

/** Plain sentences for why two artists connect, strongest first, one per person. */
export function reasonLines(d: ExploreData, why: LinkReason[], from: number, to: number, max = 2): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of sortReasons(why)) {
    let key: string;
    if (w.type === 'member' || w.type === 'bandmate' || w.type === 'credit' || w.type === 'shared-credit') key = `p:${norm(w.who)}`;
    else if (w.type === 'group') key = `p:${norm(d.artists[w.from]?.name)}`;
    else if (w.type === 'alias') key = 'alias';
    else key = `g:${w.album}:${w.track}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      out.push(describeLink(d, w, from, to));
    } catch {
      // a reason pointing at something missing: leave it out
    }
    if (out.length >= max) break;
  }
  return out;
}

export interface Connection {
  other: number;
  link: number;
  kind: TrailKind;
  lines: string[];
}

/** An artist's connections grouped by trail kind, strongest first, names A–Z within a kind. */
export function connectionGroups(d: ExploreData, p: GalaxyPrep, i: number): { kind: TrailKind; items: Connection[] }[] {
  const byKind = new Map<TrailKind, Connection[]>();
  for (const k of p.linksOf[i] ?? []) {
    const link = p.links[k];
    const other = otherEnd(link, i);
    const kind = p.kind[k] as TrailKind;
    const item = { other, link: k, kind, lines: reasonLines(d, link.why, i, other) };
    const list = byKind.get(kind);
    if (list) list.push(item);
    else byKind.set(kind, [item]);
  }
  return [...byKind.entries()]
    .sort(([a], [b]) => a - b)
    .map(([kind, items]) => ({ kind, items: items.sort((x, y) => d.artists[x.other].name.localeCompare(d.artists[y.other].name)) }));
}

/** The connections worth a label on the map, strongest first. */
export function labelledConnections(p: GalaxyPrep, i: number, max: number): number[] {
  return [...(p.linksOf[i] ?? [])].sort((x, y) => p.kind[x] - p.kind[y] || p.strength[y] - p.strength[x]).slice(0, max);
}

/** The record whose colours lead an artist's panel and the nav: the most vivid one. */
export function leadRecord(d: ExploreData, i: number): number | null {
  const recs = d.artists[i]?.records ?? [];
  if (!recs.length) return null;
  return recs.reduce((best, r) => (d.albums[r].viv > d.albums[best].viv ? r : best), recs[0]);
}

// ---- orbit and camera ---------------------------------------------------------------------

export interface OrbitRing {
  R: number;
  m: number;
  start: number;
}

/** Rings of record discs round a star of radius `star`: as many per ring as fit, outer rings wider. */
export function orbitRings(count: number, star: number): { disc: number; rings: OrbitRing[]; outer: number } {
  const disc = Math.max(2.4, (star * 0.4 + 1.6) * (count > 18 ? 0.8 : 1));
  const rings: OrbitRing[] = [];
  const r0 = star * 1.8 + disc * 2.3;
  let placed = 0;
  for (let k = 0; placed < count; k++) {
    const R = r0 + k * disc * 3.1;
    const cap = Math.max(6, Math.floor((Math.PI * 2 * R) / (disc * 2.5)));
    const m = Math.min(cap, count - placed);
    rings.push({ R, m, start: placed });
    placed += m;
  }
  const outer = rings.length ? rings[rings.length - 1].R + disc : star * 2;
  return { disc, rings, outer };
}

/**
 * How far the camera sits from a focused artist: far enough for the record
 * rings, and back a little more when their nearest links are further out,
 * but never so far the discs become dots (at most 5 × the rings).
 */
export function focusDistance(outer: number, linkDistances: number[], tall: boolean): number {
  const near = [...linkDistances].sort((a, b) => a - b);
  const q = near.length ? near[Math.floor(near.length * 0.3)] : 0;
  return Math.max(80, outer * 3.6, Math.min(q * 1.5, outer * 5)) * (tall ? 1.5 : 1);
}

// ---- labels on screen ------------------------------------------------------------------------

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
export type Side = 'L' | 'R' | 'T' | 'B';

/** Where a ray from (cx, cy) along (dx, dy) leaves the box, and which edge it leaves by. */
export function edgePoint(cx: number, cy: number, dx: number, dy: number, box: Box): { x: number; y: number; side: Side } {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const x0 = Math.min(box.r, Math.max(box.l, cx));
  const y0 = Math.min(box.b, Math.max(box.t, cy));
  const tx = ux > 0 ? (box.r - x0) / ux : ux < 0 ? (box.l - x0) / ux : Infinity;
  const ty = uy > 0 ? (box.b - y0) / uy : uy < 0 ? (box.t - y0) / uy : Infinity;
  const t = Math.min(tx, ty);
  const side: Side = tx <= ty ? (ux > 0 ? 'R' : 'L') : uy > 0 ? 'B' : 'T';
  return { x: x0 + ux * t, y: y0 + uy * t, side };
}

export interface Pinned {
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
  hidden?: boolean;
}

/**
 * Keep labels pinned to the same edge from piling up: clamp each inside the
 * box, push neighbours apart along the edge, and hide any pushed past the end.
 */
export function spreadPinned(items: Pinned[], box: Box, gap = 4): Pinned[] {
  for (const e of items) {
    e.x = Math.min(box.r - e.w / 2, Math.max(box.l + e.w / 2, e.x));
    e.y = Math.min(box.b - e.h / 2, Math.max(box.t + e.h / 2, e.y));
  }
  for (const side of ['L', 'R', 'T', 'B'] as const) {
    const vert = side === 'L' || side === 'R';
    const list = items.filter(e => e.side === side).sort((p, q) => (vert ? p.y - q.y : p.x - q.x));
    for (let k = 1; k < list.length; k++) {
      const p = list[k - 1];
      const q = list[k];
      if (vert && q.y - p.y < (p.h + q.h) / 2 + gap) q.y = p.y + (p.h + q.h) / 2 + gap;
      if (!vert && q.x - p.x < (p.w + q.w) / 2 + gap * 1.5) q.x = p.x + (p.w + q.w) / 2 + gap * 1.5;
    }
    for (const e of list) e.hidden = e.x + e.w / 2 > box.r + 1 || e.y + e.h / 2 > box.b + 1;
  }
  return items;
}

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Greedy de-overlap: rects in priority order, each shown only if it clears those already shown. */
export function clearOfEachOther(rects: LabelRect[], pad = 4): boolean[] {
  const shown: LabelRect[] = [];
  return rects.map(r => {
    const hit = shown.some(s => Math.abs(s.x - r.x) * 2 < s.w + r.w + pad * 2 && Math.abs(s.y - r.y) * 2 < s.h + r.h + pad * 2);
    if (!hit) shown.push(r);
    return !hit;
  });
}

// ---- vinyl discs ----------------------------------------------------------------------------

export interface DiscPaint {
  rgb: RGB;
  alpha: number;
  /** 0 plain, 1 streaked (marble, swirl, smoke…), 2 speckled (splatter, flakes). */
  pattern: 0 | 1 | 2;
  /** A second colour for the pattern, when the look names one. */
  accent: RGB | null;
}

const BLACK_DISC: RGB = [0.05, 0.05, 0.05];

/** Flat colours for a WebGL disc from the site's CSS vinyl look (src/lib/vinylLook.ts). */
export function discPaint(look: VinylLook | null): DiscPaint {
  if (!look) return { rgb: BLACK_DISC, alpha: 1, pattern: 0, accent: null };
  const hex = look.body.match(/#[0-9a-f]{6}/i);
  const rgba = look.body.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  let rgb: RGB = BLACK_DISC;
  let alpha = 1;
  if (hex) rgb = hexToRgb(hex[0]);
  else if (rgba) {
    rgb = [+rgba[1] / 255, +rgba[2] / 255, +rgba[3] / 255];
    alpha = +rgba[4];
  } else if (look.body === 'transparent') rgb = [0.75, 0.75, 0.75];
  const seeThrough = look.rim !== '#000';
  // clear glass is near-white at low alpha: give it enough body to read on the dark sky
  if (seeThrough) alpha = rgba && +rgba[1] === 255 && +rgba[2] === 255 ? 0.42 : Math.min(alpha, 0.78);
  let pattern: DiscPaint['pattern'] = 0;
  let accent: RGB | null = null;
  if (look.pattern) {
    const text = [...look.pattern.matchAll(/data:image\/svg\+xml,([^"]+)/g)]
      .map(m => {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return '';
        }
      })
      .join(' ') + look.pattern;
    pattern = /<circle|feColorMatrix/.test(text) ? 2 : 1;
    const mine = rgbToHex(rgb).toLowerCase();
    const other = [...text.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0].toLowerCase()).find(h => h !== mine && h !== '#000000' && h !== '#ffffff');
    accent = other ? hexToRgb(other) : null;
  }
  return { rgb, alpha, pattern, accent };
}
