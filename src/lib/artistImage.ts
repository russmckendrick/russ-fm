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
  width: number;
  height: number;
  faces: Box[];
  people: Box[];
  subject: Box | null;
  focus: [number, number] | null;
  backdrop: EdgeInfo & { tone: 'light' | 'dark' };
  edges: Record<'bottom', EdgeInfo> & Record<'top' | 'left' | 'right', EdgeInfo & { profile?: string[] }>;
  luminance: number;
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

export interface PortraitLayout {
  stageWidth: number;
  stageHeight: number;
  /**
   * The <img> box in the stage (px), always the stage's full height, from the
   * page edge. The photo sits at the left of it; the box runs `extendRight`
   * past the photo (a short lead-out, never a long strip) showing a soft
   * gradient of the photo's own right-edge colours, which the element's
   * filter, blend and fade treat exactly like the photo, so the end of the
   * fade isn't the photo's hard edge.
   */
  left: number;
  width: number;
  photoWidth: number;
  photoHeight: number;
  extendRight: number;
  /** Right fade in stage px: fully visible up to `fadeFrom`, gone by `fadeTo`. */
  fadeFrom: number;
  fadeTo: number;
}

/** How far past its edge the photo is carried on to soften the end of the fade. */
const LEAD_OUT = 96;

/**
 * Where the photo sits in the desktop hero. The hero's photo column is sized
 * to the photo (portraitColumn), so the photo is as tall as the flood, starts
 * at the page edge and ends about where the column does; the text takes the
 * rest of the width. The photo fades out over its right side and a short
 * lead-out past it, finishing just into the gap before the text (or under the
 * text when a wide photo is capped). The fade is longer on a harsh step in
 * lightness, and starts no earlier than just before the last face, as long as
 * that leaves it room.
 *
 * `stageW`/`stageH`: the stage; `textX`: where the text column starts, in
 * stage px; `harsh`: the backdrop and flood are far apart in lightness.
 */
export function portraitLayout(
  info: ArtistImageInfo,
  stageW: number,
  stageH: number,
  textX: number,
  harsh: boolean,
): PortraitLayout {
  const photoHeight = Math.round(stageH);
  const photoWidth = (info.width / info.height) * photoHeight;
  const photoRight = photoWidth;

  const length = harsh ? 340 : 300;
  let fadeTo = photoRight < textX ? Math.min(photoRight + LEAD_OUT, textX + 24) : Math.min(photoRight, textX + 120);
  fadeTo = Math.min(fadeTo, stageW);
  let fadeFrom = fadeTo - length;
  const faces = info.faces;
  if (faces.length) {
    const lastFace = Math.max(...faces.map(f => f[0] + f[2])) * photoWidth;
    fadeFrom = Math.max(fadeFrom, Math.min(lastFace - 40, fadeTo - 200));
  }

  const extendRight = Math.max(0, Math.round(fadeTo - photoRight));
  return {
    stageWidth: stageW,
    stageHeight: stageH,
    left: 0,
    width: photoWidth + extendRight,
    photoWidth,
    photoHeight,
    extendRight,
    fadeFrom: Math.max(0, fadeFrom),
    fadeTo,
  };
}

/**
 * The desktop hero's photo column: the photo's width at the stage's height
 * (the fixed row plus the 2.5rem of flood above and below), between 320px and
 * half the window, so the text starts where the photo ends and takes the rest.
 * Before the notes load, a 4:5 photo is assumed.
 */
export function portraitColumn(info: ArtistImageInfo | null | undefined, rowHeight: string): string {
  const aspect = info ? info.width / info.height : 0.8;
  return `clamp(320px, calc((${rowHeight} + 5rem) * ${aspect.toFixed(4)}), 50vw)`;
}

/**
 * An edge's smoothed colour profile as a gradient along that edge, for
 * carrying the photo on past it. Stops are spread over `length` px starting
 * `start` px in (the last colour runs on). Falls back to the edge's average.
 */
export function edgeGradient(
  edge: EdgeInfo & { profile?: string[] },
  direction: 'to bottom' | 'to right',
  start = 0,
  length?: number,
): string {
  const stops = edge.profile?.length ? edge.profile : [edge.colour, edge.colour];
  const at = (i: number) => {
    const share = i / (stops.length - 1);
    return length == null ? `${Math.round(share * 100)}%` : `${Math.round(start + share * length)}px`;
  };
  return `linear-gradient(${direction}, ${stops.map((c, i) => `${c} ${at(i)}`).join(', ')})`;
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
