/**
 * Shared pieces for the Open Graph cards (1200×630) drawn with satori:
 * scripts/generate-og-images.ts (albums, artists, the site card) and
 * scripts/generate-og-sections.ts (TV and genres).
 *
 * Cards use the player design: a sleeve's colours, Archivo condensed and
 * extended display type (static instances in scripts/og-fonts/), JetBrains
 * Mono for the small print, and the site's photo rooms with real artwork
 * showing through their cut-outs (`cutoutScene`).
 */
import satori from 'satori';
import sharp, { type OverlayOptions } from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const publicDir = path.join(root, 'public');
export const W = 1200;
export const H = 630;

export const INK = '#0e0d0c';
export const CREAM = '#fbf7ef';
export const NEUTRAL = { flood: '#e8e2d6', ink: INK, ground: '#1c1916', glow: '#e8e2d6', secondary: null as string | null, vivid: 0 };

export type Palette = typeof NEUTRAL;
export type Node = { type: string; props: Record<string, unknown> };
export type Box = { left: number; top: number; width: number; height: number };

const font = (file: string) => fs.readFile(path.join(root, 'scripts/og-fonts', file));
const fonts = [
  { name: 'Cond', data: await font('archivo-condensed-black.ttf'), weight: 900 as const, style: 'normal' as const },
  { name: 'Ext', data: await font('archivo-extended-black.ttf'), weight: 900 as const, style: 'normal' as const },
  { name: 'Semi', data: await font('archivo-semiexpanded-extrabold.ttf'), weight: 800 as const, style: 'normal' as const },
  { name: 'Mono', data: await font('jetbrains-mono-medium.ttf'), weight: 500 as const, style: 'normal' as const },
  { name: 'Grot', data: await font('hanken-grotesk-semibold.ttf'), weight: 600 as const, style: 'normal' as const },
];

