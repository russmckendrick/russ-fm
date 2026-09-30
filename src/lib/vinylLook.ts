import config from '@/config/vinyl-colours.json';
import { luminance } from '@/lib/sleeveColour';

/**
 * How a coloured pressing looks on the disc.
 *
 * Discogs gives a pressing's colour as free text ("Red Smoke", "Clear w/ Red
 * Splatter", "Yellow And Black Marble [Memphis Dust]"); the scrapper lifts it
 * into `vinyl_colours` and this turns one such string into disc styling:
 *
 * - `body` is the disc itself: solid, translucent (the sleeve or page shows
 *   through) or clear glass.
 * - `pattern` is extra image layers for marble, splatter, split, smoke,
 *   rainbow and metallic sheen. It sits on the grooves layer, so it turns
 *   with the record.
 *
 * Patterns are seeded from the text, so the same record always looks the same.
 * Anything not recognised returns null and the disc stays black.
 */
export interface VinylLook {
  body: string;
  pattern?: string;
  /** Groove ink: dark on light bodies, light on dark ones. */
  groove: string;
  /** The 1px edge round the disc. */
  rim: string;
}

// Every word list below lives in src/config/vinyl-colours.json, shared with the scrapper (which
// decides what Discogs text counts as a colour); this file only decides how a colour looks.
const COLOURS = config.colours as Record<string, string>;
const PHRASES = config.phrases as Record<string, string>;
const SHADES = config.shades as Record<string, number>;
const METALLIC = new Set<string>(config.metallic);
/** Colours that only mean "see-through glass". */
const GLASS = new Set<string>(config.glass);
const TRANSLUCENT = new Set<string>(config.translucent);
/** "Flame" has no fixed colour, so it is made up: splatter in flame colours over a fiery base. */
const FLAME = new Set<string>(config.flame.words);
const GENERIC = config.generic.map(pattern => new RegExp(pattern));
/** The mix drawn when a pressing is coloured but Discogs does not say which colours ("Coloured", "Eco-Mix"). */
const MIXED = config.mixed.accents;
const MIX_BASE = config.mixed.base;
const BLACK = COLOURS[config.standard];
const CLEAR = 'clear';

type Pattern = 'marble' | 'swirl' | 'splatter' | 'flake' | 'split' | 'smoke' | 'rainbow';

/** Pattern words are matched by prefix ("marbl" covers marble, marbled and marbling). */
const PATTERNS = (Object.entries(config.patterns) as Array<[Pattern, string[]]>).map(
  ([name, prefixes]) => [name, new RegExp(`^(${prefixes.join('|')})`)] as const,
);

function patternOf(word: string): Pattern | null {
  return PATTERNS.find(([, re]) => re.test(word))?.[0] ?? null;
}

interface Parsed {
  colours: string[];
  translucent: boolean;
  metallic: boolean;
  /** Says it is coloured without saying how ("Coloured", "Tri-Color", "Multi-Coloured"). */
  generic: boolean;
  /** "Flame", "Flaming": splatter in flame colours. */
  flame: boolean;
  pattern: Pattern | null;
}

function parseText(text: string): Parsed {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out: Parsed = { colours: [], translucent: false, metallic: false, generic: false, flame: false, pattern: null };
  // "Light" / "Dark" shade the next colour named.
  let shade = 0;
  const push = (hex: string) => {
    out.colours.push(shade ? mix(hex, shade > 0 ? '#ffffff' : '#000000', Math.abs(shade)) : hex);
    shade = 0;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const pair = `${w} ${words[i + 1] ?? ''}`;
    if (PHRASES[pair]) {
      push(PHRASES[pair]);
      i++;
    } else if (w in SHADES) {
      shade = SHADES[w];
    } else if (GLASS.has(w)) {
      out.colours.push(CLEAR);
    } else if (TRANSLUCENT.has(w)) {
      out.translucent = true;
    } else if (FLAME.has(w)) {
      out.flame = true;
    } else if (COLOURS[w]) {
      push(COLOURS[w]);
      out.metallic ||= METALLIC.has(w);
    } else {
      const pattern = patternOf(w);
      if (pattern === 'rainbow') out.pattern = 'rainbow';
      else if (pattern) out.pattern ??= pattern;
      else if (GENERIC.some(re => re.test(w))) out.generic = true;
    }
  }
  return out;
}

