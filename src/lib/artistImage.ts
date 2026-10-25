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
  /** The TheAudioDB fanart the desktop hero uses instead of the photo (v5), when the artist has any. */
  fanart?: ArtistFanart;
}

/** A photo as the desktop hero places it: its size, face / person / subject boxes ([x, y, w, h] fractions) and colour strips. */
export interface HeroPhoto {
  width: number;
  height: number;
  faces: Box[];
  people: Box[];
  salient: Box | null;
  /** Average colour of each vertical strip across the photo, left to right (hex). */
  columns: string[];
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

/**
 * What the desktop hero shows: the fanart when there is any, else the artist's
 * own photo; null for notes from before v5 (no colour strips), which keep the
 * older greyscale print (ArtistPortrait).
 */
export function heroPhotoOf(info: ArtistImageInfo): { fanart: string | null; photo: HeroPhoto } | null {
  if (info.fanart) return { fanart: info.fanart.file, photo: info.fanart };
  if (!info.columns?.length) return null;
  const s = info.subject;
  return {
    fanart: null,
    photo: {
      width: info.width,
      height: info.height,
      faces: info.faces,
      people: info.people,
      salient: s ? [s[0], s[1], s[2] - s[0], s[3] - s[1]] : null,
      columns: info.columns,
    },
  };
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
/** The right fade's length, and the shortest it gets when a face sits near the photo's right edge. */
const FADE_ROOM = 300;

/**
 * Where the photo sits in the desktop hero. The hero's photo column is sized
 * to the photo (portraitColumn), so the photo is as tall as the flood, starts
 * at the page edge and ends about where the column does; the text takes the
 * rest of the width. The photo fades out over its right side and a short
 * lead-out past it, finishing just into the gap before the text (or under the
 * text when a wide photo is capped). The fade starts no earlier than just
 * before the last face, as long as that leaves it room (FADE_ROOM: a photo
 * with someone at its right edge lets them go soft rather than keep a short
 * fade that reads as an edge). Used only when the desktop hero has no
 * ArtistHeroPhoto (its notes still loading, or the photo failing).
 *
 * `stageW`/`stageH`: the stage; `textX`: where the text column starts, in stage px.
 */
export function portraitLayout(info: ArtistImageInfo, stageW: number, stageH: number, textX: number): PortraitLayout {
  const photoHeight = Math.round(stageH);
  const photoWidth = (info.width / info.height) * photoHeight;
  const photoRight = photoWidth;

  const length = FADE_ROOM;
  let fadeTo = photoRight < textX ? Math.min(photoRight + LEAD_OUT, textX + 24) : Math.min(photoRight, textX + 120);
  fadeTo = Math.min(fadeTo, stageW);
  let fadeFrom = fadeTo - length;
  const faces = info.faces;
  if (faces.length) {
    const lastFace = Math.max(...faces.map(f => f[0] + f[2])) * photoWidth;
    fadeFrom = Math.max(fadeFrom, Math.min(lastFace - 40, fadeTo - FADE_ROOM));
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
 * (the fixed row, the 2.5rem of flood above and below, and the 84px header the
 * photo runs up under), between 320px and
 * half the window, so the text starts where the photo ends and takes the rest.
 * Before the notes load, a 4:5 photo is assumed.
 */
export function portraitColumn(info: ArtistImageInfo | null | undefined, rowHeight: string): string {
  const aspect = info ? info.width / info.height : 0.8;
  return `clamp(320px, calc((${rowHeight} + 5rem + 84px) * ${aspect.toFixed(4)}), 50vw)`;
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

/** The text's distance from the far page edge (px), as the hero's own padding. */
const heroPad = (viewW: number) => Math.max(56, (viewW - 1640) / 2 + 56);
/** Clear space between the photo's side and the text column (px). */
const FACE_GAP = 40;
/** The text column: 44% of the page, between these (px)… */
const TEXT_MIN = 440;
const TEXT_MAX = 760;
/** …narrowing to this when the faces need more room beside it. */
const TEXT_FLOOR = 320;

export interface HeroPhotoLayout {
  /** The side of the page the photo sits on; the text takes the other. */
  side: 'left' | 'right';
  /** The <img> box in the flood (px), the flood's full height, `offset` from the photo's own page edge (0 or less, cropping it). */
  width: number;
  height: number;
  offset: number;
  /** The fade towards the text, in px from the photo's page-edge side of the <img>. */
  fadeFrom: number;
  fadeTo: number;
  /** Where the text column starts, in px from the photo's page edge. */
  textStart: number;
  /** The hero's flood: the photo's own colour where it fades out (hex). */
  flood: string;
}

/**
 * Where the photo (fanart or the artist's own) sits in the desktop hero, in
 * its own colour, worked out as if the photo were on the left (a right-hand
 * photo is mirrored in and out):
 *  - it sits on the side its people are on, always at the flood's full height;
 *  - the text column is the same for every artist (44% of the page, 440–760px),
 *    narrowing (to 320px) only when the faces need more room beside it;
 *  - the faces are centred in the space beside the text: the photo slides
 *    outwards, cropping its outer edge, but never so far that the outermost
 *    face is cut, nor so far in that the page edge shows;
 *  - it fades out from just past the faces to just into the text, and the
 *    flood is the photo's own colour across that fade, so they meet without a step.
 * `viewW`: the page width; `heroH`: the flood's height (the hero row, 5rem and
 * the header the hero runs up under).
 */
export function heroPhotoLayout(photo: HeroPhoto, viewW: number, heroH: number): HeroPhotoLayout {
  const aspect = photo.width / photo.height || 16 / 9;
  const all = photo.faces.length ? photo.faces : photo.people.length ? photo.people : photo.salient ? [photo.salient] : [];
  const centre = all.length ? (Math.min(...all.map(b => b[0])) + Math.max(...all.map(b => b[0] + b[2]))) / 2 : 0.5;
  const side = centre <= 0.5 ? 'left' : 'right';
  const flip = (b: Box): Box => (side === 'left' ? b : [1 - b[0] - b[2], b[1], b[2], b[3]]);
  const faces = photo.faces.map(flip);
  const subject = all.map(flip);

  const height = heroH;
  const width = height * aspect;
  // Across the photo (fractions): the faces with room for hair either side, else the subject.
  const reach: [number, number] = faces.length
    ? [Math.max(0, Math.min(...faces.map(b => b[0] - b[2] * 0.35))), Math.min(1, Math.max(...faces.map(b => b[0] + b[2] * 1.35)))]
    : subject.length
      ? [Math.min(...subject.map(b => b[0])), Math.max(...subject.map(b => b[0] + b[2]))]
      : [0.3, 0.7];
  const reachW = (reach[1] - reach[0]) * width;

  const pad = heroPad(viewW);
  const textW = Math.min(TEXT_MAX, Math.max(TEXT_MIN, viewW * 0.44));
  // The text column, narrowed (to TEXT_FLOOR) when the faces need the room.
  const textStart = Math.max(viewW - pad - textW, Math.min(viewW - pad - TEXT_FLOOR, reachW + 2 * FACE_GAP));
  const region = textStart - FACE_GAP;
  // Faces centred in the region, within: the photo covering the page edge
  // (offset ≤ 0), the faces ending before the text, the outermost face on the page.
  const centred = region / 2 - ((reach[0] + reach[1]) / 2) * width;
  const offset = Math.max(8 - reach[0] * width, Math.min(0, region - reach[1] * width, centred));
  const facesEnd = offset + reach[1] * width;
  const fadeTo = Math.min(offset + width, textStart + 40);
  const fadeFrom = Math.max(offset, fadeTo - 260, Math.min(facesEnd + 8, fadeTo - 120));

  const at = (px: number) => (px - offset) / width;
  const [a, z] = side === 'left' ? [at(fadeFrom), at(fadeTo)] : [1 - at(fadeTo), 1 - at(fadeFrom)];
  return {
    side,
    width,
    height,
    offset,
    fadeFrom: fadeFrom - offset,
    fadeTo: fadeTo - offset,
    textStart,
    flood: averageColumns(photo.columns, a, z),
  };
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

/** A smootherstep fade to transparent from `from` to `to` px, as a CSS mask, in `direction`. */
export function fadeMask(from: number, to: number, direction: 'to right' | 'to left'): string {
  const stops: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const e = t * t * t * (t * (t * 6 - 15) + 10);
    stops.push(`rgb(0 0 0 / ${(1 - e).toFixed(3)}) ${(from + (to - from) * t).toFixed(1)}px`);
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
