/**
 * Which file an artist's photo sizes are made from, and where its 128px avatar
 * is cut, from its -image.json (scripts/generate-artist-images.js). Shared by
 * the build (src/lib/imageProcessor.ts) and the dev server's on-demand sizes
 * (vite.config.ts), so no React here.
 */

type Box = [number, number, number, number];

/** The fields of an artist's -image.json this needs. */
export interface PhotoNotes {
  width: number;
  height: number;
  faces?: Box[];
  people?: Box[];
  focus?: [number, number] | null;
  /** A fanart chosen as the artist photo in the scrapper (`{slug}-fanart0N.jpg`); else the -hi-res.jpg. */
  source?: string;
}

/** The artist photo's file name: the chosen fanart, or `{slug}-hi-res.jpg`. */
export function photoSourceFile(slug: string, notes: PhotoNotes | null | undefined): string {
  return notes?.source && /^[^/\\]+-fanart\d\d\.jpg$/.test(notes.source) ? notes.source : `${slug}-hi-res.jpg`;
}

/**
 * The square the avatar is cut from, in source px: round the faces (with room
 * for hair and shoulders, never tighter than the photo's short side over 1.8),
 * else the photo's focus, else the middle.
 */
export function avatarCrop(notes: PhotoNotes | null | undefined): { left: number; top: number; size: number } | null {
  if (!notes?.width || !notes.height) return null;
  const { width: w, height: h } = notes;
  const short = Math.min(w, h);
  let cx = w / 2;
  let cy = h / 2;
  let size = short;
  const faces = notes.faces ?? [];
  if (faces.length) {
    const x0 = Math.min(...faces.map(f => f[0])) * w;
    const x1 = Math.max(...faces.map(f => f[0] + f[2])) * w;
    const y0 = Math.min(...faces.map(f => f[1])) * h;
    const y1 = Math.max(...faces.map(f => f[1] + f[3])) * h;
    const face = Math.max(...faces.map(f => f[3])) * h;
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2 + face * 0.25;
    size = Math.min(short, Math.max(short / 1.8, Math.max(x1 - x0, y1 - y0) + face * 2.2));
  } else if (notes.focus) {
    cx = notes.focus[0] * w;
    cy = notes.focus[1] * h;
  }
  const clamp = (v: number, hi: number) => Math.round(Math.min(Math.max(v, 0), hi));
  const s = Math.round(size);
  return { left: clamp(cx - s / 2, w - s), top: clamp(cy - s / 2, h - s), size: s };
}

/**
 * avatarCrop for the file as it is now (`width`×`height`): the notes only
 * steer it while they still describe the file, the same proportions (an
 * upscaled photo keeps them, so the crop is scaled to its size). Null means
 * cut from the middle.
 */
export function avatarCropFor(notes: PhotoNotes | null | undefined, width: number, height: number): { left: number; top: number; size: number } | null {
  const c = avatarCrop(notes);
  if (!c || !notes || !width || !height) return null;
  const k = width / notes.width;
  if (Math.abs(height / notes.height - k) >= 0.01) return null;
  const size = Math.min(width, height, Math.round(c.size * k));
  return { left: Math.min(width - size, Math.round(c.left * k)), top: Math.min(height - size, Math.round(c.top * k)), size };
}
