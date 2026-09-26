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
   * The <img> box in the stage (px), always the stage's full height. The photo
   * sits in its content box, after `extendLeft` of left padding and
   * `extendTop` of top padding, and the box runs `extendRight` past it. The
   * extensions show soft gradients of the photo's own edge colours (see
   * ArtistPortrait), which the element's filter, blend and fade treat exactly
   * like the photo.
   */
  left: number;
  width: number;
  photoWidth: number;
  photoHeight: number;
  extendLeft: number;
  extendTop: number;
  extendRight: number;
  /** Right fade in stage px: fully visible up to `fadeFrom`, gone by `fadeTo`. */
  fadeFrom: number;
  fadeTo: number;
}

/** Never shrink the photo below this share of the flood's height to fit a group. */
const MIN_HEIGHT = 0.85;

/**
 * Where the photo sits in the desktop hero. It is as tall as the flood
 * (shrunk a little, if need be, to fit a wide group, and then sat on the
 * flood's bottom edge with its top edge carried up), slid so every face ends
 * clear of the text, but never so far that the leftmost face leaves the page.
 * It runs on under the text (its right edge carried on) and fades there over
 * a long eased fade that starts after the faces: longer and finishing sooner
 * under the text when the backdrop and flood are far apart in lightness, so
 * the text keeps its contrast. It is carried to the page edge the same way
 * when it stops short of it.
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
  const clearance = harsh ? 150 : 110;
  const aspect = info.width / info.height;

  // What has to stay clear of the text: the faces, or without any, a band
  // round the focus (a body can run on under the fade).
  const faces = info.faces.length ? info.faces : null;
  const fx = info.focus?.[0] ?? 0.5;
  const span: [number, number] = faces
    ? [Math.min(...faces.map(f => f[0])), Math.max(...faces.map(f => f[0] + f[2]))]
    : [Math.max(0, fx - 0.12), Math.min(1, fx + 0.12)];

  // Only a group of faces shrinks the photo.
  let photoHeight = Math.round(stageH);
  const room = textX - clearance - 16;
  const spanShare = (span[1] - span[0]) * aspect;
  if (faces && spanShare * photoHeight > room && room > 0) photoHeight = Math.round(Math.max(stageH * MIN_HEIGHT, room / spanShare));
  const photoWidth = aspect * photoHeight;

  let photoLeft = Math.min(0, textX - clearance - span[1] * photoWidth);
  photoLeft = Math.round(Math.max(photoLeft, 16 - span[0] * photoWidth));
  const photoRight = photoLeft + photoWidth;

  // A long eased fade, placed so the text starts where the photo is mostly
  // gone (under a fifth left on a harsh step in lightness, half otherwise),
  // with the faces (`clearance`) still inside its flat opening stretch.
  const fadeLength = harsh ? 380 : 420;
  const fadeFrom = Math.max(0, textX - fadeLength * (harsh ? 0.63 : 0.5));
  const fadeTo = Math.min(stageW, fadeFrom + fadeLength);

  const boxLeft = Math.min(photoLeft, 0);
  const boxRight = Math.max(photoRight, fadeTo);

  return {
    stageWidth: stageW,
    stageHeight: stageH,
    left: boxLeft,
    width: boxRight - boxLeft,
    photoWidth,
    photoHeight,
    extendLeft: photoLeft - boxLeft,
    extendTop: Math.max(0, Math.round(stageH) - photoHeight),
    extendRight: boxRight - photoRight,
    fadeFrom,
    fadeTo,
  };
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
