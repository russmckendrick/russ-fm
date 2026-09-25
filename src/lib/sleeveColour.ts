import type { AlbumColorPalette } from '@/hooks/useAlbumColors';

/**
 * Sleeve colour helpers for the player design.
 *
 * album-colors.json holds four swatches per sleeve, but the "accent" is often
 * near-black on dark covers. Pages need one bold colour to flood a hero, tint a
 * tile or colour a spine, so we score every candidate by saturation weighted
 * towards mid lightness and take the best. Nothing usable → a warm neutral.
 */

export const INK = '#0e0d0c';
export const CREAM = '#fbf7ef';
export const NEUTRAL_FLOOD = '#e8e2d6';
export const GROUND = '#0e0d0c';

/** Minimum score for a colour to count as "vivid" enough to flood with. */
const VIVID_THRESHOLD = 0.5;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function toHsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

/** How usable a colour is as a flood: 0 (grey/black/white) → ~2 (bold, mid-lightness). */
export function vividScore(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const { s, l } = toHsl(rgb);
  if (l <= 0.18 || l >= 0.85) return 0;
  return s * Math.min(l, 1 - l) * 4;
}

/** Hue in 0–1, used to sort the colour wall. */
export function hue(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? toHsl(rgb).h : 0;
}

function channel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
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

/** A softer secondary text colour for the given ink. */
export function subInk(ink: string): string {
  return ink === INK ? 'rgba(14,13,12,.7)' : 'rgba(251,247,239,.78)';
}

/**
 * The most vivid colour from a palette plus any extra candidates (e.g. Apple
 * Music artwork colours), or null when nothing clears the threshold.
 */
export function vividFrom(palette?: AlbumColorPalette | null, extra: Array<string | null | undefined> = []): string | null {
  const candidates = [palette?.accent, palette?.muted, ...extra].filter((c): c is string => !!c && !!parseHex(c));
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = vividScore(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= VIVID_THRESHOLD ? best : null;
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
}

/** Everything a page needs to paint itself in a sleeve's colours. */
export function floodFor(palette?: AlbumColorPalette | null, extra: Array<string | null | undefined> = []): Flood {
  const flood = vividFrom(palette, extra) ?? NEUTRAL_FLOOD;
  const ink = inkOn(flood);
  const bg = palette?.background && parseHex(palette.background) ? palette.background : '#1c1916';
  return { flood, ink, sub: subInk(ink), ground: bg === '#000000' ? '#161412' : bg };
}

/** Apple Music artwork colours from a detailed album JSON, as #hex strings. */
export function appleArtworkColours(services: unknown): string[] {
  const artwork = (services as { apple_music?: { raw_attributes?: { artwork?: Record<string, unknown> } } } | undefined)
    ?.apple_music?.raw_attributes?.artwork;
  if (!artwork) return [];
  return ['bgColor', 'textColor1', 'textColor2']
    .map(key => artwork[key])
    .filter((v): v is string => typeof v === 'string' && /^[a-f\d]{6}$/i.test(v))
    .map(v => `#${v}`);
}

/** The colour itself when it reads on `bg` (≥3:1), otherwise cream — for accents on dark grounds. */
export function readableOn(colour: string, bg: string): string {
  return contrast(colour, bg) >= 3 ? colour : CREAM;
}