const SHADE_BRACKET = new RegExp(`^(.*?)\\s*[[(](${Object.keys(SHADES).join('|')})[\\])]`, 'i');
const FINISH_BRACKET = new RegExp(`[[(][^\\])]*\\b(${[...TRANSLUCENT].join('|')})\\b`, 'i');

/** The text's own colours; a bracketed nickname only counts when nothing outside it does. */
function parse(raw: string): Parsed {
  // "Blue [Light]" is light blue.
  const text = raw.replace(SHADE_BRACKET, '$2 $1');
  const outside = parseText(text.replace(/\[[^\]]*\]|\([^)]*\)/g, ' '));
  if (outside.colours.length) {
    // "Emerald [Translucent]": the bracket still says how it is finished.
    if (FINISH_BRACKET.test(text)) outside.translucent = true;
    return outside;
  }
  const whole = parseText(text);
  return whole.colours.length ? whole : outside;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(hex: string, other: string, amount: number): string {
  const a = channels(hex);
  const b = channels(other);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Small seeded generator, so a record's pattern never changes between renders. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/** Soft blobs of the accent colours. */
function marble(accents: string[], rnd: () => number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const rx = 18 + rnd() * 22;
    const ry = 8 + rnd() * 16;
    const x = 15 + rnd() * 70;
    const y = 15 + rnd() * 70;
    return `radial-gradient(ellipse ${pct(rx)} ${pct(ry)} at ${pct(x)} ${pct(y)}, ${rgba(accents[i % accents.length], 0.85)}, transparent 72%)`;
  }).join(', ');
}

const num = (n: number) => n.toFixed(1);

/**
 * Swirl: flowing bands of the accent colours, not blobs. Concentric rings round the
 * label are bent by low-frequency noise (`feDisplacementMap`), which drags them into the
 * curling, streaky swirls of real swirl vinyl, with a soft edge where the colours meet.
 * Drawn as an SVG so it stays one background layer that turns with the disc.
 */
