import { useEffect, useState } from 'react';
import { getArtistImageInfoUrl } from '@/lib/image-utils';

type Box = [number, number, number, number];

interface EdgeInfo {
  colour: string;
  /** Relative luminance, 0–1. */
  luminance: number;
  /** 1 = a flat colour, lower = busier. */
  even: number;
}

/**
 * `<slug>-image.json`, written next to each artist photo by
 * scripts/generate-artist-images.js. Boxes are fractions of the photo,
 * origin top-left: faces/people as [x, y, w, h], subject as [x0, y0, x1, y1].
 */
export interface ArtistImageInfo {
  v: number;
  /**
   * A fanart chosen in the scrapper as the artist photo (`{slug}-fanart0N.jpg`):
   * these notes, the sizes the build makes and the full-size photo are all of
   * it instead of the downloaded `-hi-res.jpg`, which stays on disk.
   */
  source?: string;
  width: number;
  height: number;
  faces: Box[];
  people: Box[];
  subject: Box | null;
  focus: [number, number] | null;
  backdrop: EdgeInfo & { tone: 'light' | 'dark' };
  edges: Record<'bottom', EdgeInfo> & Record<'top' | 'left' | 'right', EdgeInfo & { profile?: string[] }>;
  luminance: number;
  /**
   * How colourful the photo is, 0–1 (v4): the 95th percentile of each pixel's
   * channel spread. Missing from older notes.
   */
  chroma?: number;
  /** Average colour of each vertical strip across the photo, left to right (hex; v5). */
  columns?: string[];
  /** Average colour of the bottom eighth of each of those strips (hex; v5). */
  bottoms?: string[];
  /** The TheAudioDB fanart the artist poster uses instead of the photo (v5), when the artist has any. */
  fanart?: ArtistFanart;
}

/** A photo's size, face / person / subject boxes ([x, y, w, h] fractions) and colour strips. */
export interface HeroPhoto {
  width: number;
  height: number;
  faces: Box[];
  people: Box[];
  salient: Box | null;
  /** Average colour of each vertical strip across the photo, left to right (hex). */
  columns: string[];
  /** Average colour of the bottom eighth of each strip (hex); missing from older notes. */
  bottoms?: string[];
}

/**
 * One of the artist's TheAudioDB fanart images, picked by
 * scripts/generate-artist-images.js (a colour photo unless they are all black
 * and white): a wide background photo with no text, 1280×720 in practice.
 */
export interface ArtistFanart extends HeroPhoto {
  /** `{slug}-fanart01.jpg` …, next to the hi-res photo. */
  file: string;
  chroma: number;
}

const infoCache = new Map<string, Promise<ArtistImageInfo | null>>();

/** Not loadDetailJson: its path clean-up rewrites any /artist/ JSON path to the artist's detail file. */
function loadImageInfo(url: string): Promise<ArtistImageInfo | null> {
  let pending = infoCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(res => (res.ok ? res.json() : null))
      // The dev server answers a missing file with index.html, which won't parse.
      .then(info => (info && typeof info.width === 'number' ? (info as ArtistImageInfo) : null))
      .catch(() => null);
    infoCache.set(url, pending);
  }
  return pending;
}

/**
 * The artist's image notes: `undefined` while loading, `null` when there are
 * none (a photo added since the script last ran).
 */
export function useArtistImageInfo(uriArtist: string | undefined): ArtistImageInfo | null | undefined {
  const [state, setState] = useState<{ uri?: string; info: ArtistImageInfo | null | undefined }>({ info: undefined });

  useEffect(() => {
    if (!uriArtist) return;
    let alive = true;
    loadImageInfo(getArtistImageInfoUrl(uriArtist)).then(info => {
      if (alive) setState({ uri: uriArtist, info });
    });
    return () => {
      alive = false;
    };
  }, [uriArtist]);

  return state.uri === uriArtist ? state.info : undefined;
}

/** object-position for the phone crop: the focus across, biased to the top. */
export function focusPosition(info: ArtistImageInfo | null | undefined): string | undefined {
  if (!info?.focus) return undefined;
  const [x, y] = info.focus;
  return `${Math.round(x * 100)}% ${Math.round(Math.max(0, y - 0.25) * 100)}%`;
}

/**
 * Where an artist photo sits in a round frame (ArtistCard), as percentages of
 * the frame, from the photo's notes. The `medium` photo is the original
 * centre-cropped to a square, so the crop is worked out on the original and
 * then placed in that square; when the faces fall outside it, `full` asks for
 * the hi-res original instead.
 */
export interface CircleCrop {
  full: boolean;
  width: number;
  height: number;
  left: number;
  top: number;
  /**
   * Where a hover zoom grows from, in the <img> box (%): the middle of the
   * faces when there are any, so the photo pushes in on them, else the
   * crop's centre.
   */
  originX: number;
  originY: number;
  /** Faces were found: the hover can push in harder. */
  faces: boolean;
}

/** Tightest crop: 1.6× into the 800px medium still fills a 2× card sharply. */
const MAX_ZOOM = 1.6;
/** How far the crop may run outside the centre square before the full photo is used, as a share of it. */
const FULL_SLACK = 0.04;