/** A satori element. Every div gets flex so multi-child boxes lay out. */
export function h(type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node {
  const s = type === 'div' ? { display: 'flex', ...style } : style;
  return { type, props: { style: s, children, ...extra } };
}

/** Draw a card to `file`: JPEG for .jpg, else PNG. */
export async function render(node: Node, file: string) {
  const svg = await satori(node as never, { width: W, height: H, fonts });
  await fs.mkdir(path.dirname(file), { recursive: true });
  const img = sharp(Buffer.from(svg));
  if (file.endsWith('.jpg')) await img.jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  // A 256-colour palette (dithered) keeps a photo card near 250KB instead of 1MB, and reads the same.
  else await img.png({ palette: true, quality: 90, effort: 7, dither: 0.8, compressionLevel: 9 }).toFile(file);
}

export const wordmark = (colour: string, size = 26) => h('div', { fontFamily: 'Ext', fontSize: size, color: colour, letterSpacing: -0.5 }, 'RUSS.FM');

export const kicker = (text: string, colour: string, size = 20) =>
  h('div', { fontFamily: 'Mono', fontSize: size, color: colour, opacity: 0.75, letterSpacing: 2, textTransform: 'uppercase' }, text);

/** Condensed display size for text in a box: the longest word fits the width. */
export function condSize(text: string, width: number, max: number, min = 56, lines = 3) {
  const longest = Math.max(...text.toUpperCase().split(/\s+/).map(w => w.length), 1);
  // Archivo condensed black caps run about 0.56em wide (hyphens and W/M wider).
  const em = 0.56;
  let size = Math.min(max, width / (longest * em));
  // `lines` at most: shrink when the whole text would need more.
  if ((text.length * em * size) / width > lines) size = (width * lines) / (text.length * em);
  return Math.max(min, Math.floor(size));
}

/** Drop characters the Latin font subsets can't draw (they render as boxes). */
export const latin = (text: string) => text.replace(/[^ -ɏ‘-”–—…]/g, '').trim();

export const plural = (n: number, word: string) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;

export const hexRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** The band along a scene card's foot: the flood colour, text left, wordmark right. */
export function sceneCard(shot: string, shotHeight: number, p: Palette, left: Node[], right?: Node): Node {
  return h('div', { width: W, height: H, backgroundColor: p.flood, color: p.ink, flexDirection: 'column' }, [
    h('img', { width: W, height: shotHeight }, undefined, { src: shot, width: W, height: shotHeight }),
    h('div', { flex: 1, alignItems: 'center', padding: '0 56px', gap: 40 }, [
      h('div', { flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }, left),
      right ?? h('div', { flexDirection: 'column', alignItems: 'flex-end' }, [wordmark(p.ink, 24)]),
    ]),
  ]);
}

/** Something shown through a scene photo's cut-out. */
export interface Layer {
  /** The cut-out, in % of the photo. */
  box: Box;
  /** The artwork, sized to the box by `cutoutScene`; or an SVG/PNG already the box's size (`exact`). */
  input: Buffer | ((w: number, h: number) => Promise<Buffer>);
  /** Run under the cut-out's edge by this many px so no wall-coloured seam shows. */
  bleed?: number;
  /** A crop focus for cover-fitting, 0–1 across and down the artwork. */
  focus?: [number, number];
}

/**
 * A site photo with real artwork showing through its cut-outs (the album
 * page's listening rooms, the artists' poster walls, the /albums ledge),
 * cropped to a `width`×`height` window and tinted with the flood like the
 * pages do. `scale` is the photo's rendered width in px; `centre` (in % of
 * the photo) is kept in the middle of the window where the edges allow.
 * Returns a JPEG data URI.
 */
export async function cutoutScene({
  photo,
  aspect,
  layers,
  shade,
  tint,
  scale,
  centre,
  width = W,
  height,
}: {
  photo: string;
  aspect: number;
  layers: Layer[];
  /** A light-and-creases layer multiplied over the artwork: over the whole photo, or over one box. */
  shade?: { file: string; box?: Box };
  tint: string;
  scale: number;
  centre: [number, number];
  width?: number;
  height: number;
}): Promise<string> {
  const iw = Math.round(Math.max(scale, width, height * aspect));
  const ih = Math.round(iw / aspect);
  const px = (b: Box, bleed = 0) => ({
    left: Math.round((b.left / 100) * iw) - bleed,
    top: Math.round((b.top / 100) * ih) - bleed,
    width: Math.round((b.width / 100) * iw) + bleed * 2,
    height: Math.round((b.height / 100) * ih) + bleed * 2,
  });

  const under: OverlayOptions[] = [];
  for (const l of layers) {
    const b = px(l.box, l.bleed ?? 0);
    const input = typeof l.input === 'function' ? await l.input(b.width, b.height) : await fitCover(l.input, b.width, b.height, l.focus);
    // Keep each layer inside the canvas: sharp refuses overlays that run off it.
    const left = Math.max(0, b.left);
    const top = Math.max(0, b.top);
    const cropped = await sharp(input)
      .extract({ left: left - b.left, top: top - b.top, width: Math.min(b.width - (left - b.left), iw - left), height: Math.min(b.height - (top - b.top), ih - top) })
      .toBuffer();
    under.push({ input: cropped, left, top });
  }
  if (shade) {
    const b = shade.box ? px(shade.box) : { left: 0, top: 0, width: iw, height: ih };
    under.push({ input: await sharp(shade.file).resize(b.width, b.height, { fit: 'fill' }).toBuffer(), left: b.left, top: b.top, blend: 'multiply' });
  }

  const photoBuf = await sharp(photo).resize(iw, ih).png().toBuffer();
  const tintBuf = await sharp({ create: { width: iw, height: ih, channels: 4, background: { ...hexRgb(tint), alpha: 0.35 } } }).png().toBuffer();
  const tinted = await sharp(photoBuf)
    .composite([
      { input: tintBuf, blend: 'soft-light' },
      { input: photoBuf, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  // sharp extracts before it composites, so flatten first, then crop.
  const full = await sharp({ create: { width: iw, height: ih, channels: 3, background: '#000' } })
    .composite([...under, { input: tinted, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const cx = (centre[0] / 100) * iw;
  const cy = (centre[1] / 100) * ih;
  const left = Math.round(Math.min(iw - width, Math.max(0, cx - width / 2)));
  const top = Math.round(Math.min(ih - height, Math.max(0, cy - height / 2)));
  const shot = await sharp(full).extract({ left, top, width, height }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${shot.toString('base64')}`;
}

/** Cover-fit an image into w×h, cropping round `focus` (0–1) rather than the middle. */
export async function fitCover(input: Buffer | string, w: number, h: number, focus: [number, number] = [0.5, 0.5]): Promise<Buffer> {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const sw = meta.width ?? w;
  const sh = meta.height ?? h;
  const s = Math.max(w / sw, h / sh);
  const cw = Math.min(sw, Math.round(w / s));
  const ch = Math.min(sh, Math.round(h / s));
  const left = Math.round(Math.min(sw - cw, Math.max(0, focus[0] * sw - cw / 2)));
  const top = Math.round(Math.min(sh - ch, Math.max(0, focus[1] * sh - ch / 2)));
  return sharp(input).rotate().extract({ left, top, width: cw, height: ch }).resize(w, h, { fit: 'fill' }).toBuffer();
}
