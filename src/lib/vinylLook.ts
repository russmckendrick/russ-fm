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
 * - `pattern` is extra image layers for marble, splatter, liquid, split, smoke,
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
  /** A pale body, where cream marks drawn over the disc would vanish (dark ones read instead). */
  light?: boolean;
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
/** The mix drawn when a pressing is coloured but Discogs does not say which colours ("Coloured", "Eco-Mix"): one of the accents as the body, the rest and the cream base through it. */
const MIXED = config.mixed.accents;
const MIX_BASE = config.mixed.base;
const BLACK = COLOURS[config.standard];
const CLEAR = 'clear';

type Pattern = 'marble' | 'swirl' | 'splatter' | 'liquid' | 'flake' | 'split' | 'smoke' | 'rainbow';

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

const num = (n: number) => n.toFixed(1);

const TAU = Math.PI * 2;

/**
 * One sliver laid along the grooves: an arc of radius `r` from angle `from`
 * through `sweep` radians, drifting `drift` in or out as it goes, `width` wide
 * in the middle and tapering to a point at both ends. Marbled vinyl is
 * stretched round the disc as the puck is pressed out, so its streaks and
 * clouds mostly run this way.
 */
function arc(r: number, from: number, sweep: number, drift: number, width: number, colour: string, opacity: number): string {
  const steps = Math.max(4, Math.ceil(sweep / 0.06));
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = from + sweep * t;
    const w = (width / 2) * Math.sin(Math.PI * t) ** 0.6;
    const p = (rr: number) => `${(50 + Math.cos(a) * rr).toFixed(2)} ${(50 + Math.sin(a) * rr).toFixed(2)}`;
    left.push(p(r + drift * t - w));
    right.unshift(p(r + drift * t + w));
  }
  return `<path d="M${left.join('L')}L${right.join('L')}Z" fill="${colour}" fill-opacity="${opacity.toFixed(2)}"/>`;
}