function swirl(accents: string[], rnd: () => number): string {
  const rings: string[] = [];
  for (let i = 0, r = 17; r < 54; i++) {
    const width = 0.5 + rnd() * 1.5;
    rings.push(`<circle cx="50" cy="50" r="${num(r)}" fill="none" stroke="${accents[i % accents.length]}" stroke-opacity="0.5" stroke-width="${num(width)}"/>`);
    r += width + 1.4 + rnd() * 4.2;
  }
  const seed = Math.floor(rnd() * 900) + 1;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    '<filter id="w" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" color-interpolation-filters="sRGB">' +
    `<feTurbulence type="fractalNoise" baseFrequency="0.022 0.036" numOctaves="3" seed="${seed}" result="t"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="t" scale="32" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
    '<feGaussianBlur in="d" stdDeviation="0.8"/>' +
    `</filter><g filter="url(#w)">${rings.join('')}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Splatter as it is really made: paint thrown out from the centre, so each mark
 * is a streak running along a radius. It tapers from a hairline tail under the
 * label to a wider head, with a darker blob at the outer end. Marks come in
 * bursts (a few directions, with some strays) and thin out toward the rim.
 * Drawn as an SVG (with a soft edge) so it stays one background layer that
 * turns with the disc.
 */
function splatter(accents: string[], rnd: () => number): string {
  const bursts = Array.from({ length: 9 }, () => rnd() * Math.PI * 2);
  const marks = Array.from({ length: 96 }, (_, i) => {
    const colour = accents[i % accents.length];
    const angle = rnd() < 0.2 ? rnd() * Math.PI * 2 : bursts[Math.floor(rnd() * bursts.length)] + (rnd() - 0.5) * 0.55;
    const head = 21 + 27 * rnd() ** 1.35;
    const tail = 15 + rnd() * 5;
    const half = 0.55 + rnd() * 0.95;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // A wedge from radius `from` (half-width `w0`) to `head` (half-width `half`).
    const wedge = (from: number, w0: number, opacity: number) => {
      const p = (r: number, w: number) => `${num(50 + cos * r - sin * w)} ${num(50 + sin * r + cos * w)}`;
      return `<path d="M${p(from, -w0)}L${p(head, -half)}L${p(head, half)}L${p(from, w0)}Z" fill="${colour}" fill-opacity="${opacity}"/>`;
    };
    const mid = tail + (head - tail) * 0.45;
    return (
      wedge(tail, 0.12, 0.45) +
      wedge(mid, half * 0.4, 0.5) +
      `<circle cx="${num(50 + cos * head)}" cy="${num(50 + sin * head)}" r="${num(half * 1.15)}" fill="${mix(colour, '#000000', 0.22)}"/>`
    );
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    '<filter id="s"><feGaussianBlur stdDeviation=".3"/></filter>' +
    `<g filter="url(#s)">${marks.join('')}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Sparkle: small flecks of silver, not dots. Fine noise thresholded down to sparse,
 * irregular specks (`feTurbulence`), in two layers: many dim flecks, and a few
 * brighter glints. The size is set by the noise frequency, in the SVG's own units,
 * so the flecks scale with the record. Drawn as an SVG so it stays one background
 * layer that turns with the disc.
 */
function flakes(rnd: () => number): string {
  const layer = (id: string, seed: number, frequency: number, gain: number, cutoff: number, colour: string) => {
    const [r, g, b] = channels(colour).map(v => (v / 255).toFixed(3));
    return (
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="${seed}"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${gain} 0 0 0 ${-cutoff}"/>` +
      `</filter><rect width="100" height="100" filter="url(#${id})"/>`
    );
  };
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    // Cutoffs tuned by measuring coverage: about 0.6% of the disc for the flecks, 0.1% for the glints.
    layer('a', Math.floor(rnd() * 900) + 1, 5.5, 34, 26.2, config.flake.fleck) +
    layer('b', Math.floor(rnd() * 900) + 1, 5.5, 60, 49.5, config.flake.glint) +
    '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/** Dark wisps through a coloured or clear disc. */
function smoke(rnd: () => number): string {
  return Array.from({ length: 4 }, () => {
    const rx = 22 + rnd() * 20;
    const ry = 10 + rnd() * 16;
    return `radial-gradient(ellipse ${pct(rx)} ${pct(ry)} at ${pct(15 + rnd() * 70)} ${pct(15 + rnd() * 70)}, rgba(0, 0, 0, 0.42), transparent 75%)`;
  }).join(', ');
}

const SHEEN =
  'conic-gradient(from 20deg, rgba(255, 255, 255, 0.35), transparent 18%, rgba(0, 0, 0, 0.18) 40%, rgba(255, 255, 255, 0.3) 62%, transparent 80%, rgba(255, 255, 255, 0.35))';
const RAINBOW = 'conic-gradient(from 0deg, #e5322d, #f28b1e, #f2d21f, #3aa655, #2f6fd0, #7a3fb0, #e5322d)';

const GLASS_BODY = 'radial-gradient(circle, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.15) 70%, rgba(255, 255, 255, 0.34) 100%)';
const GLASS_RIM = 'rgba(255, 255, 255, 0.4)';
const GLASS_GROOVE = 'rgba(255, 255, 255, 0.14)';
const DARK_GROOVE = 'rgba(0, 0, 0, 0.1)';
const LIGHT_GROOVE = 'rgba(255, 255, 255, 0.045)';

function solidBody(hex: string): string {
  return `radial-gradient(circle, ${hex} 0 90%, ${mix(hex, '#000000', 0.3)} 100%)`;
}

function translucentBody(hex: string): string {
  return `radial-gradient(circle, ${rgba(hex, 0.8)} 0 60%, ${rgba(hex, 0.92)} 100%)`;
}

/**
 * The disc look for one pressing colour (one entry of `vinyl_colours`), or null
 * when the text names nothing recognisable or is just black.
 */
export function vinylLook(text: string | null | undefined): VinylLook | null {
  if (!text?.trim()) return null;
  let look = cache.get(text);
  if (look === undefined) {
    look = buildLook(text);
    cache.set(text, look);
  }
  return look;
}

/** Looks are built once per colour text: a splatter is an SVG, and the same few hundred strings repeat all over the site. */
const cache = new Map<string, VinylLook | null>();

function buildLook(text: string): VinylLook | null {
  const p = parse(text);
  const named = p.colours.filter(c => c !== CLEAR);
  // "Transparent" on its own is clear glass.
  const clear = p.colours.includes(CLEAR) || (!named.length && p.translucent);

  if (p.pattern === 'rainbow') {
    return { body: 'transparent', pattern: RAINBOW, groove: DARK_GROOVE, rim: '#000' };
  }
  // Coloured, but not saying which colours ("Coloured", "Eco-Mix", "Splatter"): drawn as a mix.
  const unspecified = !named.length && !clear;
  if (unspecified && !p.pattern && !p.generic && !p.flame) return null;
  if (named.length && !clear && !p.pattern && !p.generic && !p.flame && !p.translucent && named.every(c => c === BLACK)) return null;

  let base: string;
  let accents: string[];
  let glass: boolean;
  let translucent: boolean;
  if (unspecified) {
    const smoky = p.pattern === 'smoke';
    // "Sparkle" alone is black with silver flakes.
    const flaky = p.pattern === 'flake';
    glass = p.pattern === 'splatter';
    base = glass ? CLEAR : smoky ? COLOURS.grey : flaky ? BLACK : p.flame ? config.flame.base : MIX_BASE;
    accents = p.flame ? config.flame.accents : smoky || flaky ? [] : MIXED;
    translucent = glass || smoky;
  } else {
    // "Clear Blue" is blue glass; "Clear w/ Red Splatter" is clear glass with red on it.
    const tinted = clear && named.length === 1 && !p.pattern;
    glass = clear && !tinted;
    base = glass ? CLEAR : named[0];
    translucent = glass || tinted || p.translucent || p.pattern === 'smoke';
    accents = glass ? named : named.slice(1);
  }
  // "Yellow Flame" is yellow with flame-coloured streaks over it.
  if (p.flame) accents = config.flame.accents;
  const pattern: Pattern | null = p.pattern ?? (p.flame ? 'splatter' : accents.length ? 'marble' : null);
  if (pattern && pattern !== 'smoke' && pattern !== 'flake' && !accents.length) {
    const ref = glass ? '#8b8f94' : base;
    accents = [mix(ref, '#ffffff', 0.4), mix(ref, '#000000', 0.4)];
  }

  const rnd = seeded(text);
  const layers: string[] = [];
  if (pattern === 'marble') layers.push(marble(accents, rnd));
  if (pattern === 'swirl') layers.push(swirl(accents, rnd));
  if (pattern === 'splatter') layers.push(splatter(accents, rnd));
  if (pattern === 'flake') layers.push(flakes(rnd));
  if (pattern === 'smoke') layers.push(smoke(rnd));
  if (pattern === 'split') {
    const half = base === CLEAR ? accents[0] : base;
    const other = base === CLEAR ? undefined : accents[0];
    layers.push(`linear-gradient(90deg, ${other ?? 'transparent'} 0 50%, ${translucent ? rgba(half, 0.8) : half} 50% 100%)`);
  }
  if (p.metallic && !glass) layers.push(SHEEN);

  const body = glass ? GLASS_BODY : translucent ? translucentBody(base) : solidBody(base);
  const light = !glass && luminance(base) > 0.45;
  return {
    body,
    pattern: layers.length ? layers.join(', ') : undefined,
    groove: glass ? GLASS_GROOVE : light ? DARK_GROOVE : LIGHT_GROOVE,
    rim: glass || translucent ? GLASS_RIM : '#000',
  };
}

/**
 * The look for a given disc of a set. One colour covers every disc; several
 * are taken as one per disc, the last carrying on for any extra discs.
 */
export function discLook(colours: string[] | null | undefined, disc: number): VinylLook | null {
  if (!colours?.length) return null;
  return vinylLook(colours[Math.min(disc, colours.length - 1)]);
}

/** The parts of an album JSON `format_details` entry that decide a disc's colour. */
export interface FormatDetail {
  name: string;
  qty?: string;
  descriptions?: string[];
  text?: string | null;
  colour?: string | null;
}

/** The number of discs in one format entry (at least one). */
export function entryQty(entry: Pick<FormatDetail, 'qty'>): number {
  return Math.max(1, parseInt(entry.qty ?? '1', 10) || 1);
}

const DISC_PART = /^\s*Disc\s*\d+\s*:?\s*(.+?)\s*$/i;

/**
 * Per-disc colours written into one entry's text, "Disc 1 White, Disc 2 Black",
 * when there is one part per disc; otherwise null. (The scrapper folds these into a
 * single colour such as "Disc White", so the site splits them itself.)
 */
export function splitDiscText(text: string | null | undefined, qty: number): string[] | null {
  if (!text || qty < 2) return null;
  const parts = text.split(/[,;]/).map(part => DISC_PART.exec(part)?.[1]).filter((c): c is string => !!c);
  return parts.length === qty ? parts : null;
}

/** The colour of each disc in one format entry: its per-disc colours when the text gives them, else its colour for every disc. */
export function entryDiscColours(entry: FormatDetail): Array<string | null> {
  const qty = entryQty(entry);
  return splitDiscText(entry.text, qty) ?? Array.from({ length: qty }, () => entry.colour ?? null);
}

/**
 * The colour of each disc of a pressing, in order (null for a black disc). Each
 * Vinyl entry of `format_details` is one disc set, so `qty` gives the discs and
 * `colour` their colour. Without details (the collection index) it is one disc
 * per entry of `vinyl_colours`. Empty when no disc is coloured, so black sets
 * keep their single record.
 */
export function pressingDiscs(details: FormatDetail[] | null | undefined, colours: string[] | null | undefined): Array<string | null> {
  const vinyl = (details ?? []).filter(d => d.name === 'Vinyl');
  const discs = vinyl.length ? vinyl.flatMap(entryDiscColours) : (colours ?? []);
  return discs.some(Boolean) ? discs : [];
}

/** The look of each disc from `pressingDiscs` (null for black or unrecognised). */
export function discLooks(discs: Array<string | null | undefined> | null | undefined): Array<VinylLook | null> {
  return (discs ?? []).map(vinylLook);
}

/** The look of disc `disc` from `discLooks`; a set with fewer entries carries its last one on. */
export function lookAt(looks: Array<VinylLook | null>, disc: number): VinylLook | null {
  return looks.length ? looks[Math.min(disc, looks.length - 1)] : null;
}

/**
 * What a format's free text says besides its colour: "Red Smoke, 180 Gram" gives
 * ["180 Gram"], "Gatefold, 180g" (no colour) gives both, and "Yellow, Transparent"
 * (colour "Yellow Transparent") gives none.
 */
export function pressingExtras(text: string | null | undefined, colour: string | null | undefined): string[] {
  if (!text) return [];
  const have = (colour ?? '').toLowerCase();
  return text
    .split(/[,;]|\s-\s/)
    .map(part => part.trim())
    .filter(part => part && !(have && have.includes(part.toLowerCase())));
}

/** The colour families a pressing is filtered by, with a representative colour (or gradient) for each chip's dot. */
export const COLOUR_FAMILIES: Array<{ name: string; colour: string }> = config.families;

/** The patterns a pressing is filtered by. */
export const PATTERN_TAGS: string[] = [...new Set(Object.values(config.patternTags))];

/** The hue family of a colour, or null when it is a near-black. */
function familyOf(hex: string): string | null {
  const [r, g, b] = channels(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.12) return null;
  if (s < 0.2) return l > 0.8 ? 'White' : 'Grey';
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // Cream, bone and ivory: very light with little chroma (HSL saturation overstates it there).
  if (l > 0.8 && d < 0.22) return 'White';
  if (h < 45 && l < 0.34) return 'Brown';
  if (h < 15 || h >= 345) return 'Red';
  if (h < 42) return 'Orange';
  if (h < 70) return 'Yellow';
  if (h < 165) return 'Green';
  if (h < 262) return 'Blue';
  if (h < 300) return 'Purple';
  return 'Pink';
}

/**
 * The filter tags for one pressing colour: its colour families (Clear, Red, Blue…),
 * plus Gold & silver, Rainbow and its pattern (Splatter, Marbled, Split). "Clear
 * With Red Splatter" is Clear, Red and Splatter. Plain black has none.
 */
export function colourTags(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const p = parse(text);
  const named = p.colours.filter(c => c !== CLEAR);
  const tags = new Set<string>();
  if (p.colours.includes(CLEAR) || (!named.length && p.translucent)) tags.add('Clear');
  const metal = new Set(config.metalTags.map(k => COLOURS[k]));
  for (const hex of named) {
    if (metal.has(hex)) tags.add('Gold & silver');
    else {
      const family = familyOf(hex);
      if (family) tags.add(family);
    }
  }
  if (p.pattern === 'rainbow') tags.add('Rainbow');
  if (p.flame) {
    tags.add('Orange');
    tags.add('Red');
  }
  if (!named.length && !tags.has('Clear') && p.generic) tags.add('Multicolour');
  const patternTags = config.patternTags as Record<string, string>;
  if (p.flame && !p.pattern) tags.add(patternTags.splatter);
  if (p.pattern && patternTags[p.pattern]) tags.add(patternTags[p.pattern]);
  else if (p.pattern === null && named.length > 1) tags.add(patternTags.marble);
  return [...tags];
}

/** Notes Discogs puts in a format's text that say nothing about colour. */
const KNOWN_NOTE = new RegExp(config.knownNotes, 'i');

/**
 * How a vinyl entry reads in a list: its colour when there is one; otherwise the
 * text Discogs gave that is not a known note (so an unrecognised "Flame Vinyl" is
 * shown as written, not called black); otherwise "Black". `extras` is the rest.
 */
export function pressingTitle(
  text: string | null | undefined,
  colour: string | null | undefined,
  qty = 1,
): { title: string; extras: string[] } {
  // "Disc 1 White, Disc 2 Black" reads "White / Black".
  const perDisc = splitDiscText(text, qty);
  if (perDisc) {
    return { title: perDisc.join(' / '), extras: pressingExtras(text, null).filter(part => !DISC_PART.test(part)) };
  }
  if (colour) return { title: colour, extras: pressingExtras(text, colour) };
  const parts = pressingExtras(text, null);
  const unknown = parts.filter(part => !KNOWN_NOTE.test(part));
  return { title: unknown.length ? unknown.join(', ') : 'Black', extras: parts.filter(part => KNOWN_NOTE.test(part)) };
}
