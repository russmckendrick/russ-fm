import type { AlbumColorPalette } from '@/hooks/useAlbumColors';

/**
 * Sleeve colour helpers for the player design.
 *
 * scripts/generate-album-colors.js decides every album's colours at build time
 * (flood, ink, ground, glow, secondary), folding in Apple Music's artwork
 * colours, so every page shows the same colour for the same sleeve. These
 * helpers read those palettes and add the few things that depend on more
 * than one sleeve (blended floods).
 */

export const INK = '#0e0d0c';
export const CREAM = '#fbf7ef';
export const NEUTRAL_FLOOD = '#e8e2d6';
export const GROUND = '#0e0d0c';
/** Ground for a record with no palette at all. */
const FALLBACK_GROUND = '#1c1916';

/** `vivid` at or above this is a bold colour (colour strips, genre chips). */
export const BOLD_VIVID = 1;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function channel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dark ink or cream, whichever reads better on the given background. */
export function inkOn(bg: string): string {
  return contrast(bg, INK) >= contrast(bg, CREAM) ? INK : CREAM;
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Lighten (for dark ink) or darken (for cream ink) a colour in small steps
 * until the ink reads on it at `target` contrast, keeping its hue.
 */
function settleUnder(colour: string, ink: string, target: number): string {
  const rgb = parseHex(colour);
  if (!rgb) return colour;
  const toward = ink === INK ? 1 : 0;
  let out = colour;
  for (let t = 0; t <= 0.8 && contrast(out, ink) < target; t += 0.05) {
    out = toHex(rgb.map(c => c + (toward - c) * t) as [number, number, number]);
  }
  return out;
}

/**
 * A vertical flood blended through several sleeve colours (first at the top).
 * The ink is the one that reads on the top colour (which the nav also uses);
 * the other colours are lightened or darkened just enough for that ink to
 * read on them at 4.5:1 (body text). Returns the CSS background, the top colour and the ink.
 */
export function blendedFlood(colours: string[]): { background: string; top: string; ink: string } {
  const top = colours[0] ?? NEUTRAL_FLOOD;
  const ink = inkOn(top);
  const rest = colours
    .slice(1)
    .filter((c, i, all) => c !== top && all.indexOf(c) === i)
    .map(c => settleUnder(c, ink, 4.5));
  if (!rest.length) return { background: top, top, ink };
  // Hold the top colour for the first stretch so the nav and hero meet cleanly.
  const stops = rest.map((c, i) => `${c} ${Math.round(40 + (60 * (i + 1)) / rest.length)}%`);
  return { background: `linear-gradient(180deg, ${top} 0%, ${top} 12%, ${stops.join(', ')})`, top, ink };
}

/** A softer secondary text colour for the given ink. */
export function subInk(ink: string): string {
  return ink === INK ? 'rgba(14,13,12,.7)' : 'rgba(251,247,239,.78)';
}

/** The sleeve's bold colour, or null for monochrome sleeves (and missing palettes). */
export function vividFrom(palette?: AlbumColorPalette | null): string | null {
  return palette?.vivid ? palette.flood : null;
}

export interface Flood {
  /** Background colour for hero / panels. */
  flood: string;
  /** Text colour that reads on the flood. */
  ink: string;
  /** Secondary text on the flood. */
  sub: string;
  /** Dark sleeve background (vinyl labels, page grounds). */
  ground: string;
  /** The flood as an accent on the ground (≥3:1), keeping its hue. */
  glow: string;
  /** A second sleeve colour, or null. */
  secondary: string | null;
}

/** Everything a page needs to paint itself in a sleeve's colours. */
export function floodFor(palette?: AlbumColorPalette | null): Flood {
  if (!palette?.flood) {
    return { flood: NEUTRAL_FLOOD, ink: INK, sub: subInk(INK), ground: FALLBACK_GROUND, glow: NEUTRAL_FLOOD, secondary: null };
  }
  const { flood, ink, ground, glow, secondary } = palette;
  return { flood, ink, sub: subInk(ink), ground, glow, secondary };
}

/** A tile's colour bar: the flood, split with the secondary colour when there is one. */
export function colourBar(f: Pick<Flood, 'flood' | 'secondary'>): string {
  return f.secondary ? `linear-gradient(90deg, ${f.flood} 0 62%, ${f.secondary} 62% 100%)` : f.flood;
}

/**
 * Sort key for colour walls: bold sleeves by hue (0–1), then monochrome
 * sleeves after them, lightest first.
 */
export function colourSortKey(palette?: AlbumColorPalette | null): number {
  if (!palette) return 3;
  return palette.vivid ? palette.hue : 2 - luminance(palette.flood);
}