export function circleCrop(info: ArtistImageInfo): CircleCrop | null {
  const w = info.width;
  const h = info.height;
  const side = Math.min(w, h);

  // The square wanted, in original px: centre and side.
  let cx: number;
  let cy: number;
  let s: number;
  let ox: number | null = null;
  let oy: number | null = null;
  if (info.faces.length) {
    const faces = info.faces.map(([x, y, fw, fh]) => ({
      x: (x + fw / 2) * w,
      y: (y + fh / 2) * h,
      size: Math.max(fw * w, fh * h),
    }));
    const size = Math.max(...faces.map(f => f.size));
    const x0 = Math.min(...faces.map(f => f.x));
    const x1 = Math.max(...faces.map(f => f.x));
    const y0 = Math.min(...faces.map(f => f.y));
    const y1 = Math.max(...faces.map(f => f.y));
    ox = (x0 + x1) / 2;
    oy = (y0 + y1) / 2;
    // Faces a little above the middle, leaving room for shoulders.
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2 + size * 0.3;
    // Every face (and its hair) inside the circle, and never tighter than head and shoulders.
    const reach = Math.max(...faces.map(f => Math.hypot(f.x - cx, f.y - cy) + f.size * 0.8));
    s = Math.max(reach * 2.2, size * 3.2);
  } else if (info.people.length) {
    const x0 = Math.min(...info.people.map(p => p[0])) * w;
    const x1 = Math.max(...info.people.map(p => p[0] + p[2])) * w;
    const y0 = Math.min(...info.people.map(p => p[1])) * h;
    const y1 = Math.max(...info.people.map(p => p[1] + p[3])) * h;
    s = Math.max(x1 - x0, y1 - y0) * 1.05;
    cx = (x0 + x1) / 2;
    // Tall full-length figures keep their heads.
    cy = y0 + Math.min(y1 - y0, s) / 2;
  } else if (info.focus) {
    cx = info.focus[0] * w;
    cy = info.focus[1] * h;
    s = side;
  } else {
    return null;
  }
  s = Math.min(side, Math.max(s, side / MAX_ZOOM));

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // The centre square the medium photo was cut to.
  const mx = (w - side) / 2;
  const my = (h - side) / 2;
  // The crop kept inside the whole photo, then inside the centre square.
  const fx = clamp(cx - s / 2, 0, w - s);
  const fy = clamp(cy - s / 2, 0, h - s);
  const sx = clamp(fx, mx, mx + side - s);
  const sy = clamp(fy, my, my + side - s);
  const full = Math.max(Math.abs(fx - sx), Math.abs(fy - sy)) > side * FULL_SLACK;

  // The region the <img> shows: the whole photo, or the medium's square.
  const [rx, ry, rw, rh] = full ? [0, 0, w, h] : [mx, my, side, side];
  const [x, y] = full ? [fx, fy] : [sx, sy];
  const pct = (v: number) => Math.round(v * 10000) / 100;
  return {
    full,
    width: pct(rw / s),
    height: pct(rh / s),
    left: pct(-(x - rx) / s),
    top: pct(-(y - ry) / s),
    originX: pct(((ox ?? x + s / 2) - rx) / rw),
    originY: pct(((oy ?? y + s / 2) - ry) / rh),
    faces: ox != null,
  };
}

export interface PhoneCrop {
  /** object-position for the photo in the box (object-fit: cover). */
  position: string;
  /** The photo's own colour along the bottom of the crop (hex), or null without `bottoms`. */
  flood: string | null;
}

/**
 * How the artist's photo (fanart or their own) is cropped into a box
 * `boxAspect` wide over tall (the poster on the artist hero, PosterWall):
 * round the faces, else the people, else the subject. A photo wider than the box shows its full height and slides across
 * to centre them; a narrower one shows its full width with them in its upper
 * part. The flood is the average bottom colour of the strips the crop shows.
 */
export function phoneCrop(photo: HeroPhoto, boxAspect: number): PhoneCrop {
  const aspect = photo.width / photo.height || 1;
  const boxes = photo.faces.length ? photo.faces : photo.people.length ? photo.people : photo.salient ? [photo.salient] : [];
  const cx = boxes.length ? (Math.min(...boxes.map(b => b[0])) + Math.max(...boxes.map(b => b[0] + b[2]))) / 2 : 0.5;
  const cy = boxes.length ? (Math.min(...boxes.map(b => b[1])) + Math.max(...boxes.map(b => b[1] + b[3]))) / 2 : 0.4;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  let from = 0;
  let to = 1;
  let position: string;
  if (aspect > boxAspect) {
    // Wider than the box: full height, slid across to centre the faces.
    const shown = boxAspect / aspect;
    from = Math.min(1 - shown, Math.max(0, cx - shown / 2));
    to = from + shown;
    position = `${pct(from / (1 - shown))} 0%`;
  } else {
    // Narrower: full width, the faces in the upper part.
    const shown = aspect / boxAspect;
    const top = Math.min(1 - shown, Math.max(0, cy - shown * 0.4));
    position = `50% ${pct(shown < 1 ? top / (1 - shown) : 0)}`;
  }
  return { position, flood: photo.bottoms?.length ? averageColumns(photo.bottoms, from, to) : null };
}

/** The average of the strips covering [from, to] (fractions across the photo), as hex. */
function averageColumns(columns: string[], from: number, to: number): string {
  if (!columns.length) return '#000000';
  const n = columns.length;
  const first = Math.max(0, Math.min(n - 1, Math.floor(from * n)));
  const last = Math.max(first, Math.min(n - 1, Math.ceil(to * n) - 1));
  const sum = [0, 0, 0];
  for (let i = first; i <= last; i++) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(columns[i]);
    if (m) [1, 2, 3].forEach((k, j) => (sum[j] += parseInt(m[k], 16)));
  }
  const count = last - first + 1;
  return `#${sum.map(v => Math.round(v / count).toString(16).padStart(2, '0')).join('')}`;
}