/** One SVG background layer that turns with the disc. */
function svgLayer(filters: string, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${filters}${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Noise that drags clean arcs about (`scale`, at noise `frequency`) so they
 * bend and wander like poured colour, then a blur to soften them: a heavy one
 * melts broad strokes into clouds, a light one leaves fine streaks.
 */
function warp(id: string, seed: number, frequency: number, scale: number, blur: number): string {
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${seed}" result="t"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="${blur}"/></filter>`
  );
}

/** A colour nudged lighter (positive) or darker (negative). */
const shade = (hex: string, amount: number) => mix(hex, amount > 0 ? '#ffffff' : '#000000', Math.abs(amount));

/**
 * Marble, after real pressings: two things laid over the base, both running
 * round the disc. Clouds are broad strokes of the accent colours, bent by slow
 * noise and blurred until they melt into the base and each other (the soft
 * red and orange of a sunburst). Streaks are many short, thin strokes, bent by
 * finer noise and barely blurred: the accent colours plus lighter and darker
 * shades of the base, the fine veining through an "orange marbled" disc or the
 * dark wisps through yellow. How calm a record is (seeded, so it never
 * changes) trades one for the other: big clouds and few streaks, or busy
 * veining over faint clouds. `alpha` thins it all on clear and translucent
 * discs, and a clear disc (`base` null) gets no base shades. Drawn as an SVG
 * so it stays one background layer that turns with the disc.
 */
function marble(accents: string[], rnd: () => number, alpha: number, base: string | null): string {
  const calm = rnd();
  const pick = (from: string[]) => from[Math.floor(rnd() * from.length)];
  const clouds = Array.from({ length: 3 + Math.round(calm * 5) }, (_, i) =>
    arc(
      20 + rnd() * 29,
      rnd() * TAU,
      1.2 + rnd() * 3,
      (rnd() - 0.5) * 12,
      6 + rnd() * (6 + calm * 12),
      shade(accents[i % accents.length], (rnd() - 0.5) * 0.3),
      // Black and near-black clouds go muddy; they read better as streaks.
      (0.35 + calm * 0.3 + rnd() * 0.3) * (luminance(accents[i % accents.length]) < 0.08 ? 0.55 : 1),
    ),
  );
  const tones = base ? [...accents, ...accents, shade(base, -0.3), shade(base, 0.3)] : accents;
  const streaks = Array.from({ length: Math.round(50 + (1 - calm) * 80) }, () =>
    arc(
      18 + rnd() * 31,
      rnd() * TAU,
      0.2 + rnd() * 1.1,
      (rnd() - 0.5) * 7,
      0.25 + rnd() ** 2.5 * 1.6,
      shade(pick(tones), (rnd() - 0.5) * 0.3),
      0.4 + rnd() * 0.5,
    ),
  );
  const seed = () => Math.floor(rnd() * 900) + 1;
  return svgLayer(
    warp('c', seed(), 0.02, 22, 2.6) + warp('s', seed(), 0.03, 7, 0.3),
    `<g filter="url(#c)" opacity="${alpha}">${clouds.join('')}</g>` +
      `<g filter="url(#s)" opacity="${alpha}">${streaks.join('')}</g>`,
  );
}

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
 * irregular specks (`feTurbulence`), in two layers: faint flecks that only read as a
 * shimmer, and a scatter of bright glints that catch the eye. Kept thin, so the
 * disc's own colour stays the main thing. The size is set by the noise frequency, in the SVG's own units,
 * so the flecks scale with the record. Drawn as an SVG so it stays one background
 * layer that turns with the disc.
 */
function flakes(rnd: () => number): string {
  const layer = (id: string, seed: number, frequency: number, gain: number, cutoff: number, colour: string, opacity: number) => {
    const [r, g, b] = channels(colour).map(v => (v / 255).toFixed(3));
    return (
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="${seed}"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${gain} 0 0 0 ${-cutoff}"/>` +
      `</filter><rect width="100" height="100" filter="url(#${id})" opacity="${opacity}"/>`
    );
  };
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    // Cutoffs tuned by measuring: about 0.2% of the disc shows any fleck, and only a few hundredths of a percent glint bright.
    layer('a', Math.floor(rnd() * 900) + 1, 5.5, 34, 27.4, config.flake.fleck, 0.45) +
    layer('b', Math.floor(rnd() * 900) + 1, 5.5, 60, 51, config.flake.glint, 1) +
    '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Liquid: big opaque pools of the accent colour with hard, rounded edges, poured
 * round the label, with clear bubbles caught inside and droplets thrown off into
 * the clear. Each pool is a chain of circles along an arc, fat at the head and
 * thinning to a tail; the droplets nearby are scattered circles. A goo filter
 * (blur, then a steep alpha cut) melts them into one smooth shape, noise wobbles
 * the edge, a mask punches out the bubbles, and a faint blurred copy underneath
 * gives the haze where the colour thins out. Drawn as an SVG so it stays one
 * background layer that turns with the disc.
 *
 * It moves: every circle drifts on its own slow loop (CSS animations inside the
 * SVG, which still run in a background image), so the goo filter re-melts them
 * each frame and the pools ooze, droplets pinch off and rejoin, and bubbles
 * wander. The whole pour sloshes a few degrees back and forth on top of the spin.
 * Reduced motion keeps it still.
 */
function liquid(accents: string[], rnd: () => number): string {
  const at = (r: number, a: number) => [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as const;
  // A drift of up to `reach` in a random direction, over 5-11s, started part way through.
  const drift = (reach: number) => {
    const a = rnd() * Math.PI * 2;
    const d = reach * (0.4 + rnd() * 0.6);
    return ` style="--x:${num(Math.cos(a) * d)}px;--y:${num(Math.sin(a) * d)}px;animation-duration:${num(5 + rnd() * 6)}s;animation-delay:-${num(rnd() * 11)}s"`;
  };
  // One list of circles per pool: each is melted on its own, so two colours never smear together.
  const blobs: string[][] = [];
  const bubbles: string[] = [];
  const start = rnd() * Math.PI * 2;
  // The main pool sweeps most of the way round; a smaller one sits across from its head.
  const pools = [
    { from: start, sweep: 3.4 + rnd() * 0.9, head: 15 + rnd() * 3, colour: accents[0] },
    { from: start + Math.PI * (0.85 + rnd() * 0.3), sweep: 1 + rnd() * 0.8, head: 8 + rnd() * 3, colour: accents[1] ?? accents[0] },
  ];
  for (const pool of pools) {
    const circles: string[] = [];
    blobs.push(circles);
    const steps = Math.round(pool.sweep * 9);
    const wander = (rnd() - 0.5) * 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = pool.from + pool.sweep * t;
      // Keep the pool off the label and inside the rim as it drifts in and out.
      const size = Math.max(2.5, pool.head * (1 - t * 0.8) + (rnd() - 0.5) * 2.5);
      const r = Math.min(49 - size * 0.6, Math.max(18 + size * 0.7, 33 + wander * Math.sin(t * Math.PI) + (rnd() - 0.5) * 3));
      const [x, y] = at(r, a);
      circles.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(size)}" fill="${pool.colour}"${drift(size * 0.35)}/>`);
      // Bubbles sit in the body of the pool, mostly toward its edges.
      if (rnd() < 0.55) {
        const [bx, by] = at(r + (rnd() - 0.5) * size * 1.3, a + (rnd() - 0.5) * 0.12);
        bubbles.push(`<circle cx="${num(bx)}" cy="${num(by)}" r="${num(0.5 + rnd() ** 2 * 2.6)}"${drift(2)}/>`);
      }
    }
    // Droplets thrown off round the pool (some close enough to be pulled into it), with a fine spray past its ends.
    for (let i = 0; i < 26; i++) {
      const [x, y] = at(19 + rnd() * 30, pool.from + (rnd() * 1.5 - 0.25) * pool.sweep);
      circles.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(0.6 + rnd() ** 2 * 2.2)}" fill="${pool.colour}"${drift(4)}/>`);
    }
  }
  const seed = Math.floor(rnd() * 900) + 1;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    '<style>circle{animation:o ease-in-out infinite alternate}' +
    '.s{transform-origin:50px 50px;animation:s 13s ease-in-out infinite alternate}' +
    '@keyframes o{to{transform:translate(var(--x),var(--y))}}' +
    '@keyframes s{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>' +
    '<filter id="g" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" color-interpolation-filters="sRGB">' +
    `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${seed}" result="t"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
    '<feGaussianBlur in="d" stdDeviation="1.6"/>' +
    '<feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11"/>' +
    '</filter>' +
    '<filter id="h" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><feGaussianBlur stdDeviation="3.5"/></filter>' +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><g class="s" fill="#000">${bubbles.join('')}</g></mask>` +
    `<g filter="url(#h)" opacity="0.28"><g class="s">${blobs.flat().join('')}</g></g>` +
    `<g mask="url(#m)">${blobs.map(circles => `<g filter="url(#g)"><g class="s">${circles.join('')}</g></g>`).join('')}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Smoke: dark wisps curling through a coloured or clear disc. Marble's clouds
 * and streaks in faint black, bent harder and blurred more, so they drift like
 * smoke rather than vein like paint.
 */
function smoke(rnd: () => number): string {
  const clouds = Array.from({ length: 5 + Math.floor(rnd() * 3) }, () =>
    arc(20 + rnd() * 29, rnd() * TAU, 1 + rnd() * 2.5, (rnd() - 0.5) * 14, 5 + rnd() * 9, '#000', 0.25 + rnd() * 0.25),
  );
  const wisps = Array.from({ length: 30 + Math.floor(rnd() * 20) }, () =>
    arc(18 + rnd() * 31, rnd() * TAU, 0.3 + rnd() * 1.2, (rnd() - 0.5) * 8, 0.3 + rnd() ** 2 * 1.6, '#000', 0.15 + rnd() * 0.3),
  );
  const seed = () => Math.floor(rnd() * 900) + 1;
  return svgLayer(
    warp('c', seed(), 0.02, 26, 3.2) + warp('w', seed(), 0.035, 14, 0.9),
    `<g filter="url(#c)">${clouds.join('')}</g><g filter="url(#w)">${wisps.join('')}</g>`,
  );
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
    if (base === MIX_BASE) {
      // A mix over cream reads as a white disc, so one of the mix colours (picked from the text, so it
      // never changes) is the body, and the rest, cream included, are wound through it.
      const pick = Math.floor(seeded(`${text} mix`)() * MIXED.length);
      base = MIXED[pick];
      accents = [...MIXED.filter((_, i) => i !== pick), MIX_BASE];
    }
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
  if (pattern === 'marble') layers.push(marble(accents, rnd, translucent ? 0.8 : 0.95, base === CLEAR ? null : base));
  if (pattern === 'swirl') layers.push(swirl(accents, rnd));
  if (pattern === 'splatter') layers.push(splatter(accents, rnd));
  if (pattern === 'liquid') layers.push(liquid(accents, rnd));
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
    light,
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
